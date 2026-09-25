// Diagnostic tool for reading missed-escalation cases in detail.
//
// results.reasoning wasn't added to the schema until after runs 1-5 were
// recorded, so those runs have no stored reasoning to inspect. This script
// re-queries the same model with the same (unchanged) prompt for just the
// missed-escalation tickets, purely to surface representative reasoning text
// for manual review. Because it's a fresh sampling call, its category/escalate
// output can occasionally differ from the original run — treat it as
// illustrative, not as a correction to the scored results. Runs 6+ carry
// their own stored reasoning directly in results.reasoning; this script is
// only needed for runs 1-5.
import { pool } from "./db.js";
import { getAdapter, MODELS } from "./models.js";
import { buildPrompt } from "./prompt.js";

interface Row {
  run_id: number;
  model_name: string;
  ticket_id: number;
  subject: string;
  body: string;
  true_category: string;
  notes: string | null;
  predicted_category: string | null;
}

async function main() {
  // Canonical (most recent) run per model — same runs used in the scorecard.
  const runsRes = await pool.query<{ id: number; model_name: string }>(
    "SELECT id, model_name FROM runs ORDER BY id"
  );
  const canonicalByModel = new Map<string, number>();
  for (const r of runsRes.rows) canonicalByModel.set(r.model_name, r.id);
  const canonicalRunIds = [...canonicalByModel.values()];

  const missedRes = await pool.query<Row>(
    `SELECT res.run_id, r.model_name, t.id AS ticket_id, t.subject, t.body,
            l.category AS true_category, l.notes, res.predicted_category
     FROM results res
     JOIN runs r ON r.id = res.run_id
     JOIN tickets t ON t.id = res.ticket_id
     JOIN labels l ON l.ticket_id = t.id
     WHERE res.run_id = ANY($1)
       AND res.predicted_escalate = false
       AND l.should_escalate = true
     ORDER BY r.model_name, t.id`,
    [canonicalRunIds]
  );

  console.log(`Found ${missedRes.rows.length} missed escalations across canonical runs.\n`);

  const modelByName = new Map(MODELS.map((m) => [`groq:${m.model}`, m]));

  for (const row of missedRes.rows) {
    const config = modelByName.get(row.model_name);
    if (!config) {
      console.log(`SKIP ticket ${row.ticket_id} (${row.model_name}): no matching model config`);
      continue;
    }
    const adapter = getAdapter(config);
    const prompt = buildPrompt({ subject: row.subject, body: row.body });

    let reasoning = "(call failed)";
    let category = "?";
    try {
      const response = await adapter.callModel(prompt);
      const jsonMatch = response.text.match(/```(?:json)?\s*([\s\S]*?)```/i);
      const candidate = (jsonMatch?.[1] ?? response.text).trim();
      const parsed = JSON.parse(candidate);
      reasoning = typeof parsed.reasoning === "string" ? parsed.reasoning : "(no reasoning field)";
      category = typeof parsed.category === "string" ? parsed.category : "?";
    } catch (err) {
      reasoning = `(re-query failed: ${(err as Error).message})`;
    }

    console.log("=".repeat(80));
    console.log(`ticket ${row.ticket_id} | model: ${row.model_name} | run: ${row.run_id}`);
    console.log(`subject: ${row.subject}`);
    console.log(`body: ${row.body}`);
    console.log(`label: category=${row.true_category} should_escalate=true notes=${row.notes || "(empty)"}`);
    console.log(`original predicted_category: ${row.predicted_category}`);
    console.log(`fresh re-query category: ${category} | reasoning: ${reasoning}`);

    await new Promise((resolve) => setTimeout(resolve, 2500));
  }

  await pool.end();
}

main().catch((err) => {
  console.error("Diagnosis failed:", err);
  process.exit(1);
});
