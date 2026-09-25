// Dev utility: resets specific tickets back to status 'new' (and clears
// last_error) so the worker will pick them up again on its next poll.
// Usage: npx tsx src/reset-tickets.ts <ticket_id> [<ticket_id> ...]
import { pool } from "./db.js";

const ids = process.argv.slice(2).map(Number);

if (ids.length === 0 || ids.some((id) => Number.isNaN(id))) {
  console.error("Usage: npx tsx src/reset-tickets.ts <ticket_id> [<ticket_id> ...]");
  process.exit(1);
}

const res = await pool.query<{ id: number }>(
  `UPDATE tickets SET status = 'new', last_error = NULL WHERE id = ANY($1) RETURNING id`,
  [ids]
);

console.log(
  `Reset ${res.rowCount} ticket(s) to 'new': ${res.rows.map((r) => r.id).join(", ") || "(none matched)"}`
);

await pool.end();
