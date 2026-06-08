// src/routes/progress.js — per-day activity digest for a character.
// GET /progress/:region/:realm/:name/day/:date
import { Router } from "express";
import { getDayDigest } from "../services/snapshot.js";
const router = Router();

router.get("/:region/:realm/:name/day/:date", async (req, res, next) => {
  try {
    const { region, realm, name, date } = req.params;
    const data = await getDayDigest({ region, realm, name, date });
    res.json(data);
  } catch (e) {
    next(e);
  }
});

export default router;