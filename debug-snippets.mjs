import { searchWeb } from "./engine-v1/source-discovery/web-search-provider.js";

const result = await searchWeb("Premier League 2025-26 fixtures schedule", { allowSearch: true });

console.log("=== ROWS ===");
for (const [i, row] of result.rows.entries()) {
  console.log(`\n[${i+1}] TITLE:   ${row.title}`);
  console.log(`     SNIPPET: ${row.snippet}`);
  console.log(`     URL:     ${row.url}`);
}
console.log("\n=== DONE ===", result.rows.length, "rows");
