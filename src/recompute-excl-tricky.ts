// Diagnostic tool: recomputes scoring for the "after" runs (9-11, the
// revised-prompt runs) excluding the 10 tickets deliberately designed to be
// tricky (31-40), to see how much remaining error is concentrated in the
// hard cases vs. the routine ones. See results/scorecard.md for the output.
import { pool } from "./db.js";
import { loadLabels, loadRuns, loadResults, scoreRun, pct, fmtKappa } from "./score.js";

const TRICKY_IDS = new Set(Array.from({ length: 10 }, (_, i) => 31 + i));
const AFTER_RUN_IDS = [9, 10, 11];

const labels = await loadLabels();
const runs = await loadRuns();

for (const runId of AFTER_RUN_IDS) {
  const run = runs.find((r) => r.id === runId)!;
  const allResults = await loadResults(runId);
  const easyResults = allResults.filter((r) => !TRICKY_IDS.has(r.ticket_id));
  const card = scoreRun(run, easyResults, labels);

  console.log(`run ${run.id} (${run.model_name}), n=${card.totalTickets}`);
  console.log(
    `  cat_acc=${pct(card.categoryAccuracy)} kappa=${fmtKappa(card.kappa)} ` +
      `missed=${card.escalation.missed} false=${card.escalation.falseEscalations} ` +
      `avg_latency=${card.avgLatencyMs}ms`
  );
}

await pool.end();
