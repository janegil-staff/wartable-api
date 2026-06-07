// src/routes/leaderboards.js — Mythic+ / raid / PvP leaderboards (game data).
import { Router } from "express";
import { blizzard } from "../services/blizzard.js";

const router = Router();
const cache = {};
const TTL = 10 * 60 * 1000;
async function cached(key, fn) {
  const h = cache[key];
  if (h && Date.now() - h.at < TTL) return h.val;
  const val = await fn();
  cache[key] = { val, at: Date.now() };
  return val;
}

// GET /leaderboards/raid/:raid/:faction?region=eu — Hall of Fame (top guilds)
router.get("/raid/:raid/:faction", async (req, res, next) => {
  try {
    const region = ["us", "eu", "kr", "tw"].includes(req.query.region) ? req.query.region : "eu";
    const { raid, faction } = req.params;
    const data = await cached(`raid-${region}-${raid}-${faction}`,
      () => blizzard.getMythicRaidLeaderboard({ region, raid, faction }));
    const entries = (data.entries ?? []).slice(0, 100).map((e) => ({
      rank: e.rank,
      guild: e.guild?.name,
      realm: e.guild?.realm?.name,
      faction: e.faction?.type,
      timestamp: e.timestamp,
    }));
    res.json({ region, raid, faction, entries });
  } catch (e) {
    if (e.response?.status === 404) return res.status(404).json({ error: "not_found" });
    next(e);
  }
});

// GET /leaderboards/pvp/:bracket?region=eu — current season PvP leaderboard
router.get("/pvp/:bracket", async (req, res, next) => {
  try {
    const region = ["us", "eu", "kr", "tw"].includes(req.query.region) ? req.query.region : "eu";
    const bracket = ["2v2", "3v3", "rbg"].includes(req.params.bracket) ? req.params.bracket : "3v3";
    const seasons = await cached(`pvpseasons-${region}`, () => blizzard.getPvpSeasonsIndex({ region }));
    const season = seasons.current_season?.id ?? (seasons.seasons ?? []).slice(-1)[0]?.id;
    if (!season) return res.json({ region, bracket, entries: [] });
    const lb = await cached(`pvp-${region}-${season}-${bracket}`,
      () => blizzard.getPvpLeaderboard({ region, season, bracket }));
    const entries = (lb.entries ?? []).slice(0, 100).map((e) => ({
      rank: e.rank,
      name: e.character?.name,
      realm: e.character?.realm?.slug,
      rating: e.rating,
      faction: e.faction?.type,
    }));
    res.json({ region, bracket, season, entries });
  } catch (e) {
    if (e.response?.status === 404) return res.status(404).json({ error: "not_found" });
    next(e);
  }
});

export default router;
