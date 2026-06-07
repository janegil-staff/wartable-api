// src/routes/events.js — guild events + RSVPs (our own calendar layer).
import { Router } from "express";
import { Event } from "../models/Event.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
const slug = (s) => String(s || "").toLowerCase().trim().replace(/['’]/g, "").replace(/\s+/g, "-");

// GET /events/:region/:realm/:name — upcoming events for a guild (public read).
router.get("/:region/:realm/:name", async (req, res, next) => {
  try {
    const { region, realm, name } = req.params;
    const events = await Event.find({
      "guild.region": region,
      "guild.realmSlug": slug(realm),
      "guild.name": name,
      active: true,
      startsAt: { $gte: new Date(Date.now() - 6 * 60 * 60 * 1000) }, // include very-recent
    })
      .sort({ startsAt: 1 })
      .limit(50)
      .lean();
    res.json(events);
  } catch (e) { next(e); }
});

// POST /events  (auth) — create an event for a guild.
// NOTE v1: any signed-in user can create. Officer-only gating needs verified
// guild rank, which we can't trust from the API yet — deferred.
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const { guild, title, type, startsAt, note, createdByName } = req.body;
    if (!guild?.region || !guild?.realmSlug || !guild?.name)
      return res.status(400).json({ error: "guild_required" });
    if (!title || !startsAt) return res.status(400).json({ error: "title_and_time_required" });

    const ev = await Event.create({
      guild: { region: guild.region, realmSlug: slug(guild.realmSlug), name: guild.name },
      title: title.slice(0, 120),
      type: type || "raid",
      startsAt: new Date(startsAt),
      note: (note || "").slice(0, 500),
      createdBy: req.user.id,
      createdByName: createdByName || null,
    });
    res.status(201).json(ev);
  } catch (e) { next(e); }
});

// POST /events/:id/rsvp  (auth) — set my RSVP.
// body: { status: "yes"|"maybe"|"no", role, characterName, characterClass }
router.post("/:id/rsvp", requireAuth, async (req, res, next) => {
  try {
    const { status = "yes", role = "any", characterName, characterClass } = req.body;
    const ev = await Event.findById(req.params.id);
    if (!ev || !ev.active) return res.status(404).json({ error: "not_found" });

    const existing = ev.rsvps.find((r) => String(r.user) === String(req.user.id));
    if (existing) {
      existing.status = status; existing.role = role;
      if (characterName) existing.characterName = characterName;
      if (characterClass) existing.characterClass = characterClass;
    } else {
      ev.rsvps.push({ user: req.user.id, status, role, characterName, characterClass });
    }
    await ev.save();
    res.json(ev);
  } catch (e) { next(e); }
});

// DELETE /events/:id  (auth, creator only)
router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const ev = await Event.findOne({ _id: req.params.id, createdBy: req.user.id });
    if (!ev) return res.status(404).json({ error: "not_found_or_not_owner" });
    ev.active = false;
    await ev.save();
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
