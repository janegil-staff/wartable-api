// scripts/snapshot-now.js — run a snapshot immediately for every tracked
// character. Use to bootstrap the calendar (run today, then again tomorrow,
// and the first "played" cell lights up).
//
//   node scripts/snapshot-now.js
import mongoose from "mongoose";
import { env } from "../src/config/env.js";
import { recordAllTracked } from "../src/services/snapshot.js";

(async () => {
  const started = Date.now();
  try {
    await mongoose.connect(env.MONGO_URI);
    console.log("[db] connected");
    const r = await recordAllTracked();
    console.log(
      `[snapshot-now] ${r.written}/${r.total} chars in ${((Date.now() - started) / 1000).toFixed(1)}s`,
    );
    r.results
      .filter((x) => !x.written)
      .forEach((x) => console.log(`  skipped ${x.name}: ${x.reason}`));
    process.exit(0);
  } catch (e) {
    console.error("[snapshot-now] failed:", e.message);
    process.exit(1);
  }
})();