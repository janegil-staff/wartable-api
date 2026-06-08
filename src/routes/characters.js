// src/routes/characters.js — build a full showcase for any character (public).
// Also fires a fire-and-forget daily snapshot so ANY viewed character starts
// building calendar history (snapshot-on-view).
import { Router } from "express";
import { buildCharacterProfile } from "../services/characterProfile.js";
import { recordSnapshot } from "../services/snapshot.js";
const router = Router();

// GET /characters/:region/:realm/:name — full profile showcase.
router.get("/:region/:realm/:name", async (req, res, next) => {
  try {
    const { region, realm, name } = req.params;
    const profile = await buildCharacterProfile({ region, realm, name });

    // snapshot-on-view: record today's snapshot in the background so the
    // character's calendar fills over time. Never blocks or fails the response.
    if (!profile?.error) {
      recordSnapshot({ region, realm, name, profile }).catch(() => {});
    }

    res.json(profile);
  } catch (e) {
    if (e.response?.status === 404) return res.status(404).json({ error: "not_found" });
    next(e);
  }
});

export default router;