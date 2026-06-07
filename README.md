# Wartable API — WoW guild finder backend

Node/Express + MongoDB (ESM). Talks to the Battle.net / WoW API using both
OAuth flows, mints its own JWT for the mobile app, and serves listings + matches.

## Why a backend at all
The Battle.net **client secret must never live in the mobile app**. The backend
holds it, performs both OAuth flows, and hands the app a Wartable JWT.

## Two Blizzard flows (src/services/blizzard.js)
- **Client credentials** — the app's own token for PUBLIC data (guild rosters,
  character profiles, realms). Cached per region, auto-refreshed.
- **Authorization code** — a user logs in with Battle.net so we can read THEIR
  characters. We read account+characters once, upsert a User, mint our JWT, and
  deep-link back into the Expo app. We don't persist the Blizzard token.

## Setup
1. Create a client at https://develop.battle.net → get Client ID + Secret.
   Register the redirect URI (must match OAUTH_REDIRECT_URI exactly).
2. `cp .env.example .env` and fill it in.
3. `npm install`
4. `npm run dev`  (needs a reachable MongoDB; local or Atlas)
5. `GET http://localhost:4000/health` → `{ ok: true }`

## Routes
Auth
- `GET  /auth/bnet/login?region=eu`      → redirect to Battle.net
- `GET  /auth/bnet/callback?code&state`  → exchange → JWT → deep-link to app
- `POST /auth/manual` { role, displayName } → JWT for a guest

Public WoW data (client-credentials)
- `GET /wow/realms?region=eu`
- `GET /wow/character/:realm/:name?region=eu`
- `GET /wow/character/:realm/:name/equipment?region=eu`
- `GET /wow/guild/:realm/:name?region=eu`
- `GET /wow/guild/:realm/:name/roster?region=eu`

Listings (browse + CRUD; auth for write)
- `GET    /listings?type=guild&region=eu&faction=alliance&version=retail&playstyle=raiding`
- `GET    /listings/:id`
- `POST   /listings`          (auth)
- `PUT    /listings/:id`      (auth, owner)
- `DELETE /listings/:id`      (auth, owner; soft delete)

Matches
- `POST  /matches`            (auth) express interest
- `GET   /matches`            (auth)
- `PATCH /matches/:id`        (auth) accept/decline
- `POST  /matches/:id/messages` (auth)

## Mobile integration
- Login button → open `GET /auth/bnet/login?region=<r>` in expo-web-browser.
  The callback deep-links `wartable://auth?token=...`; capture it and call
  `useAuthStore.signInWithToken(token, user)`.
- Set the app's `API_BASE_URL` (src/api/client.js) to this server's URL.

## Deploy (DigitalOcean)
- App Platform: point at the repo, run `npm start`, set env vars in the
  dashboard. Or a Droplet with pm2 + nginx. Use MongoDB Atlas for the DB.
- Set OAUTH_REDIRECT_URI to the public URL and register it on the Battle.net
  client.

## Notes / TODO
- `GET /matches` currently returns all matches — scope it to the caller's
  listings by joining Listing.owner once you wire ownership filters.
- Add rate-limiting + a short cache (e.g. 5 min) on /wow/* to stay well under
  Blizzard's limits.
- Classic vs retail: the public-data namespaces differ for Classic; add a
  `gameVersion` param and switch namespace/host accordingly when you build
  Classic lookups.

## Guild catalog (browse without searching)
Blizzard has NO "list all guilds on a realm" endpoint. Neither does Raider.IO's
public API. So the catalog is built two ways, both feeding the ImportedGuild
collection that Browse reads:

1. **Raider.IO seed (active raiding guilds per realm).**
   `node scripts-seed-guilds.mjs` imports ranked raiding guilds for the realms
   listed in the script, enriched with Blizzard data. Edit REALMS to taste.
   Or per-realm at runtime: `POST /guilds/import-realm { region, realm }`.
   Set the current raid slug via env: `RAIDERIO_RAID=nerubar-palace`.

2. **Passive accumulation.** Any time someone looks up a guild via
   `/wow/guild/...`, it's quietly upserted into the catalog (source:"character").
   The realm list grows organically with use.

Browse merges Wartable listings (opted-in guilds) + this catalog.

### Raider.IO terms (must follow)
- 200 req/min unauthenticated; we back off on 429.
- Public apps MUST link back to raider.io — the app shows a
  "Guild data from Blizzard & Raider.IO" credit. Keep it.
- Don't resell data or build a competing service.
