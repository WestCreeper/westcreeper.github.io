// Regenerate before deploying when game IDs change. No game titles or SWFs are bundled.
import { readFileSync, writeFileSync } from "node:fs";
const ids = [
  ...readFileSync(
    new URL("../../_data/games.yml", import.meta.url),
    "utf8",
  ).matchAll(/^- id: ([a-z0-9-]+)\s*$/gm),
].map((m) => m[1]);
if (!ids.length || new Set(ids).size !== ids.length)
  throw new Error("Invalid game IDs");
writeFileSync(
  new URL("game-ids.json", import.meta.url),
  JSON.stringify(ids, null, 2) + "\n",
);
console.log(`Synced ${ids.length} game IDs`);
