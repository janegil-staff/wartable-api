// src/routes/characters.js — build a full showcase for any character (public).
import { Router } from "express";
import { buildCharacterProfile } from "../services/characterProfile.js";

const router = Router();

// GET /characters/:region/:realm/:name — full profile showcase.
router.get("/:region/:realm/:name", async (req, res, next) => {
  try {
    const { region, realm, name } = req.params;
    const profile = await buildCharacterProfile({ region, realm, name });
    res.json(profile);
  } catch (e) {
    if (e.response?.status === 404) return res.status(404).json({ error: "not_found" });
    next(e);
  }
});

export default router;
