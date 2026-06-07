// src/config/env.js — central env access with light validation.
import dotenv from "dotenv";
dotenv.config();

function required(name) {
  const v = process.env[name];
  if (!v) {
    // Don't crash dev for optional-ish keys; warn loudly instead.
    console.warn(`[env] WARNING: ${name} is not set`);
  }
  return v;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: parseInt(process.env.PORT ?? "4000", 10),
  MONGO_URI: required("MONGO_URI") ?? "mongodb://127.0.0.1:27017/wartable",

  JWT_SECRET: required("JWT_SECRET") ?? "dev-only-change-me",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? "30d",

  // Battle.net app credentials — create at https://develop.battle.net
  BLIZZARD_CLIENT_ID: required("BLIZZARD_CLIENT_ID"),
  BLIZZARD_CLIENT_SECRET: required("BLIZZARD_CLIENT_SECRET"),

  // Where Battle.net redirects after user login. Must match the app's
  // registered redirect URI exactly.
  OAUTH_REDIRECT_URI:
    process.env.OAUTH_REDIRECT_URI ?? "http://localhost:4000/auth/bnet/callback",

  // After we mint our JWT, bounce the user back into the mobile app via a deep
  // link (e.g. wartable://auth). Set to your Expo scheme.
  APP_REDIRECT_SCHEME: process.env.APP_REDIRECT_SCHEME ?? "wartable://auth",

  CORS_ORIGIN: process.env.CORS_ORIGIN ?? "*",
};
