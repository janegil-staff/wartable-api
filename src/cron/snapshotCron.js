// src/cron/snapshotCron.js — runs once daily (05:00 UTC) and snapshots every
// tracked character so the calendar fills forward over time.
import cron from "node-cron";
import { recordAllTracked } from "../services/snapshot.js";

export function startSnapshotCron() {
  // 05:00 UTC every day
  cron.schedule(
    "0 5 * * *",
    async () => {
      const started = Date.now();
      try {
        const r = await recordAllTracked();
        console.log(
          `[snapshot-cron] ${r.written}/${r.total} chars in ${((Date.now() - started) / 1000).toFixed(1)}s`,
        );
      } catch (e) {
        console.error("[snapshot-cron] failed:", e.message);
      }
    },
    { timezone: "UTC" },
  );
  console.log("[snapshot-cron] scheduled daily at 05:00 UTC");
}