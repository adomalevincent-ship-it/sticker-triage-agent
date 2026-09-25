// Dev utility: inserts a new ticket with status 'new' so a running worker
// (local or deployed) picks it up on its next poll.
// Usage: npx tsx src/insert-test-ticket.ts ["subject"] ["body"]
import { pool } from "./db.js";

const subject = process.argv[2] ?? "Test ticket";
const body =
  process.argv[3] ??
  "This is a test ticket inserted to verify the worker picks it up.";

const res = await pool.query<{ id: number }>(
  "INSERT INTO tickets (subject, body) VALUES ($1, $2) RETURNING id",
  [subject, body]
);

console.log(`Inserted ticket ${res.rows[0]!.id}: "${subject}" (status: new)`);
await pool.end();
