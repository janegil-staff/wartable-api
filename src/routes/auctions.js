// src/routes/auctions.js — auction house browse for a connected realm.
// NOTE: AH payloads are huge (tens of thousands of listings). We cache per
// realm for a few minutes and support a simple item-id filter + pagination.
import { Router } from "express";
import { blizzard } from "../services/blizzard.js";

const router = Router();
const cache = {};
const TTL = 5 * 60 * 1000;

// GET /auctions/realms?region=eu — list connected realms (id + name) to pick from
router.get("/realms", async (req, res, next) => {
  try {
    const region = ["us", "eu", "kr", "tw"].includes(req.query.region) ? req.query.region : "eu";
    const idx = await blizzard.getConnectedRealmsIndex({ region });
    // the index returns hrefs; we surface the ids only (resolving names is N calls)
    const realms = (idx.connected_realms ?? []).map((c) => {
      const m = /connected-realm\/(\d+)/.exec(c.href || "");
      return m ? Number(m[1]) : null;
    }).filter(Boolean);
    res.json({ region, connectedRealmIds: realms });
  } catch (e) { next(e); }
});

// GET /auctions/:region/:crId?itemId=...&page=1 — browse auctions
router.get("/:region/:crId", async (req, res, next) => {
  try {
    const region = ["us", "eu", "kr", "tw"].includes(req.params.region) ? req.params.region : "eu";
    const crId = Number(req.params.crId);
    const itemId = req.query.itemId ? Number(req.query.itemId) : null;
    const page = Math.max(1, Number(req.query.page) || 1);
    const PER = 50;

    const key = `${region}-${crId}`;
    let data = cache[key];
    if (!data || Date.now() - data.at > TTL) {
      const raw = await blizzard.getAuctions({ region, connectedRealmId: crId });
      data = { at: Date.now(), auctions: raw.auctions ?? [] };
      cache[key] = data;
    }

    let list = data.auctions;
    if (itemId) list = list.filter((a) => a.item?.id === itemId);

    const total = list.length;
    const slice = list.slice((page - 1) * PER, page * PER).map((a) => ({
      id: a.id,
      itemId: a.item?.id,
      quantity: a.quantity,
      buyout: a.buyout ?? a.unit_price ?? null,
      bid: a.bid ?? null,
      timeLeft: a.time_left,
    }));

    res.json({ region, connectedRealmId: crId, total, page, perPage: PER, auctions: slice });
  } catch (e) {
    if (e.response?.status === 404) return res.status(404).json({ error: "realm_not_found" });
    next(e);
  }
});

export default router;
