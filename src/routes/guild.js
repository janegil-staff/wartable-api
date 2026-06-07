// src/routes/guild.js — guild view: info + roster + recent activity (Blizzard).
import { Router } from "express";
import { blizzard } from "../services/blizzard.js";

const router = Router();

// GET /guild/:region/:realm/:name — guild header + roster + activity feed.
router.get("/:region/:realm/:name", async (req, res, next) => {
  try {
    const { region, realm, name } = req.params;
    const out = { region, realm, name };

    try {
      const g = await blizzard.getGuild({ region, realm, name });
      out.name = g.name;
      out.faction = g.faction?.type?.toLowerCase?.();
      out.realmName = g.realm?.name;
      out.memberCount = g.member_count;
      out.achievementPoints = g.achievement_points;
      out.created = g.created_timestamp;
    } catch { out.error = "guild_unavailable"; }

    try {
      const r = await blizzard.getGuildRoster({ region, realm, name });
out.roster = (r.members ?? [])
        .map((m) => ({
          name: m.character?.name,
          level: m.character?.level,
          // class/race may come back as a name or only an id depending on locale
          class: m.character?.playable_class?.name
            ?? (typeof m.character?.playable_class === "object" ? null : m.character?.playable_class),
          race: m.character?.playable_race?.name,
          rank: m.rank, // 0 = GM
        }))
        .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || (b.level ?? 0) - (a.level ?? 0));
    } catch { out.roster = []; }

    try {
      const a = await blizzard.getGuildActivity({ region, realm, name });
      out.activity = (a.activities ?? []).slice(0, 25).map((act) => ({
        type: act.activity?.type,
        timestamp: act.timestamp,
        characterName: act.character_achievement?.character?.name
          ?? act.encounter_completed?.encounter?.name
          ?? null,
        detail: act.character_achievement?.achievement?.name
          ?? act.encounter_completed?.encounter?.name
          ?? act.activity?.type,
      }));
    } catch { out.activity = []; }

    res.json(out);
  } catch (e) {
    if (e.response?.status === 404) return res.status(404).json({ error: "not_found" });
    next(e);
  }
});

export default router;
