CREATE TABLE IF NOT EXISTS tickets (
    id SERIAL PRIMARY KEY,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'processed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS labels (
    ticket_id INTEGER PRIMARY KEY REFERENCES tickets(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    should_escalate BOOLEAN NOT NULL,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS runs (
    id SERIAL PRIMARY KEY,
    model_name TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS results (
    id SERIAL PRIMARY KEY,
    run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    predicted_category TEXT,
    predicted_escalate BOOLEAN,
    draft_reply TEXT,
    latency_ms INTEGER,
    cost_usd NUMERIC(10, 6),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
