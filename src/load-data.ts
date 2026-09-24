import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { pool } from "./db.js";
import { isValidCategory } from "./categories.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");

interface TicketRow {
  id: string;
  subject: string;
  body: string;
}

interface LabelRow {
  ticket_id: string;
  category: string;
  should_escalate: string;
  notes: string;
}

function parseBoolean(raw: string): boolean | null {
  const v = raw.trim().toLowerCase();
  if (v === "true" || v === "yes") return true;
  if (v === "false" || v === "no") return false;
  return null;
}

function loadCsv<T>(relPath: string): T[] {
  const content = readFileSync(path.join(projectRoot, relPath), "utf-8");
  return parse(content, { columns: true, skip_empty_lines: true }) as T[];
}

function validate(tickets: TicketRow[], labels: LabelRow[]): string[] {
  const errors: string[] = [];
  const ticketIds = new Set(tickets.map((t) => t.id));
  const seenLabelIds = new Set<string>();

  for (const l of labels) {
    const prefix = `label for ticket_id "${l.ticket_id || ""}"`;

    if (!l.ticket_id?.trim()) {
      errors.push(`${prefix}: missing ticket_id`);
      continue;
    }
    if (seenLabelIds.has(l.ticket_id)) {
      errors.push(`${prefix}: duplicate ticket_id in labels.csv`);
    }
    seenLabelIds.add(l.ticket_id);

    if (!ticketIds.has(l.ticket_id)) {
      errors.push(`${prefix}: no matching row in tickets.csv`);
    }

    if (!l.category?.trim()) {
      errors.push(`${prefix}: empty category`);
    } else if (!isValidCategory(l.category.trim())) {
      errors.push(
        `${prefix}: invalid category "${l.category}" (see docs/labeling-guide.md for the allowed categories)`
      );
    }

    if (!l.should_escalate?.trim()) {
      errors.push(`${prefix}: empty should_escalate`);
    } else if (parseBoolean(l.should_escalate) === null) {
      errors.push(
        `${prefix}: should_escalate "${l.should_escalate}" is not a recognizable true/false value (accepted: true/false/yes/no, any case)`
      );
    }
  }

  return errors;
}

async function run() {
  const tickets = loadCsv<TicketRow>("data/tickets.csv");
  const labels = loadCsv<LabelRow>("data/labels.csv");

  const errors = validate(tickets, labels);
  if (errors.length > 0) {
    console.error(`Validation failed with ${errors.length} error(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const t of tickets) {
      await client.query(
        `INSERT INTO tickets (id, subject, body)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET subject = EXCLUDED.subject, body = EXCLUDED.body`,
        [t.id, t.subject, t.body]
      );
    }
    await client.query(
      `SELECT setval(pg_get_serial_sequence('tickets', 'id'), (SELECT COALESCE(MAX(id), 1) FROM tickets))`
    );

    for (const l of labels) {
      await client.query(
        `INSERT INTO labels (ticket_id, category, should_escalate, notes)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (ticket_id) DO UPDATE SET category = EXCLUDED.category, should_escalate = EXCLUDED.should_escalate, notes = EXCLUDED.notes`,
        [l.ticket_id, l.category.trim(), parseBoolean(l.should_escalate), l.notes?.trim() || null]
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  const [ticketCount, labelCount, byCategory, byEscalate] = await Promise.all([
    pool.query("SELECT COUNT(*)::int AS n FROM tickets"),
    pool.query("SELECT COUNT(*)::int AS n FROM labels"),
    pool.query(
      "SELECT category, COUNT(*)::int AS n FROM labels GROUP BY category ORDER BY category"
    ),
    pool.query(
      "SELECT should_escalate, COUNT(*)::int AS n FROM labels GROUP BY should_escalate ORDER BY should_escalate"
    ),
  ]);

  console.log("Load complete.\n");
  console.log(`Total tickets: ${ticketCount.rows[0].n}`);
  console.log(`Total labels: ${labelCount.rows[0].n}`);
  console.log("\nBy category:");
  for (const row of byCategory.rows) {
    console.log(`  ${row.category}: ${row.n}`);
  }
  console.log("\nBy escalate:");
  for (const row of byEscalate.rows) {
    console.log(`  ${row.should_escalate}: ${row.n}`);
  }

  await pool.end();
}

run().catch((err) => {
  console.error("Load failed:", err);
  process.exit(1);
});
