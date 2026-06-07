// src/services/characterProfile.js — full character showcase, 100% Blizzard API.
// Identity + gear + Mythic+ (raw runs, no third-party "io score") + raid
// progress + achievement points. Each section best-effort; missing data won't
// fail the whole profile.
import { blizzard } from "./blizzard.js";

const slug = (s) => String(s).toLowerCase().trim().replace(/['’]/g, "").replace(/\s+/g, "-");

export async function buildCharacterProfile({ region = "eu", realm, name }) {
  const r = slug(realm);
  const out = { region, realm: r, name, builtAt: new Date().toISOString() };

  // Identity + item level
  try {
    const p = await blizzard.getCharacterProfile({ region, realm: r, name });
    out.name = p.name ?? name;
    out.class = p.character_class?.name;
    out.spec = p.active_spec?.name;
    out.race = p.race?.name;
    out.gender = p.gender?.name;
    out.level = p.level;
    out.faction = p.faction?.type?.toLowerCase?.();
    out.ilvl = p.equipped_item_level ?? p.average_item_level;
    out.title = p.active_title?.display_string ?? p.active_title?.name;
    out.guild = p.guild ? { name: p.guild.name, realm: p.guild.realm?.slug } : null;
    out.achievementPoints = p.achievement_points;
    out.realmName = p.realm?.name;
  } catch { out.error = "profile_unavailable"; }

  // Equipment (with item icons resolved in parallel, best-effort)
  try {
    const eq = await blizzard.getCharacterEquipment({ region, realm: r, name });
    const items = eq.equipped_items ?? [];
    out.equipment = await Promise.all(items.map(async (it) => {
      let icon = null;
      try {
        const itemId = it.item?.id;
        if (itemId) {
          const media = await blizzard.getItemMedia({ region, itemId });
          icon = (media.assets ?? []).find((a) => a.key === "icon")?.value ?? null;
        }
      } catch { /* icon optional */ }
      return {
        slot: it.slot?.type,
        name: it.name,
        ilvl: it.level?.value,
        quality: it.quality?.type,
        icon,
        enchant: (it.enchantments ?? []).map((e) => e.display_string).filter(Boolean),
      };
    }));
  } catch { out.equipment = []; }

  // Character render (the posed 3D image) + avatar
  try {
    const media = await blizzard.getCharacterMedia({ region, realm: r, name });
    const assets = media.assets ?? [];
    out.render = assets.find((a) => a.key === "main-raw")?.value
      ?? assets.find((a) => a.key === "main")?.value ?? null;
    out.avatar = assets.find((a) => a.key === "avatar")?.value ?? null;
    out.inset = assets.find((a) => a.key === "inset")?.value ?? null;
  } catch { /* render optional */ }

  // Mythic+ — Blizzard's own keystone profile (current season).
  try {
    const mk = await blizzard.getMythicKeystoneProfile({ region, realm: r, name });
    const current = mk.current_period?.best_runs ?? [];
    out.mythicPlus = {
      currentRating: mk.current_mythic_rating?.rating ?? null, // Blizzard's in-game M+ rating (not io)
      bestRuns: (current.length ? current : (mk.seasons?.[0]?.best_runs ?? []))
        .slice(0, 10)
        .map((run) => ({
          dungeon: run.dungeon?.name,
          level: run.keystone_level,
          duration: run.duration,
          completed: run.is_completed_within_time,
        })),
    };
  } catch { out.mythicPlus = { currentRating: null, bestRuns: [] }; }

  // Raid progress — encounters/raids gives kills per boss/difficulty.
  try {
    const raids = await blizzard.getRaidEncounters({ region, realm: r, name });
    const expansions = raids.expansions ?? [];
    const latest = expansions[expansions.length - 1];
    out.raids = (latest?.instances ?? []).map((inst) => ({
      name: inst.instance?.name,
      modes: (inst.modes ?? []).map((m) => ({
        difficulty: m.difficulty?.name,
        completed: m.progress?.completed_count,
        total: m.progress?.total_count,
      })),
    }));
  } catch { out.raids = []; }

  // Achievements — full list (this is a large payload; best-effort).
  try {
    const ac = await blizzard.getAchievementsSummary({ region, realm: r, name });
    out.achievementPoints = ac.total_points ?? out.achievementPoints;
    out.achievementsList = (ac.achievements ?? [])
      .filter((a) => a.completed_timestamp) // only earned
      .map((a) => ({
        id: a.id,
        name: a.achievement?.name,
        completedAt: a.completed_timestamp,
      }))
      .sort((x, y) => (y.completedAt ?? 0) - (x.completedAt ?? 0)); // newest first
    out.achievementCount = out.achievementsList.length;
  } catch { out.achievementsList = []; }

  // Statistics (the character-sheet stats)
  try {
    const st = await blizzard.getCharacterStatistics({ region, realm: r, name });
    out.stats = {
      health: st.health, power: st.power, powerType: st.power_type?.name,
      strength: st.strength?.effective, agility: st.agility?.effective,
      intellect: st.intellect?.effective, stamina: st.stamina?.effective,
      crit: st.melee_crit?.value ?? st.spell_crit?.value,
      haste: st.melee_haste?.value ?? st.spell_haste?.value,
      mastery: st.mastery?.value, versatility: st.versatility_damage_done_bonus,
    };
  } catch { out.stats = null; }

  // Specialization / talent loadout name
  try {
    const sp = await blizzard.getCharacterSpecializations({ region, realm: r, name });
    out.activeSpec = sp.active_specialization?.name;
    const loadout = (sp.specializations ?? []).find((x) => x.specialization?.name === out.activeSpec);
    out.talentLoadout = loadout?.loadouts?.find((l) => l.is_active)?.talent_loadout_code ?? null;
  } catch { /* optional */ }

  // PvP ratings (2v2, 3v3, RBG)
  try {
    const brackets = ["2v2", "3v3", "rbg"];
    const results = await Promise.all(brackets.map((b) =>
      blizzard.getPvpBracket({ region, realm: r, name, bracket: b }).then((d) => ({ b, rating: d.rating })).catch(() => null)
    ));
    const pvp = {};
    results.forEach((x) => { if (x && x.rating) pvp[x.b] = x.rating; });
    out.pvp = Object.keys(pvp).length ? pvp : null;
  } catch { out.pvp = null; }

  // Professions
  try {
    const pr = await blizzard.getCharacterProfessions({ region, realm: r, name });
    out.professions = (pr.primaries ?? []).map((p) => ({
      name: p.profession?.name,
      tier: (p.tiers ?? [])[0]?.tier?.name,
      skill: (p.tiers ?? [])[0]?.skill_points,
      max: (p.tiers ?? [])[0]?.max_skill_points,
    }));
  } catch { out.professions = []; }

  // Collections — mounts / pets / toys (counts; lists best-effort)
  try {
    const [m, pe, to] = await Promise.all([
      blizzard.getCollectionsMounts({ region, realm: r, name }).catch(() => null),
      blizzard.getCollectionsPets({ region, realm: r, name }).catch(() => null),
      blizzard.getCollectionsToys({ region, realm: r, name }).catch(() => null),
    ]);
    out.collections = {
      mounts: m?.mounts?.length ?? 0,
      pets: pe?.pets?.length ?? 0,
      toys: to?.toys?.length ?? 0,
    };
  } catch { out.collections = null; }

  // Titles — all earned + active
  try {
    const ti = await blizzard.getCharacterTitles({ region, realm: r, name });
    out.activeTitle = ti.active_title?.name ?? out.title;
    out.titles = (ti.titles ?? []).map((x) => x.name).filter(Boolean);
  } catch { out.titles = []; }

  // Appearance — basic visual info (race/face/items rendered set)
  try {
    const ap = await blizzard.getCharacterAppearance({ region, realm: r, name });
    out.appearance = {
      faceVariation: ap.face_variation,
      skinColor: ap.skin_color,
      hairColor: ap.hair_color,
      items: (ap.items ?? []).map((it) => ({ slot: it.slot?.type, id: it.item_appearance_modifier_id })),
    };
  } catch { out.appearance = null; }

  // Reputations — standing with each faction (best-effort, can be large)
  try {
    const rep = await blizzard.getCharacterReputations({ region, realm: r, name });
    out.reputations = (rep.reputations ?? []).map((x) => ({
      faction: x.faction?.name,
      standing: x.standing?.tier?.name ?? x.standing?.name,
      value: x.standing?.value,
      max: x.standing?.max,
    })).filter((x) => x.faction);
  } catch { out.reputations = []; }

  return out;
}
