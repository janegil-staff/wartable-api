// src/models/Snapshot.js — a daily point-in-time capture of a character.
// Stores denormalized fields for cheap calendar queries plus the full profile
// blob so any day can be re-rendered. `played` is derived from lastLogin
// advancing since the previous snapshot.
import mongoose from "mongoose";

const snapshotSchema = new mongoose.Schema(
  {
    // character identity (matches User.characters keying)
    region: { type: String, enum: ["us", "eu", "kr", "tw"], required: true },
    realmSlug: { type: String, required: true },
    name: { type: String, required: true },

    // the calendar day this snapshot represents, "YYYY-MM-DD" (UTC)
    date: { type: String, required: true },

    // denormalized fields the calendar diffs/colours by (cheap to query)
    ilvl: Number,
    mythicRating: Number,
    achievementPoints: Number,
    level: Number,
    bossKills: Number, // total across all raids/difficulties
    lastLogin: Number, // Blizzard last_login_timestamp (ms)
    played: Boolean, // did login advance since the previous snapshot?

    // raids kept (the screen recomputes newKills by diffing modes[].completed)
    raids: { type: mongoose.Schema.Types.Mixed, default: [] },

    // full built profile for this day (re-render any past day)
    profile: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

// one snapshot per character per day (last write that day wins)
snapshotSchema.index(
  { region: 1, realmSlug: 1, name: 1, date: 1 },
  { unique: true },
);
// fast range queries for the calendar grid
snapshotSchema.index({ region: 1, realmSlug: 1, name: 1, date: -1 });

export const Snapshot = mongoose.model("Snapshot", snapshotSchema);