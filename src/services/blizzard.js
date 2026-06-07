// src/services/blizzard.js
//
// All Battle.net / WoW API communication lives here. Two OAuth flows:
//
//   1) CLIENT CREDENTIALS — the app's own token, for PUBLIC game data
//      (guild rosters, character profiles, realms). Cached in memory and
//      refreshed automatically before expiry. No user involved.
//
//   2) AUTHORIZATION CODE — a user logs in with Battle.net so we can read
//      THEIR characters (/profile/user/wow). We exchange the code for a user
//      token, read their account, and never store the Blizzard token long-term
//      (we mint our own JWT instead — see routes/auth.js).
//
// Regions: us, eu, kr, tw. Each has its own OAuth + API host. Battle.net OAuth
// host pattern: https://<region>.battle.net  (oauth.battle.net also works).
// API host pattern: https://<region>.api.blizzard.com
//
// Namespaces (required on data/profile calls):
//   static-<region>   — slow-changing data (realms, item data)
//   dynamic-<region>  — game-state data
//   profile-<region>  — character/guild profiles
//
// Docs: https://develop.battle.net/documentation/world-of-warcraft

import axios from "axios";
import { env } from "../config/env.js";

const REGIONS = ["us", "eu", "kr", "tw"];

const oauthHost = (region) =>
  region === "cn" ? "https://www.battlenet.com.cn" : `https://${region}.battle.net`;
const apiHost = (region) =>
  region === "cn" ? "https://gateway.battlenet.com.cn" : `https://${region}.api.blizzard.com`;

// ── 1) Client-credentials token cache (per region) ─────────────────────────
const tokenCache = {}; // region -> { token, expiresAt }

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

// Generic authenticated GET against the WoW data/profile APIs.
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

// ── 2) Authorization-code flow (user login) ────────────────────────────────
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
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
    {
      auth: { username: env.BLIZZARD_CLIENT_ID, password: env.BLIZZARD_CLIENT_SECRET },
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 10_000,
    },
  );
  return res.data; // { access_token, token_type, expires_in, scope, ... }
}

// Read the logged-in user's Battle.net account id + battletag.
async function getUserInfo({ region = "eu", userToken }) {
  const res = await axios.get(`${oauthHost(region)}/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${userToken}` },
    timeout: 10_000,
  });
  return res.data; // { sub, id, battletag }
}

// Read the logged-in user's WoW characters (requires wow.profile scope).
async function getUserCharacters({ region = "eu", userToken }) {
  const res = await axios.get(`${apiHost(region)}/profile/user/wow`, {
    headers: { Authorization: `Bearer ${userToken}` },
    params: { namespace: `profile-${region}`, locale: "en_US" },
    timeout: 12_000,
  });
  return res.data; // { wow_accounts: [ { characters: [...] } ] }
}

// ── Public data helpers (client-credentials) ───────────────────────────────
const slug = (s) => String(s).toLowerCase().trim().replace(/['’]/g, "").replace(/\s+/g, "-");

async function getCharacterProfile({ region = "eu", realm, name }) {
  return apiGet(region, `/profile/wow/character/${slug(realm)}/${slug(name)}`, {
    namespace: "profile",
  });
}

async function getCharacterEquipment({ region = "eu", realm, name }) {
  return apiGet(region, `/profile/wow/character/${slug(realm)}/${slug(name)}/equipment`, {
    namespace: "profile",
  });
}

async function getGuild({ region = "eu", realm, name }) {
  return apiGet(region, `/data/wow/guild/${slug(realm)}/${slug(name)}`, {
    namespace: "profile",
  });
}

async function getGuildActivity({ region = "eu", realm, name }) {
  return apiGet(region, `/data/wow/guild/${slug(realm)}/${slug(name)}/activity`, {
    namespace: "profile",
  });
}

async function getGuildRoster({ region = "eu", realm, name }) {
  return apiGet(region, `/data/wow/guild/${slug(realm)}/${slug(name)}/roster`, {
    namespace: "profile",
  });
}

async function getRealms({ region = "eu" }) {
  return apiGet(region, `/data/wow/realm/index`, { namespace: "dynamic" });
}

async function getMythicKeystoneProfile({ region = "eu", realm, name }) {
  return apiGet(region, `/profile/wow/character/${slug(realm)}/${slug(name)}/mythic-keystone-profile`, {
    namespace: "profile",
  });
}

async function getMythicKeystoneSeason({ region = "eu", realm, name, season }) {
  return apiGet(region, `/profile/wow/character/${slug(realm)}/${slug(name)}/mythic-keystone-profile/season/${season}`, {
    namespace: "profile",
  });
}

async function getRaidEncounters({ region = "eu", realm, name }) {
  return apiGet(region, `/profile/wow/character/${slug(realm)}/${slug(name)}/encounters/raids`, {
    namespace: "profile",
  });
}

async function getAchievementsSummary({ region = "eu", realm, name }) {
  return apiGet(region, `/profile/wow/character/${slug(realm)}/${slug(name)}/achievements`, {
    namespace: "profile",
  });
}

async function getCharacterMedia({ region = "eu", realm, name }) {
  return apiGet(region, `/profile/wow/character/${slug(realm)}/${slug(name)}/character-media`, {
    namespace: "profile",
  });
}

// Fetch a media document by its href (used to resolve item icon URLs).
async function getMediaByHref({ region = "eu", href }) {
  // href already includes ?namespace=...; reuse the user token-less app token.
  const token = await getAppToken(region);
  const { data } = await axios.get(href, { headers: { Authorization: `Bearer ${token}` } });
  return data;
}

async function getItemMedia({ region = "eu", itemId }) {
  return apiGet(region, `/data/wow/media/item/${itemId}`, { namespace: "static" });
}

async function getCharacterStatistics({ region = "eu", realm, name }) {
  return apiGet(region, `/profile/wow/character/${slug(realm)}/${slug(name)}/statistics`, { namespace: "profile" });
}
async function getCharacterSpecializations({ region = "eu", realm, name }) {
  return apiGet(region, `/profile/wow/character/${slug(realm)}/${slug(name)}/specializations`, { namespace: "profile" });
}
async function getCharacterPvpSummary({ region = "eu", realm, name }) {
  return apiGet(region, `/profile/wow/character/${slug(realm)}/${slug(name)}/pvp-summary`, { namespace: "profile" });
}
async function getPvpBracket({ region = "eu", realm, name, bracket }) {
  return apiGet(region, `/profile/wow/character/${slug(realm)}/${slug(name)}/pvp-bracket/${bracket}`, { namespace: "profile" });
}
async function getCharacterProfessions({ region = "eu", realm, name }) {
  return apiGet(region, `/profile/wow/character/${slug(realm)}/${slug(name)}/professions`, { namespace: "profile" });
}
// ── Game data (reference / "This Week") ──
async function getMythicKeystoneAffixes({ region = "eu" }) {
  return apiGet(region, `/data/wow/mythic-keystone-affix/index`, { namespace: "static" });
}
async function getWowTokenPrice({ region = "eu" }) {
  return apiGet(region, `/data/wow/token/index`, { namespace: "dynamic" });
}
async function getRealmsStatus({ region = "eu" }) {
  return apiGet(region, `/data/wow/connected-realm/index`, { namespace: "dynamic" });
}

// ── Profile: collections / titles / appearance / reputations ──
async function getCollectionsMounts({ region = "eu", realm, name }) {
  return apiGet(region, `/profile/wow/character/${slug(realm)}/${slug(name)}/collections/mounts`, { namespace: "profile" });
}
async function getCollectionsPets({ region = "eu", realm, name }) {
  return apiGet(region, `/profile/wow/character/${slug(realm)}/${slug(name)}/collections/pets`, { namespace: "profile" });
}
async function getCollectionsToys({ region = "eu", realm, name }) {
  return apiGet(region, `/profile/wow/character/${slug(realm)}/${slug(name)}/collections/toys`, { namespace: "profile" });
}
async function getCharacterTitles({ region = "eu", realm, name }) {
  return apiGet(region, `/profile/wow/character/${slug(realm)}/${slug(name)}/titles`, { namespace: "profile" });
}
async function getCharacterAppearance({ region = "eu", realm, name }) {
  return apiGet(region, `/profile/wow/character/${slug(realm)}/${slug(name)}/appearance`, { namespace: "profile" });
}
async function getCharacterReputations({ region = "eu", realm, name }) {
  return apiGet(region, `/profile/wow/character/${slug(realm)}/${slug(name)}/reputations`, { namespace: "profile" });
}

// ── Game data: auction house + leaderboards ──
async function getConnectedRealmsIndex({ region = "eu" }) {
  return apiGet(region, `/data/wow/connected-realm/index`, { namespace: "dynamic" });
}
async function getAuctions({ region = "eu", connectedRealmId }) {
  return apiGet(region, `/data/wow/connected-realm/${connectedRealmId}/auctions`, { namespace: "dynamic" });
}
async function getMythicLeaderboardIndex({ region = "eu", connectedRealmId }) {
  return apiGet(region, `/data/wow/connected-realm/${connectedRealmId}/mythic-leaderboard/index`, { namespace: "dynamic" });
}
async function getMythicLeaderboard({ region = "eu", connectedRealmId, dungeonId, period }) {
  return apiGet(region, `/data/wow/connected-realm/${connectedRealmId}/mythic-leaderboard/${dungeonId}/period/${period}`, { namespace: "dynamic" });
}
async function getMythicRaidLeaderboard({ region = "eu", raid, faction }) {
  return apiGet(region, `/data/wow/leaderboard/hall-of-fame/${slug(raid)}/${faction}`, { namespace: "dynamic" });
}
async function getPvpSeasonsIndex({ region = "eu" }) {
  return apiGet(region, `/data/wow/pvp-season/index`, { namespace: "dynamic" });
}
async function getPvpLeaderboard({ region = "eu", season, bracket }) {
  return apiGet(region, `/data/wow/pvp-season/${season}/pvp-leaderboard/${bracket}`, { namespace: "dynamic" });
}
async function getItem({ region = "eu", itemId }) {
  return apiGet(region, `/data/wow/item/${itemId}`, { namespace: "static" });
}

export const blizzard = {
  REGIONS,
  getAppToken,
  apiGet,
  // user oauth
  getAuthorizeUrl,
  exchangeCodeForToken,
  getUserInfo,
  getUserCharacters,
  // public data
  getCharacterProfile,
  getCharacterEquipment,
  getMythicKeystoneProfile,
  getMythicKeystoneSeason,
  getRaidEncounters,
  getAchievementsSummary,
  getCharacterMedia,
  getMediaByHref,
  getItemMedia,
  getCharacterStatistics,
  getCharacterSpecializations,
  getCharacterPvpSummary,
  getPvpBracket,
  getCharacterProfessions,
  getMythicKeystoneAffixes,
  getWowTokenPrice,
  getRealmsStatus,
  getCollectionsMounts,
  getCollectionsPets,
  getCollectionsToys,
  getCharacterTitles,
  getCharacterAppearance,
  getCharacterReputations,
  getConnectedRealmsIndex,
  getAuctions,
  getMythicLeaderboardIndex,
  getMythicLeaderboard,
  getMythicRaidLeaderboard,
  getPvpSeasonsIndex,
  getPvpLeaderboard,
  getItem,
  getGuild,
  getGuildRoster,
  getGuildActivity,
  getRealms,
};
