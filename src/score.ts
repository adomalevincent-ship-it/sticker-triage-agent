// Scores every run in `runs` against the human labels in `labels`, per run:
// category accuracy, Cohen's kappa, an escalation breakdown, latency/cost,
// and a confusion matrix. Missed and false escalations are counted as
// separate numbers rather than one blended "escalation accuracy" because
// they aren't equally costly: a missed escalation lets an auto-reply reach
// a customer who needed a human, while a false one just costs a human a
// few seconds of review. Kappa is reported alongside raw accuracy because
// accuracy alone doesn't account for how skewed the label distribution is —
// kappa answers whether the model is actually better than guessing the
// majority category.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./db.js";
import { VALID_CATEGORIES, type Category } from "./categories.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");

interface LabelRow {
  ticket_id: number;
  category: Category;
  should_escalate: boolean;
}

interface ResultRow {
  ticket_id: number;
  predicted_category: Category | null;
  predicted_escalate: boolean | null;
  latency_ms: number;
  cost_usd: string;
}

interface RunRow {
  id: number;
  model_name: string;
  started_at: Date;
}

export interface ScoreCard {
  runId: number;
  modelName: string;
  totalTickets: number;
  failures: number;
  categoryCorrect: number;
  categoryAccuracy: number;
  kappa: number | null;
  kappaN: number;
  escalation: {
    correctlyEscalated: number;
    correctlyNotEscalated: number;
    missed: number;
    falseEscalations: number;
    noOutput: number;
  };
  avgLatencyMs: number;
  totalCostUsd: number;
  confusion: Record<Category, Record<Category | "no_output", number>>;
  wrongTicketIds: number[];
  predictions: Map<number, { category: Category | null; escalate: boolean | null }>;
}

export async function loadLabels(): Promise<Map<number, LabelRow>> {
  const res = await pool.query<LabelRow>(
    "SELECT ticket_id, category, should_escalate FROM labels"
  );
  const map = new Map<number, LabelRow>();
  for (const row of res.rows) map.set(row.ticket_id, row);
  return map;
}

export async function loadRuns(): Promise<RunRow[]> {
  const res = await pool.query<RunRow>(
    "SELECT id, model_name, started_at FROM runs ORDER BY id"
  );
  return res.rows;
}

export async function loadResults(runId: number): Promise<ResultRow[]> {
  const res = await pool.query<ResultRow>(
    `SELECT ticket_id, predicted_category, predicted_escalate, latency_ms, cost_usd
     FROM results WHERE run_id = $1 ORDER BY ticket_id`,
    [runId]
  );
  return res.rows;
}

function emptyConfusion(): Record<Category, Record<Category | "no_output", number>> {
  const confusion = {} as Record<Category, Record<Category | "no_output", number>>;
  for (const truth of VALID_CATEGORIES) {
    confusion[truth] = {} as Record<Category | "no_output", number>;
    for (const pred of VALID_CATEGORIES) confusion[truth][pred] = 0;
    confusion[truth]["no_output"] = 0;
  }
  return confusion;
}

function computeKappa(pairs: { truth: Category; pred: Category }[]): number | null {
  const n = pairs.length;
  if (n === 0) return null;

  const truthTotals: Record<Category, number> = {} as Record<Category, number>;
  const predTotals: Record<Category, number> = {} as Record<Category, number>;
  for (const c of VALID_CATEGORIES) {
    truthTotals[c] = 0;
    predTotals[c] = 0;
  }

  let agree = 0;
  for (const { truth, pred } of pairs) {
    truthTotals[truth]++;
    predTotals[pred]++;
    if (truth === pred) agree++;
  }

  const po = agree / n;
  let pe = 0;
  for (const c of VALID_CATEGORIES) {
    pe += (truthTotals[c] / n) * (predTotals[c] / n);
  }

  const denom = 1 - pe;
  if (Math.abs(denom) < 1e-9) return po === 1 ? 1 : 0;
  return (po - pe) / denom;
}

export function scoreRun(
  run: RunRow,
  results: ResultRow[],
  labels: Map<number, LabelRow>
): ScoreCard {
  let categoryCorrect = 0;
  let failures = 0;
  let totalLatency = 0;
  let totalCost = 0;

  const confusion = emptyConfusion();
  const kappaPairs: { truth: Category; pred: Category }[] = [];
  const wrongTicketIds: number[] = [];
  const predictions = new Map<
    number,
    { category: Category | null; escalate: boolean | null }
  >();

  let correctlyEscalated = 0;
  let correctlyNotEscalated = 0;
  let missed = 0;
  let falseEscalations = 0;
  let noOutputEscalation = 0;

  for (const r of results) {
    const label = labels.get(r.ticket_id);
    if (!label) continue;

    totalLatency += r.latency_ms;
    totalCost += Number(r.cost_usd) || 0;
    predictions.set(r.ticket_id, {
      category: r.predicted_category,
      escalate: r.predicted_escalate,
    });

    let wrong = false;

    if (r.predicted_category === null) {
      failures++;
      confusion[label.category]["no_output"]++;
      wrong = true;
    } else {
      confusion[label.category][r.predicted_category]++;
      kappaPairs.push({ truth: label.category, pred: r.predicted_category });
      if (r.predicted_category === label.category) {
        categoryCorrect++;
      } else {
        wrong = true;
      }
    }

    if (r.predicted_escalate === null) {
      noOutputEscalation++;
      wrong = true;
    } else if (r.predicted_escalate && label.should_escalate) {
      correctlyEscalated++;
    } else if (!r.predicted_escalate && !label.should_escalate) {
      correctlyNotEscalated++;
    } else if (!r.predicted_escalate && label.should_escalate) {
      missed++;
      wrong = true;
    } else if (r.predicted_escalate && !label.should_escalate) {
      falseEscalations++;
      wrong = true;
    }

    if (wrong) wrongTicketIds.push(r.ticket_id);
  }

  const total = results.length;

  return {
    runId: run.id,
    modelName: run.model_name,
    totalTickets: total,
    failures,
    categoryCorrect,
    categoryAccuracy: total > 0 ? categoryCorrect / total : 0,
    kappa: computeKappa(kappaPairs),
    kappaN: kappaPairs.length,
    escalation: {
      correctlyEscalated,
      correctlyNotEscalated,
      missed,
      falseEscalations,
      noOutput: noOutputEscalation,
    },
    avgLatencyMs: total > 0 ? Math.round(totalLatency / total) : 0,
    totalCostUsd: totalCost,
    confusion,
    wrongTicketIds: wrongTicketIds.sort((a, b) => a - b),
    predictions,
  };
}

export function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export function fmtKappa(k: number | null): string {
  return k === null ? "n/a" : k.toFixed(3);
}

function buildSummaryTable(cards: ScoreCard[]): string {
  const header = [
    "run",
    "model",
    "cat_acc",
    "kappa",
    "correct_esc",
    "correct_no_esc",
    "missed_esc",
    "false_esc",
    "avg_latency_ms",
    "total_cost_usd",
  ];
  const rows = cards.map((c) => [
    String(c.runId),
    c.modelName,
    pct(c.categoryAccuracy),
    fmtKappa(c.kappa),
    String(c.escalation.correctlyEscalated),
    String(c.escalation.correctlyNotEscalated),
    String(c.escalation.missed),
    String(c.escalation.falseEscalations),
    String(c.avgLatencyMs),
    c.totalCostUsd.toFixed(4),
  ]);

  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i]!.length))
  );
  const line = (cells: string[]) =>
    cells.map((c, i) => c.padEnd(widths[i]!)).join("  ");

  return [line(header), line(widths.map((w) => "-".repeat(w))), ...rows.map(line)].join(
    "\n"
  );
}

function buildConfusionTable(card: ScoreCard): string {
  const cols = [...VALID_CATEGORIES, "no_output" as const];
  const header = ["true \\ pred", ...cols];
  const rows = VALID_CATEGORIES.map((truth) => [
    truth,
    ...cols.map((pred) => String(card.confusion[truth][pred])),
  ]);
  const widths = header.map((h, i) =>
    Math.max(String(h).length, ...rows.map((r) => String(r[i]).length))
  );
  const line = (cells: (string | number)[]) =>
    cells.map((c, i) => String(c).padEnd(widths[i]!)).join("  ");
  return [line(header), line(widths.map((w) => "-".repeat(w))), ...rows.map(line)].join(
    "\n"
  );
}

function toMarkdownTable(headers: string[], rows: string[][]): string {
  const head = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${r.join(" | ")} |`).join("\n");
  return [head, sep, body].join("\n");
}

async function main() {
  const labels = await loadLabels();
  const runs = await loadRuns();

  if (runs.length === 0) {
    console.log("No runs found.");
    await pool.end();
    return;
  }

  const cards: ScoreCard[] = [];
  for (const run of runs) {
    const results = await loadResults(run.id);
    cards.push(scoreRun(run, results, labels));
  }

  // One canonical (most recent) run per distinct model, used for cross-model comparison.
  const canonicalByModel = new Map<string, ScoreCard>();
  for (const card of cards) {
    canonicalByModel.set(card.modelName, card); // runs iterated in ascending id order, so last write wins
  }
  const canonical = [...canonicalByModel.values()];

  const allTicketIds = [...labels.keys()].sort((a, b) => a - b);

  const wrongForEveryModel = allTicketIds.filter((id) =>
    canonical.every((c) => c.wrongTicketIds.includes(id))
  );

  const disagreements = allTicketIds.filter((id) => {
    const cats = canonical.map((c) => c.predictions.get(id)?.category ?? null);
    return new Set(cats).size > 1;
  });

  // ---- console output ----
  console.log("=== Scorecard: one row per run ===\n");
  console.log(buildSummaryTable(cards));

  console.log("\n=== Confusion matrices (canonical run per model) ===");
  for (const card of canonical) {
    console.log(`\n${card.modelName} (run ${card.runId}):`);
    console.log(buildConfusionTable(card));
  }

  console.log(
    `\n=== Tickets every model (canonical runs) got wrong: ${wrongForEveryModel.length} ===`
  );
  console.log(wrongForEveryModel.length ? wrongForEveryModel.join(", ") : "(none)");

  console.log(
    `\n=== Tickets where models (canonical runs) disagreed on category: ${disagreements.length} ===`
  );
  console.log(disagreements.length ? disagreements.join(", ") : "(none)");

  // ---- results/scorecard.md ----
  const lines: string[] = [];
  lines.push("# Scorecard\n");
  lines.push(`Generated ${new Date().toISOString()}\n`);

  lines.push("## Summary (one row per run)\n");
  lines.push(
    toMarkdownTable(
      [
        "run",
        "model",
        "category accuracy",
        "kappa",
        "correctly escalated",
        "correctly not escalated",
        "missed escalations",
        "false escalations",
        "avg latency (ms)",
        "total cost (USD)",
      ],
      cards.map((c) => [
        String(c.runId),
        c.modelName,
        pct(c.categoryAccuracy),
        fmtKappa(c.kappa),
        String(c.escalation.correctlyEscalated),
        String(c.escalation.correctlyNotEscalated),
        String(c.escalation.missed),
        String(c.escalation.falseEscalations),
        String(c.avgLatencyMs),
        c.totalCostUsd.toFixed(4),
      ])
    )
  );
  lines.push("");
  lines.push(
    `Kappa is computed only over tickets where the model produced a parseable category ` +
      `(shown per run below as \`kappa n\`); failures count against category accuracy but are ` +
      `excluded from kappa since it measures agreement between two category choices, not output reliability.`
  );
  lines.push("");
  lines.push(
    toMarkdownTable(
      ["run", "model", "failures (no output)", "kappa n (of 40)"],
      cards.map((c) => [
        String(c.runId),
        c.modelName,
        String(c.failures),
        String(c.kappaN),
      ])
    )
  );

  lines.push("\n## Confusion matrices\n");
  for (const card of cards) {
    lines.push(`### Run ${card.runId} — ${card.modelName}\n`);
    const cols = [...VALID_CATEGORIES, "no_output" as const];
    lines.push(
      toMarkdownTable(
        ["true \\ pred", ...cols],
        VALID_CATEGORIES.map((truth) => [
          truth,
          ...cols.map((pred) => String(card.confusion[truth][pred])),
        ])
      )
    );
    lines.push("");
  }

  lines.push("## Cross-model comparison\n");
  lines.push(
    "Uses the most recent run for each distinct model: " +
      canonical.map((c) => `${c.modelName} (run ${c.runId})`).join(", ") +
      ".\n"
  );
  lines.push(
    `**Tickets every model got wrong (category or escalation mismatch, or no output): ${wrongForEveryModel.length}**\n`
  );
  lines.push(wrongForEveryModel.length ? wrongForEveryModel.join(", ") : "(none)");
  lines.push("");
  lines.push(
    `**Tickets where models disagreed with each other on category: ${disagreements.length}**\n`
  );
  lines.push(disagreements.length ? disagreements.join(", ") : "(none)");

  const outDir = path.join(projectRoot, "results");
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "scorecard.md");
  writeFileSync(outPath, lines.join("\n") + "\n", "utf-8");
  console.log(`\nWrote ${outPath}`);

  await pool.end();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("Scoring failed:", err);
    process.exit(1);
  });
}
