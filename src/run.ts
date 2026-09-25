import { pool } from "./db.js";
import { MODELS, getAdapter, type ModelConfig } from "./models.js";
import { runAgent, type Ticket } from "./agent.js";

const DELAY_MS = 3000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RunSummary {
  modelId: string;
  modelName: string;
  runId: number;
  rowsWritten: number;
  parseFailures: number;
  averageLatencyMs: number;
}

export async function runModel(config: ModelConfig): Promise<RunSummary> {
  const adapter = getAdapter(config);

  const runRes = await pool.query<{ id: number }>(
    "INSERT INTO runs (model_name, started_at) VALUES ($1, now()) RETURNING id",
    [adapter.name]
  );
  const runId = runRes.rows[0]!.id;
  console.log(`Run ${runId} started for model "${adapter.name}"\n`);

  const ticketsRes = await pool.query<Ticket>(
    "SELECT id, subject, body FROM tickets ORDER BY id"
  );
  const tickets = ticketsRes.rows;

  let written = 0;
  let failures = 0;
  let totalLatency = 0;

  for (const ticket of tickets) {
    const result = await runAgent(ticket, adapter);
    totalLatency += result.latencyMs;

    await pool.query(
      `INSERT INTO results (run_id, ticket_id, predicted_category, predicted_escalate, draft_reply, latency_ms, cost_usd, reasoning)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        runId,
        ticket.id,
        result.category,
        result.shouldEscalate,
        result.draftReply,
        result.latencyMs,
        0,
        result.reasoning,
      ]
    );
    written++;

    if (!result.success) {
      failures++;
      console.log(`  ticket ${ticket.id}: FAILED — ${result.error}`);
    } else {
      console.log(
        `  ticket ${ticket.id}: ${result.category} / escalate=${result.shouldEscalate} (${result.latencyMs}ms)`
      );
    }

    await sleep(DELAY_MS);
  }

  const summary: RunSummary = {
    modelId: config.id,
    modelName: adapter.name,
    runId,
    rowsWritten: written,
    parseFailures: failures,
    averageLatencyMs: Math.round(totalLatency / written),
  };

  console.log(`\nRun ${runId} complete.`);
  console.log(`Rows written: ${summary.rowsWritten}`);
  console.log(`Parse failures: ${summary.parseFailures}`);
  console.log(`Average latency: ${summary.averageLatencyMs}ms\n`);

  return summary;
}

async function main() {
  const modelId = process.argv[2] ?? MODELS[0]!.id;
  const config = MODELS.find((m) => m.id === modelId);
  if (!config) {
    console.error(
      `Unknown model id "${modelId}". Options: ${MODELS.map((m) => m.id).join(", ")}`
    );
    process.exit(1);
  }

  await runModel(config);
  await pool.end();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("Run failed:", err);
    process.exit(1);
  });
}
