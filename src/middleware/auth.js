// src/middleware/auth.js — require a valid Wartable JWT (our own, not Blizzard's).
import { verifyToken } from "../utils/jwt.js";

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "missing_token" });
  try {
    req.user = verifyToken(token); // { id, role, ... }
    next();
  } catch {
    return res.status(401).json({ error: "invalid_token" });
  }
}

// Optional: attach user if present, but don't block public routes.
export function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (token) {
    try { req.user = verifyToken(token); } catch {}
  }
  next();
}
