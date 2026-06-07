// src/routes/thisweek.js — app-level "This Week" dashboard data.
// M+ affixes, WoW Token price, realm status. Cached briefly in-memory.
import { Router } from "express";
import { blizzard } from "../services/blizzard.js";

const router = Router();
const cache = {};
const TTL = 10 * 60 * 1000; // 10 min

async function cached(key, fn) {
  const hit = cache[key];
  if (hit && Date.now() - hit.at < TTL) return hit.val;
  const val = await fn();
  cache[key] = { val, at: Date.now() };
  return val;
}

// GET /thisweek?region=eu
router.get("/", async (req, res, next) => {
  try {
    const region = ["us", "eu", "kr", "tw"].includes(req.query.region) ? req.query.region : "eu";
    const out = { region };

    // WoW Token price (value is in copper; convert to gold)
    try {
      const tok = await cached(`token-${region}`, () => blizzard.getWowTokenPrice({ region }));
      out.token = { gold: tok.price ? Math.round(tok.price / 10000) : null, updated: tok.last_updated_timestamp };
    } catch { out.token = null; }

    // M+ affixes (the index lists all; the *active* set needs the keystone
    // leaderboard period — we surface the affix list as reference for now)
    try {
      const aff = await cached(`affix-${region}`, () => blizzard.getMythicKeystoneAffixes({ region }));
      out.affixes = (aff.affixes ?? []).slice(0, 12).map((a) => ({ id: a.id, name: a.name }));
    } catch { out.affixes = []; }

    res.json(out);
  } catch (e) { next(e); }
});

export default router;
