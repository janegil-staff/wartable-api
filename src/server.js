import mongoose from "mongoose";
import app from "./app.js";
import { env } from "./config/env.js";
import { startSnapshotCron } from "./cron/snapshotCron.js";

(async () => {
  try {
    await mongoose.connect(env.MONGO_URI);
    console.log("[db] connected");
    startSnapshotCron();
    app.listen(env.PORT, () => console.log(`[server] listening on :${env.PORT}`));
  } catch (e) {
    console.error("[startup] failed:", e.message);
    process.exit(1);
  }
})();