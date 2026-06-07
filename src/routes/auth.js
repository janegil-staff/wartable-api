// src/routes/auth.js — Battle.net OAuth → our JWT, + manual, + /me, + characters.
import { Router } from "express";
import crypto from "crypto";
import { blizzard } from "../services/blizzard.js";
import { User } from "../models/User.js";
import { signToken, verifyToken } from "../utils/jwt.js";
import { requireAuth } from "../middleware/auth.js";
import { ShareCode } from "../models/ShareCode.js";
import { env } from "../config/env.js";

const router = Router();

router.get("/bnet/login", (req, res) => {
  const region = blizzard.REGIONS.includes(req.query.region) ? req.query.region : "eu";
  const state = signToken({ region, nonce: crypto.randomBytes(8).toString("hex"), t: "oauth_state" });
  res.redirect(blizzard.getAuthorizeUrl({ region, state, redirectUri: env.OAUTH_REDIRECT_URI, scopes: ["wow.profile"] }));
});

router.get("/bnet/callback", async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state) return res.status(400).send("missing code/state");
  let region = "eu";
  try { const d = verifyToken(state); if (d.t !== "oauth_state") throw 0; region = d.region; }
  catch { return res.status(400).send("invalid state"); }

  try {
    const tok = await blizzard.exchangeCodeForToken({ region, code, redirectUri: env.OAUTH_REDIRECT_URI });
    const info = await blizzard.getUserInfo({ region, userToken: tok.access_token });
    let characters = [];
    try {
      const wow = await blizzard.getUserCharacters({ region, userToken: tok.access_token });
      characters = (wow.wow_accounts ?? []).flatMap((a) => a.characters ?? []).map((c) => ({
        name: c.name, realmSlug: c.realm?.slug, realmName: c.realm?.name, region,
        class: c.playable_class?.name, level: c.level, faction: c.faction?.type?.toLowerCase?.(),
      }));
    } catch {}
    const user = await User.findOneAndUpdate(
      { bnetId: String(info.id ?? info.sub) },
      { bnetId: String(info.id ?? info.sub), battletag: info.battletag, region,
        $setOnInsert: { displayName: info.battletag ?? "Adventurer" }, characters },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    const jwt = signToken({ id: user._id.toString() });
    return res.redirect(`${env.APP_REDIRECT_SCHEME}?token=${encodeURIComponent(jwt)}`);
  } catch (e) {
    console.error("[auth] callback:", e.response?.data ?? e.message);
    return res.status(502).send("battle.net auth failed");
  }
});

router.post("/manual", async (req, res) => {
  const displayName = (req.body?.displayName || "Guest").slice(0, 40);
  const user = await User.create({ displayName });
  res.json({ token: signToken({ id: user._id.toString() }), user: { id: user._id, displayName } });
});

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).lean();
    if (!user) return res.status(404).json({ error: "not_found" });
    res.json({
      id: user._id, displayName: user.displayName, battletag: user.battletag ?? null,
      region: user.region, characters: user.characters ?? [],
    });
  } catch (e) { next(e); }
});

// DELETE /auth/me — permanently delete the user's account + their share codes.
router.delete("/me", requireAuth, async (req, res, next) => {
  try {
    await ShareCode.deleteMany({ owner: req.user.id });
    await User.findByIdAndDelete(req.user.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
