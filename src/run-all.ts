import { pool } from "./db.js";
import { MODELS } from "./models.js";
import { runModel, type RunSummary } from "./run.js";

async function main() {
  const summaries: RunSummary[] = [];

  for (const config of MODELS) {
    const summary = await runModel(config);
    summaries.push(summary);
  }

  console.log("=== Comparison summary ===\n");
  console.log(
    "model".padEnd(28),
    "rows".padStart(6),
    "failures".padStart(10),
    "avg_latency_ms".padStart(16)
  );
  for (const s of summaries) {
    console.log(
      s.modelName.padEnd(28),
      String(s.rowsWritten).padStart(6),
      String(s.parseFailures).padStart(10),
      String(s.averageLatencyMs).padStart(16)
    );
  }

  await pool.end();
}

main().catch((err) => {
  console.error("Run-all failed:", err);
  process.exit(1);
});
