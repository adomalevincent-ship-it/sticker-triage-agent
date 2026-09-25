// Diagnostic tool: prints the false escalations from a given run in full,
// with the human label, notes, and the model's stored reasoning, for manual
// review of whether a false escalation is a model error or a label to
// reconsider. Run id is hardcoded to 11 (qwen3.8-27b, the "after" run
// analyzed in results/scorecard.md) — change it to inspect a different run.
import { pool } from "./db.js";

const res = await pool.query(
  `SELECT t.id, t.subject, t.body, l.category AS true_category, l.notes,
          res.predicted_category, res.reasoning
   FROM results res
   JOIN tickets t ON t.id = res.ticket_id
   JOIN labels l ON l.ticket_id = t.id
   WHERE res.run_id = 11
     AND res.predicted_escalate = true
     AND l.should_escalate = false
   ORDER BY t.id`
);

for (const row of res.rows) {
  console.log("=".repeat(80));
  console.log(`ticket ${row.id}: ${row.subject}`);
  console.log(`body: ${row.body}`);
  console.log(`label: category=${row.true_category} should_escalate=false notes=${row.notes || "(empty)"}`);
  console.log(`predicted_category: ${row.predicted_category}`);
  console.log(`reasoning: ${row.reasoning}`);
}

await pool.end();
