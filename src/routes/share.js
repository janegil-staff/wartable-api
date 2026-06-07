// src/routes/share.js — share a single character showcase by code.
import { Router } from "express";
import { ShareCode } from "../models/ShareCode.js";
import { generateShareCode, normalizeCode } from "../utils/shareCode.js";
import { buildCharacterProfile } from "../services/characterProfile.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
const CACHE_MS = 3 * 60 * 60 * 1000;
const isStale = (at) => !at || Date.now() - new Date(at).getTime() > CACHE_MS;

// POST /share  (auth) — make a code for a character. body: { region, realmSlug, name, label? }
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const { region = "eu", realmSlug, name, label } = req.body;
    if (!realmSlug || !name) return res.status(400).json({ error: "realm_and_name_required" });
    let code;
    for (let i = 0; i < 20; i++) { code = generateShareCode(); if (!(await ShareCode.exists({ code }))) break; }
    const TTL_MS = 10 * 60 * 1000; // 10-minute code lifetime
    const doc = await ShareCode.create({
      code, owner: req.user.id, character: { region, realmSlug, name }, label,
      expiresAt: new Date(Date.now() + TTL_MS),
    });
    res.status(201).json({
      code: doc.code, label: doc.label,
      expiresAt: doc.expiresAt,
      ttlSeconds: Math.round((doc.expiresAt - Date.now()) / 1000),
    });
  } catch (e) { next(e); }
});

// GET /share/:code — public view, refreshes snapshot when stale.
router.get("/:code", async (req, res, next) => {
  try {
    const code = normalizeCode(req.params.code);
    const doc = await ShareCode.findOne({ code, active: true });
    if (!doc) return res.status(404).json({ error: "not_found" });
    if (doc.expiresAt && doc.expiresAt.getTime() < Date.now())
      return res.status(410).json({ error: "expired" });
    if (!doc.snapshot || isStale(doc.snapshotAt)) {
      doc.snapshot = await buildCharacterProfile({
        region: doc.character.region, realm: doc.character.realmSlug, name: doc.character.name,
      });
      doc.snapshotAt = new Date();
    }
    doc.viewCount += 1;
    await doc.save();
    res.json({ label: doc.label ?? null, character: doc.snapshot, updatedAt: doc.snapshotAt });
  } catch (e) { next(e); }
});

// GET /share  (auth) — my codes.
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const codes = await ShareCode.find({ owner: req.user.id, active: true })
      .select("code label character viewCount createdAt").sort({ createdAt: -1 }).lean();
    res.json(codes);
  } catch (e) { next(e); }
});

// DELETE /share/:code (auth, owner)
router.delete("/:code", requireAuth, async (req, res, next) => {
  try {
    const doc = await ShareCode.findOneAndUpdate(
      { code: normalizeCode(req.params.code), owner: req.user.id }, { active: false }, { new: true });
    if (!doc) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
