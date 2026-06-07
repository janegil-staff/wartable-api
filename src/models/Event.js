// src/models/Event.js — a guild raid/event with RSVPs. This is OUR data
// (Blizzard's API has no calendar), keyed to a guild by region/realm/name.
import mongoose from "mongoose";

const rsvpSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    characterName: String,
    characterClass: String,
    status: { type: String, enum: ["yes", "maybe", "no"], default: "yes" },
    role: { type: String, enum: ["tank", "healer", "dps", "any"], default: "any" },
  },
  { _id: false, timestamps: true },
);

const eventSchema = new mongoose.Schema(
  {
    // guild this event belongs to
    guild: {
      region: { type: String, required: true },
      realmSlug: { type: String, required: true },
      name: { type: String, required: true },
    },
    title: { type: String, required: true },
    type: { type: String, enum: ["raid", "mythicplus", "pvp", "social", "other"], default: "raid" },
    startsAt: { type: Date, required: true },
    note: String,

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    createdByName: String, // character name of creator, for display

    rsvps: [rsvpSchema],
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// query events for a guild, upcoming first
eventSchema.index({ "guild.region": 1, "guild.realmSlug": 1, "guild.name": 1, startsAt: 1 });

export const Event = mongoose.model("Event", eventSchema);
