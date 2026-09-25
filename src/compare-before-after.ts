import { pool } from "./db.js";
import {
  loadLabels,
  loadRuns,
  loadResults,
  scoreRun,
  pct,
  fmtKappa,
  type ScoreCard,
} from "./score.js";

// Runs 3-5 are the "before" run (one per model) from the original prompt.
// Runs after that are the "after" runs, scored with the revised escalation
// checklist prompt. Both are looked up by model name so this stays correct
// even if run ids shift.
const BEFORE_RUN_IDS = [3, 4, 5];

function buildRow(phase: "before" | "after", c: ScoreCard): string[] {
  return [
    c.modelName,
    phase,
    String(c.runId),
    pct(c.categoryAccuracy),
    fmtKappa(c.kappa),
    String(c.escalation.missed),
    String(c.escalation.falseEscalations),
    String(c.avgLatencyMs),
  ];
}

async function main() {
  const labels = await loadLabels();
  const runs = await loadRuns();

  const beforeRuns = runs.filter((r) => BEFORE_RUN_IDS.includes(r.id));
  const maxBeforeId = Math.max(...BEFORE_RUN_IDS);

  const afterByModel = new Map<string, (typeof runs)[number]>();
  for (const r of runs) {
    if (r.id > maxBeforeId) afterByModel.set(r.model_name, r); // last write wins = most recent
  }
  const afterRuns = [...afterByModel.values()];

  if (afterRuns.length === 0) {
    console.error("No runs found after the before-run ids. Run npm run run:all first.");
    process.exit(1);
  }

  const rows: string[][] = [];
  for (const run of beforeRuns) {
    const results = await loadResults(run.id);
    const card = scoreRun(run, results, labels);
    rows.push(buildRow("before", card));
  }
  for (const run of afterRuns) {
    const results = await loadResults(run.id);
    const card = scoreRun(run, results, labels);
    rows.push(buildRow("after", card));
  }

  // Group before/after together per model for readability.
  rows.sort((a, b) => {
    const modelCmp = a[0]!.localeCompare(b[0]!);
    if (modelCmp !== 0) return modelCmp;
    return a[1]! === "before" ? -1 : 1;
  });

  const header = [
    "model",
    "phase",
    "run",
    "cat_acc",
    "kappa",
    "missed_esc",
    "false_esc",
    "avg_latency_ms",
  ];
  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i]!.length))
  );
  const line = (cells: string[]) =>
    cells.map((c, i) => c.padEnd(widths[i]!)).join("  ");

  console.log("=== Before / after: revised escalation-checklist prompt ===\n");
  console.log(line(header));
  console.log(line(widths.map((w) => "-".repeat(w))));
  for (const row of rows) console.log(line(row));

  await pool.end();
}

main().catch((err) => {
  console.error("Comparison failed:", err);
  process.exit(1);
});
