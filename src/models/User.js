// src/models/User.js — a player (Battle.net or manual). Stores their characters
// snapshot from login; the showcase is built live per chosen character.
import mongoose from "mongoose";

const characterSchema = new mongoose.Schema(
  {
    name: String, realmSlug: String, realmName: String,
    region: { type: String, enum: ["us", "eu", "kr", "tw"] },
    class: String, level: Number,
    faction: { type: String, enum: ["alliance", "horde"] },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    bnetId: { type: String, index: true, sparse: true },
    battletag: String,
    region: { type: String, enum: ["us", "eu", "kr", "tw"], default: "eu" },
    displayName: { type: String, required: true },
    characters: [characterSchema],
  },
  { timestamps: true },
);

export const User = mongoose.model("User", userSchema);
