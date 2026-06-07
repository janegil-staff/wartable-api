// src/models/ShareCode.js — a shareable showcase of ONE character.
// Holds the character key + a cached profile snapshot (refreshed when stale).
import mongoose from "mongoose";

const shareCodeSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, index: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    character: { region: String, realmSlug: String, name: String },
    snapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    snapshotAt: { type: Date, default: null },
    label: String,
    active: { type: Boolean, default: true },
    expiresAt: { type: Date },
    viewCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// Auto-remove the document once expiresAt passes (MongoDB TTL).
shareCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const ShareCode = mongoose.model("ShareCode", shareCodeSchema);
