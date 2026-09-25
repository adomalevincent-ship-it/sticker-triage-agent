// Unattended worker: polls tickets.status = 'new' every POLL_INTERVAL_MS,
// claims rows with SELECT ... FOR UPDATE SKIP LOCKED so multiple worker
// instances never process the same ticket twice, classifies each with the
// agent, and writes the outcome back. See README/docs for the row-claiming
// and SIGTERM design — both are explained in detail in the PR/commit that
// introduced this file.
import { pool } from "./db.js";
import { MODELS, getAdapter } from "./models.js";
import { runAgent, type Ticket, type AgentResult } from "./agent.js";

// Best model from results/scorecard.md: qwen3.8-27b with the revised
// (rule-4 checklist) prompt had the highest category accuracy and kappa,
// and the lowest latency, of the three models evaluated.
const MODEL_ID = "groq-qwen3.8-27b";

const POLL_INTERVAL_MS = 60_000;
const POLL_CHECK_STEP_MS = 1_000; // how often to re-check the shutdown flag while idle
const INTER_TICKET_DELAY_MS = 2_500; // pace calls to stay under Groq's free-tier TPM limit
const MAX_WORKER_RETRIES = 3;
const BASE_BACKOFF_MS = 2_000;

let shuttingDown = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function interruptibleSleep(totalMs: number): Promise<void> {
  let waited = 0;
  while (waited < totalMs && !shuttingDown) {
    const step = Math.min(POLL_CHECK_STEP_MS, totalMs - waited);
    await sleep(step);
    waited += step;
  }
}

function logDecision(fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...fields }));
}

// Claims exactly one 'new' ticket and marks it 'processing', atomically.
// FOR UPDATE SKIP LOCKED means a second worker running this same query
// concurrently will never see a row this worker already has locked — it
// skips straight past it instead of blocking or double-claiming it. The
// transaction is short (no network calls inside it), so the lock is held
// only for the few milliseconds it takes to claim, not for the slow model
// call that follows.
async function claimOneTicket(): Promise<Ticket | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const res = await client.query<Ticket>(
      `SELECT id, subject, body FROM tickets
       WHERE status = 'new'
       ORDER BY id
       FOR UPDATE SKIP LOCKED
       LIMIT 1`
    );
    const ticket = res.rows[0];
    if (!ticket) {
      await client.query("ROLLBACK");
      return null;
    }
    await client.query("UPDATE tickets SET status = 'processing' WHERE id = $1", [
      ticket.id,
    ]);
    await client.query("COMMIT");
    return ticket;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function processTicket(
  ticket: Ticket,
  adapter: ReturnType<typeof getAdapter>,
  runId: number
): Promise<void> {
  let result: AgentResult | undefined;

  for (let attempt = 1; attempt <= MAX_WORKER_RETRIES; attempt++) {
    result = await runAgent(ticket, adapter);
    if (result.success) break;

    if (attempt < MAX_WORKER_RETRIES) {
      const backoff = BASE_BACKOFF_MS * 2 ** (attempt - 1);
      console.log(
        `ticket ${ticket.id}: attempt ${attempt} failed (${result.error}), retrying in ${backoff}ms`
      );
      await sleep(backoff);
    }
  }

  if (!result || !result.success) {
    await pool.query(
      "UPDATE tickets SET status = 'failed', last_error = $2 WHERE id = $1",
      [ticket.id, result?.error ?? "unknown failure"]
    );
    logDecision({
      ticket_id: ticket.id,
      category: null,
      escalate: null,
      latency_ms: result?.latencyMs ?? 0,
      status: "failed",
      error: result?.error ?? "unknown failure",
    });
    return;
  }

  const finalStatus = result.shouldEscalate ? "escalated" : "processed";

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
  // An escalated ticket's draft_reply is written to results for a human to
  // read, but the ticket itself is never marked 'processed' — nothing else
  // in this codebase treats a non-'processed' ticket's draft as ready to
  // send, so it's effectively held pending human review.
  await pool.query("UPDATE tickets SET status = $2 WHERE id = $1", [
    ticket.id,
    finalStatus,
  ]);

  logDecision({
    ticket_id: ticket.id,
    category: result.category,
    escalate: result.shouldEscalate,
    latency_ms: result.latencyMs,
    status: finalStatus,
  });
}

async function main() {
  const config = MODELS.find((m) => m.id === MODEL_ID);
  if (!config) {
    console.error(`Model id "${MODEL_ID}" not found in src/models.ts`);
    process.exit(1);
  }
  const adapter = getAdapter(config);

  const runRes = await pool.query<{ id: number }>(
    "INSERT INTO runs (model_name, started_at) VALUES ($1, now()) RETURNING id",
    [adapter.name]
  );
  const runId = runRes.rows[0]!.id;
  console.log(`Worker started. run_id=${runId} model=${adapter.name}`);

  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    console.log(`Received ${signal}, finishing in-flight ticket (if any) then exiting.`);
    shuttingDown = true;
  };
  // SIGTERM is what Railway (and most container platforms) send on restart
  // or redeploy. SIGINT (Ctrl+C) is registered too, purely as a local-dev
  // convenience — same handler, same guarantee.
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Windows cannot deliver a real SIGTERM to an external process — it's a
  // platform limitation (TerminateProcess kills unconditionally, bypassing
  // any handler), not something a shell can work around. This lets the
  // exact same listener above be exercised locally on Windows for testing:
  // process.emit runs the identical handler an OS-delivered signal would.
  // Unset by default; never used in the actual Railway deployment.
  const autoSigtermAfter = Number(process.env.WORKER_TEST_AUTO_SIGTERM_AFTER || 0);
  let processedCount = 0;

  while (!shuttingDown) {
    const ticket = await claimOneTicket();

    if (!ticket) {
      await interruptibleSleep(POLL_INTERVAL_MS);
      continue;
    }

    // Once a ticket is claimed (status = 'processing'), it always runs to
    // completion — shuttingDown is only checked before claiming the next
    // one. This is what keeps a restart from losing a ticket mid-flight:
    // there is never more than one ticket in 'processing' limbo, and the
    // one that's in flight when SIGTERM arrives is allowed to finish and
    // get a real final status instead of being abandoned.
    await processTicket(ticket, adapter, runId);
    processedCount++;

    if (autoSigtermAfter > 0 && processedCount >= autoSigtermAfter) {
      process.emit("SIGTERM");
    }

    if (!shuttingDown) {
      await sleep(INTER_TICKET_DELAY_MS);
    }
  }

  console.log("Shutdown complete.");
  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("Worker crashed:", err);
  process.exit(1);
});
