// src/services/blizzard.js
//
// All Battle.net / WoW API communication. Two OAuth flows:
//   1) CLIENT CREDENTIALS — app token for PUBLIC game data (profiles, guilds, realms).
//   2) AUTHORIZATION CODE — user login to read THEIR characters.
//
// Namespaces: static-<region>, dynamic-<region>, profile-<region>.
// Docs: https://develop.battle.net/documentation/world-of-warcraft

import axios from "axios";
import { env } from "../config/env.js";

const REGIONS = ["us", "eu", "kr", "tw"];

const oauthHost = (region) =>
  region === "cn" ? "https://www.battlenet.com.cn" : `https://${region}.battle.net`;
const apiHost = (region) =>
  region === "cn" ? "https://gateway.battlenet.com.cn" : `https://${region}.api.blizzard.com`;

const tokenCache = {};

async function getAppToken(region = "eu") {
  if (!REGIONS.includes(region)) region = "eu";
  const cached = tokenCache[region];
  const now = Date.now();
  if (cached && cached.expiresAt > now + 60_000) return cached.token;

  const res = await axios.post(
    `${oauthHost(region)}/oauth/token`,
    new URLSearchParams({ grant_type: "client_credentials" }),
    {
      auth: { username: env.BLIZZARD_CLIENT_ID, password: env.BLIZZARD_CLIENT_SECRET },
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 10_000,
    },
  );

  const token = res.data.access_token;
  const expiresAt = now + (res.data.expires_in ?? 86400) * 1000;
  tokenCache[region] = { token, expiresAt };
  return token;
}

async function apiGet(region, path, { namespace, locale, params } = {}) {
  const token = await getAppToken(region);
  const res = await axios.get(`${apiHost(region)}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    params: {
      namespace: namespace ? `${namespace}-${region}` : undefined,
      locale: locale ?? "en_US",
      ...params,
    },
    timeout: 12_000,
  });
  return res.data;
}

// ── Authorization-code flow (user login) ───────────────────────────────────
function getAuthorizeUrl({ region = "eu", state, redirectUri, scopes = ["wow.profile"] }) {
  const p = new URLSearchParams({
    client_id: env.BLIZZARD_CLIENT_ID,
    scope: scopes.join(" "),
    state,
    redirect_uri: redirectUri,
    response_type: "code",
  });
  return `${oauthHost(region)}/oauth/authorize?${p.toString()}`;
}

async function exchangeCodeForToken({ region = "eu", code, redirectUri }) {
  const res = await axios.post(
    `${oauthHost(region)}/oauth/token`,
    new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
    {
      auth: { username: env.BLIZZARD_CLIENT_ID, password: env.BLIZZARD_CLIENT_SECRET },
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 10_000,
    },
  );
  return res.data;
}

async function getUserInfo({ region = "eu", userToken }) {
  const res = await axios.get(`${oauthHost(region)}/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${userToken}` },
    timeout: 10_000,
  });
  return res.data;
}

async function getUserCharacters({ region = "eu", userToken }) {
  const res = await axios.get(`${apiHost(region)}/profile/user/wow`, {
    headers: { Authorization: `Bearer ${userToken}` },
    params: { namespace: `profile-${region}`, locale: "en_US" },
    timeout: 12_000,
  });
  return res.data;
}

// ── Public data helpers (client-credentials) ───────────────────────────────
const slug = (s) => String(s).toLowerCase().trim().replace(/['’]/g, "").replace(/\s+/g, "-");
const charName = (s) => encodeURIComponent(String(s).toLowerCase().trim());

async function getCharacterProfile({ region = "eu", realm, name }) {
  return apiGet(region, `/profile/wow/character/${slug(realm)}/${charName(name)}`, { namespace: "profile" });
}

async function getCharacterEquipment({ region = "eu", realm, name }) {
  return apiGet(region, `/profile/wow/character/${slug(realm)}/${charName(name)}/equipment`, { namespace: "profile" });
}

async function getGuild({ region = "eu", realm, name }) {
  return apiGet(region, `/data/wow/guild/${slug(realm)}/${slug(name)}`, { namespace: "profile" });
}

async function getGuildRoster({ region = "eu", realm, name }) {
  return apiGet(region, `/data/wow/guild/${slug(realm)}/${slug(name)}/roster`, { namespace: "profile" });
}

async function getRealms({ region = "eu" }) {
  return apiGet(region, `/data/wow/realm/index`, { namespace: "dynamic" });
}

// ── Dated-activity sources (for the progress calendar) ──────────────────────
// Mythic+ keystone profile (overview: seasons list + current period/rating).
async function getMythicKeystoneProfile({ region = "eu", realm, name }) {
  return apiGet(region, `/profile/wow/character/${slug(realm)}/${charName(name)}/mythic-keystone-profile`, { namespace: "profile" });
}
// Mythic+ runs for a specific season (each run has completed_timestamp).
async function getMythicKeystoneSeason({ region = "eu", realm, name, seasonId }) {
  return apiGet(region, `/profile/wow/character/${slug(realm)}/${charName(name)}/mythic-keystone-profile/season/${seasonId}`, { namespace: "profile" });
}
// Raid encounters (bosses with last_kill_timestamp).
async function getEncountersRaids({ region = "eu", realm, name }) {
  return apiGet(region, `/profile/wow/character/${slug(realm)}/${charName(name)}/encounters/raids`, { namespace: "profile" });
}
// Achievements (each has completed_timestamp).
async function getAchievements({ region = "eu", realm, name }) {
  return apiGet(region, `/profile/wow/character/${slug(realm)}/${charName(name)}/achievements`, { namespace: "profile" });
}

export const blizzard = {
  REGIONS,
  getAppToken,
  apiGet,
  getAuthorizeUrl,
  exchangeCodeForToken,
  getUserInfo,
  getUserCharacters,
  getCharacterProfile,
  getCharacterEquipment,
  getGuild,
  getGuildRoster,
  getRealms,
  // dated activity
  getMythicKeystoneProfile,
  getMythicKeystoneSeason,
  getEncountersRaids,
  getAchievements,
};