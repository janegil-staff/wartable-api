// src/utils/shareCode.js — 6-digit numeric share codes (no letters).
// 000000–999999. Generated, then checked for uniqueness by the caller.
import crypto from "crypto";

const LEN = 6;

export function generateShareCode() {
  // Uniform 0–999999, zero-padded to 6 digits.
  const n = crypto.randomInt(0, 1_000_000);
  return String(n).padStart(LEN, "0");
}

// Keep only digits; pad/truncate handled by callers as needed.
export const normalizeCode = (c) => String(c || "").replace(/\D/g, "").slice(0, LEN);
