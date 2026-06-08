// src/services/snapshot.js — write daily snapshots and read them back for the
// calendar grid and the day-detail digest.
//
// "played" model: a day is marked played when the character's last-login
// timestamp is newer than it was at the previous snapshot. Because Blizzard
// only exposes the MOST RECENT login (no history), the calendar fills forward
// from the first snapshot — it cannot backfill days before tracking started.
import { Snapshot } from "../models/Snapshot.js";
import { User } from "../models/User.js";
import { buildCharacterProfile } from "./characterProfile.js";

const slug = (s) =>
  String(s).toLowerCase().trim().replace(/['’]/g, "").replace(/\s+/g, "-");

export function dayKey(d = new Date()) {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

function totalBossKills(profile) {
  let n = 0;
  (profile?.raids ?? []).forEach((r) =>
    (r.modes ?? []).forEach((m) => {
      n += m.completed ?? 0;
    }),
  );
  return n;
}

function loginTs(profile) {
  const v = profile?.lastLogin;
  if (v == null) return null;
  return typeof v === "number" ? v : Date.parse(v) || null;
}

// Build + upsert today's snapshot for one character. Derives `played` by
// comparing the login timestamp to the most recent earlier snapshot.
export async function recordSnapshot({ region = "eu", realm, name }) {
  const realmSlug = slug(realm);
  const date = dayKey();

  const profile = await buildCharacterProfile({ region, realm: realmSlug, name });
  if (profile?.error) {
    return { written: false, reason: profile.error };
  }

  const thisLogin = loginTs(profile);

  // most recent earlier snapshot (any prior day) for this character
  const prev = await Snapshot.findOne({
    region,
    realmSlug,
    name,
    date: { $lt: date },
  })
    .sort({ date: -1 })
    .select("lastLogin")
    .lean();

  const prevLogin = prev?.lastLogin ?? null;
  // played if we have a login and it advanced (or it's the first ever and they
  // logged in at all — first snapshot can't prove "played today", so default
  // to false unless the login is within the last 24h of now).
  let played = false;
  if (thisLogin != null) {
    if (prevLogin != null) {
      played = thisLogin > prevLogin;
    } else {
      played = Date.now() - thisLogin < 24 * 60 * 60 * 1000;
    }
  }

  const doc = {
    region,
    realmSlug,
    name,
    date,
    ilvl: profile.ilvl ?? null,
    mythicRating: profile.mythicPlus?.currentRating ?? null,
    achievementPoints: profile.achievementPoints ?? null,
    level: profile.level ?? null,
    bossKills: totalBossKills(profile),
    lastLogin: thisLogin,
    played,
    raids: profile.raids ?? [],
    profile,
  };

  await Snapshot.updateOne(
    { region, realmSlug, name, date },
    { $set: doc },
    { upsert: true },
  );

  return { written: true, date, played, ilvl: doc.ilvl };
}

// Snapshot every character tracked across all users (used by the cron and the
// manual snapshot-now script). De-duplicates identical characters. Spaces out
// requests to stay under Blizzard's rate limit (each character = ~15 API calls).
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function recordAllTracked({ delayMs = 600 } = {}) {
  const users = await User.find({}).select("characters").lean();
  const seen = new Set();
  const targets = [];
  users.forEach((u) => {
    (u.characters ?? []).forEach((c) => {
      const key = `${c.region}|${slug(c.realmSlug)}|${String(c.name).toLowerCase()}`;
      if (seen.has(key)) return;
      seen.add(key);
      targets.push({ region: c.region, realm: c.realmSlug, name: c.name });
    });
  });

  const results = [];
  for (const tgt of targets) {
    try {
      const r = await recordSnapshot(tgt);
      results.push({ ...tgt, ...r });
    } catch (e) {
      results.push({ ...tgt, written: false, reason: e.message });
    }
    await sleep(delayMs); // throttle between characters
  }
  return { total: targets.length, written: results.filter((r) => r.written).length, results };
}

// ── Reads for the calendar screen ──

// Weekly reset days (Wednesday in EU, Tuesday in US) within [from,to], plus
// current M+ affixes if we can derive them. Kept simple/standalone.
function buildSchedule({ region, from, to }) {
  const resetDow = region === "us" ? 2 : 3; // Tue=2, Wed=3
  const resets = [];
  const start = new Date(from + "T00:00:00Z");
  const end = new Date(to + "T00:00:00Z");
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() === resetDow) resets.push(dayKey(d));
  }
  return { resets, affixes: [] };
}

// GET /calendar — returns { progress:{snapshots}, charEvents, schedule }.
export async function getCalendar({ region = "eu", realm, name, from, to }) {
  const realmSlug = slug(realm);
  const snaps = await Snapshot.find({
    region,
    realmSlug,
    name,
    date: { $gte: from, $lte: to },
  })
    .sort({ date: 1 })
    .select("date ilvl mythicRating played raids level achievementPoints bossKills")
    .lean();

  // shape each snapshot the way CalendarScreen expects (it diffs ilvl/raids)
  const snapshots = snaps.map((s) => ({
    date: s.date,
    ilvl: s.ilvl,
    mythicRating: s.mythicRating,
    played: s.played === true,
    raids: s.raids ?? [],
  }));

  // dated history events (achievements / M+ runs) backfilled from profile
  // timestamps. Derived from the stored snapshots' profiles, best-effort.
  const charEvents = await buildCharEvents({ region, realmSlug, name, from, to });

  return {
    progress: { snapshots },
    charEvents,
    schedule: buildSchedule({ region, from, to }),
  };
}

// Pull dated events (M+ runs, achievements) out of stored profiles in range.
async function buildCharEvents({ region, realmSlug, name, from, to }) {
  const fromMs = new Date(from + "T00:00:00Z").getTime();
  const toMs = new Date(to + "T23:59:59Z").getTime();
  // use the latest snapshot in range as the source of timestamps
  const latest = await Snapshot.findOne({
    region,
    realmSlug,
    name,
    date: { $gte: from, $lte: to },
  })
    .sort({ date: -1 })
    .select("profile")
    .lean();

  const p = latest?.profile;
  if (!p) return [];

  const events = [];

  (p.mythicPlus?.bestRuns ?? []).forEach((run) => {
    const ts = run.completedAt;
    if (ts && ts >= fromMs && ts <= toMs) {
      events.push({
        date: dayKey(new Date(ts)),
        kind: "mplusRun",
        label: `+${run.level} ${run.dungeon ?? ""}`.trim(),
      });
    }
  });

  (p.achievementsList ?? []).forEach((a) => {
    const ts = a.completedAt;
    if (ts && ts >= fromMs && ts <= toMs) {
      events.push({
        date: dayKey(new Date(ts)),
        kind: "achievement",
        label: a.name ?? "Achievement",
      });
    }
  });

  return events;
}

// GET /progress/:region/:realm/:name/day/:date — { played, events:[{type,label}] }
export async function getDayDigest({ region = "eu", realm, name, date }) {
  const realmSlug = slug(realm);

  const [today, prev] = await Promise.all([
    Snapshot.findOne({ region, realmSlug, name, date }).lean(),
    Snapshot.findOne({ region, realmSlug, name, date: { $lt: date } })
      .sort({ date: -1 })
      .lean(),
  ]);

  if (!today) return { played: false, events: [] };

  const events = [];

  if (prev) {
    const ilvlUp = (today.ilvl ?? 0) - (prev.ilvl ?? 0);
    if (ilvlUp > 0)
      events.push({ type: "ilvl", label: `Item level +${ilvlUp} (now ${today.ilvl})` });

    const lvlUp = (today.level ?? 0) - (prev.level ?? 0);
    if (lvlUp > 0)
      events.push({ type: "level", label: `Reached level ${today.level}` });

    const ratingUp = (today.mythicRating ?? 0) - (prev.mythicRating ?? 0);
    if (ratingUp > 0)
      events.push({
        type: "mplusRating",
        label: `M+ rating +${Math.round(ratingUp)} (now ${Math.round(today.mythicRating)})`,
      });

    const kills = (today.bossKills ?? 0) - (prev.bossKills ?? 0);
    if (kills > 0)
      events.push({ type: "bosses", label: `${kills} boss ${kills === 1 ? "kill" : "kills"}` });

    const apUp = (today.achievementPoints ?? 0) - (prev.achievementPoints ?? 0);
    if (apUp > 0)
      events.push({ type: "achvPoints", label: `+${apUp} achievement points` });
  }

  return { played: today.played === true, events };
}