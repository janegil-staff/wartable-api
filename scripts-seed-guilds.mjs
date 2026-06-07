// scripts-seed-guilds.mjs — populate the guild catalog.
//   node scripts-seed-guilds.mjs                  → import REALMS below via Raider.IO
//   node scripts-seed-guilds.mjs guild            → import the hand-picked STARTER list
//
// Raider.IO mode pulls the ranked raiding guilds per realm (the practical
// "all guilds on a realm" — active raiding guilds), enriched via Blizzard.
import mongoose from "mongoose";
import { env } from "./src/config/env.js";
import { importMany, importRealmFromRaiderIO } from "./src/services/guildImport.js";

// Realms to populate from Raider.IO (region + realm slug).
const REALMS = [
  { region: "eu", realm: "hellscream" },   // your guild's realm
  { region: "eu", realm: "silvermoon" },
  { region: "eu", realm: "draenor" },
  { region: "eu", realm: "tarren-mill" },
];

// Hand-picked individual guilds (fallback mode).
const STARTER = [
  { region: "eu", realm: "hellscream", name: "The Norwegian Vikings" },
  { region: "eu", realm: "tarren-mill", name: "Method" },
];

async function run() {
  await mongoose.connect(env.MONGO_URI);
  const mode = process.argv[2];

  if (mode === "guild") {
    console.log("[seed] importing", STARTER.length, "hand-picked guilds…");
    const r = await importMany(STARTER);
    r.imported.forEach((g) => console.log("  ✓", g.name, "—", g.realm));
    r.failed.forEach((f) => console.log("  ✗", f.name, `(${f.reason})`));
  } else {
    for (const { region, realm } of REALMS) {
      process.stdout.write(`[seed] ${realm} (${region})… `);
      try {
        const r = await importRealmFromRaiderIO({ region, realm, difficulty: "mythic", limit: 50 });
        console.log(`found ${r.found}, imported ${r.imported.length}`);
      } catch (e) {
        console.log("failed:", e.response?.status === 429 ? "rate limited" : e.message);
      }
    }
  }

  await mongoose.disconnect();
  process.exit(0);
}
run().catch((e) => { console.error(e); process.exit(1); });
