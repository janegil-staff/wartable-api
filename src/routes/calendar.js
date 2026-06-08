// src/routes/calendar.js — one month of calendar data for a character.
// GET /calendar?region&realm&name&from&to[&guildRealm&guildName]
import { Router } from "express";
import { getCalendar } from "../services/snapshot.js";
const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const { region = "eu", realm, name, from, to } = req.query;
    if (!realm || !name || !from || !to) {
      return res.status(400).json({ error: "missing_params" });
    }
    const data = await getCalendar({ region, realm, name, from, to });
    res.json(data);
  } catch (e) {
    next(e);
  }
});

export default router;