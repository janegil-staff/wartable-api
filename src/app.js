import express from "express";
import cors from "cors";
import morgan from "morgan";
import { env } from "./config/env.js";
import authRoutes from "./routes/auth.js";
import characterRoutes from "./routes/characters.js";
import guildRoutes from "./routes/guild.js";
import eventRoutes from "./routes/events.js";
import thisWeekRoutes from "./routes/thisweek.js";
import auctionRoutes from "./routes/auctions.js";
import leaderboardRoutes from "./routes/leaderboards.js";
import shareRoutes from "./routes/share.js";

const app = express();
app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json({ limit: "1mb" }));
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

app.get("/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.use("/auth", authRoutes);
app.use("/characters", characterRoutes);
app.use("/guild", guildRoutes);
app.use("/events", eventRoutes);
app.use("/thisweek", thisWeekRoutes);
app.use("/auctions", auctionRoutes);
app.use("/leaderboards", leaderboardRoutes);
app.use("/share", shareRoutes);

app.use((_req, res) => res.status(404).json({ error: "not_found" }));
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const up = err.response?.status;
  if (up) return res.status(up === 404 ? 404 : 502).json({ error: up === 404 ? "not_found" : "upstream_error" });
  console.error("[error]", err.message);
  res.status(500).json({ error: "server_error" });
});

export default app;
