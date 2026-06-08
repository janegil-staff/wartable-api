// src/routes/wow.js — public WoW data lookups (client-credentials).
import { Router } from "express";
import { blizzard } from "../services/blizzard.js";
import { mapCharacter } from "../services/mapCharacter.js";

const router = Router();

const regionFrom = (req) => {
  const candidate = req.params.region || req.query.region;
  return blizzard.REGIONS.includes(candidate) ? candidate : "eu";
};

// ---- shared handlers -------------------------------------------------------
async function realmsHandler(req, res, next) {
  try { res.json(await blizzard.getRealms({ region: regionFrom(req) })); }
  catch (e) { next(e); }
}

async function characterHandler(req, res, next) {
  try {
    const region = regionFrom(req);
    const { realm, name } = req.params;
    const [profile, equipment] = await Promise.all([
      blizzard.getCharacterProfile({ region, realm, name }),
      blizzard.getCharacterEquipment({ region, realm, name }).catch(() => null),
    ]);
    const mapped = mapCharacter({ profile, equipment });
    if (!mapped) return res.status(404).json({ error: "character not found" });
    res.json(mapped);
  } catch (e) { next(e); }
}

async function characterEquipmentHandler(req, res, next) {
  try {
    const data = await blizzard.getCharacterEquipment({
      region: regionFrom(req), realm: req.params.realm, name: req.params.name,
    });
    res.json(data);
  } catch (e) { next(e); }
}

async function guildHandler(req, res, next) {
  try {
    const data = await blizzard.getGuild({
      region: regionFrom(req), realm: req.params.realm, name: req.params.name,
    });
    res.json(data);
  } catch (e) { next(e); }
}

async function guildRosterHandler(req, res, next) {
  try {
    const data = await blizzard.getGuildRoster({
      region: regionFrom(req), realm: req.params.realm, name: req.params.name,
    });
    res.json(data);
  } catch (e) { next(e); }
}

// ============================================================================
// TEMP raw passthrough routes — for inspecting Blizzard's real field shapes.
// Remove these once the normalized /events endpoint is built.
//   GET /wow/_raw/mplus/:realm/:name?region=eu          (keystone profile overview)
//   GET /wow/_raw/mplus/:realm/:name/:seasonId?region=eu (runs for one season)
//   GET /wow/_raw/raids/:realm/:name?region=eu
//   GET /wow/_raw/achievements/:realm/:name?region=eu
// ============================================================================
router.get("/_raw/mplus/:realm/:name", async (req, res, next) => {
  try {
    res.json(await blizzard.getMythicKeystoneProfile({
      region: regionFrom(req), realm: req.params.realm, name: req.params.name,
    }));
  } catch (e) { next(e); }
});

router.get("/_raw/mplus/:realm/:name/:seasonId", async (req, res, next) => {
  try {
    res.json(await blizzard.getMythicKeystoneSeason({
      region: regionFrom(req), realm: req.params.realm, name: req.params.name,
      seasonId: req.params.seasonId,
    }));
  } catch (e) { next(e); }
});

router.get("/_raw/raids/:realm/:name", async (req, res, next) => {
  try {
    res.json(await blizzard.getEncountersRaids({
      region: regionFrom(req), realm: req.params.realm, name: req.params.name,
    }));
  } catch (e) { next(e); }
});

router.get("/_raw/achievements/:realm/:name", async (req, res, next) => {
  try {
    res.json(await blizzard.getAchievements({
      region: regionFrom(req), realm: req.params.realm, name: req.params.name,
    }));
  } catch (e) { next(e); }
});

// ---- realms ----------------------------------------------------------------
router.get("/realms", realmsHandler);
router.get("/realms/:region", realmsHandler);

// ---- character -------------------------------------------------------------
router.get("/character/:realm/:name", characterHandler);
router.get("/character/:realm/:name/equipment", characterEquipmentHandler);
router.get("/characters/:region/:realm/:name", characterHandler);
router.get("/characters/:region/:realm/:name/equipment", characterEquipmentHandler);

// ---- guild -----------------------------------------------------------------
router.get("/guild/:realm/:name", guildHandler);
router.get("/guild/:realm/:name/roster", guildRosterHandler);
router.get("/guilds/:region/:realm/:name", guildHandler);
router.get("/guilds/:region/:realm/:name/roster", guildRosterHandler);

export default router;
