// One-shot migration: Supabase Postgres → local SQLite.
//
// Usage:
//   DATABASE_URL="postgres://..." npx tsx scripts/migrate-from-supabase.ts
//
// Reads only the rows owned by USER_EMAIL (hardcoded below) and writes them
// to scripts/budgettier.db. After it finishes, copy that file into the app's
// data directory:
//
//   ~/Library/Application Support/com.budgettier.app/budgettier.db
//
// The app reads from there on next launch.
//
// What gets migrated:
//   wallets, categories, transactions, settings, budget_plans, budget_allocations
//
// What doesn't:
//   users, sessions, password_reset_tokens, support_tickets, AI / repeat fields
//   (all dropped from the desktop schema by design).

import { Client } from "pg";
import Database from "better-sqlite3";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, unlinkSync } from "node:fs";

const USER_EMAIL = "dmytro.taras@icloud.com";
const __dirname_ = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname_, "budgettier.db");

const SCHEMA_SQL = `
CREATE TABLE categories (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL,
    color TEXT DEFAULT '#6B7280', emoji TEXT, section TEXT
);
CREATE INDEX idx_categories_type ON categories(type);

CREATE TABLE wallets (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL,
    balance TEXT NOT NULL DEFAULT '0'
);

CREATE TABLE transactions (
    id TEXT PRIMARY KEY, type TEXT NOT NULL, amount TEXT NOT NULL,
    description TEXT, date INTEGER NOT NULL,
    category_id TEXT REFERENCES categories(id),
    wallet_id TEXT REFERENCES wallets(id),
    from_wallet_id TEXT REFERENCES wallets(id),
    to_wallet_id TEXT REFERENCES wallets(id),
    exclude_from_budget INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_transactions_category_id ON transactions(category_id);
CREATE INDEX idx_transactions_wallet_id ON transactions(wallet_id);
CREATE INDEX idx_transactions_type ON transactions(type);

CREATE TABLE settings (
    id TEXT PRIMARY KEY,
    currency TEXT NOT NULL DEFAULT 'USD',
    budget_period TEXT NOT NULL DEFAULT 'monthly',
    date_format TEXT NOT NULL DEFAULT 'MM/DD/YYYY',
    budget_limit_warnings INTEGER NOT NULL DEFAULT 1,
    monthly_reports INTEGER NOT NULL DEFAULT 1,
    weekly_summaries INTEGER NOT NULL DEFAULT 0,
    default_wallet_id TEXT REFERENCES wallets(id)
);

CREATE TABLE budget_goals (
    id TEXT PRIMARY KEY,
    category_id TEXT REFERENCES categories(id),
    monthly_limit TEXT NOT NULL, name TEXT NOT NULL
);
CREATE INDEX idx_budget_goals_category_id ON budget_goals(category_id);

CREATE TABLE budget_plans (
    id TEXT PRIMARY KEY, name TEXT NOT NULL,
    total_budget TEXT NOT NULL, savings_amount TEXT NOT NULL,
    savings_percentage TEXT NOT NULL, expense_budget TEXT NOT NULL,
    period TEXT NOT NULL DEFAULT 'monthly',
    month TEXT, year TEXT, is_active INTEGER DEFAULT 1,
    created_at INTEGER DEFAULT (unixepoch() * 1000),
    updated_at INTEGER DEFAULT (unixepoch() * 1000)
);
CREATE INDEX idx_budget_plans_month ON budget_plans(month);
CREATE INDEX idx_budget_plans_year ON budget_plans(year);
CREATE INDEX idx_budget_plans_active ON budget_plans(is_active);

CREATE TABLE budget_category_allocations (
    id TEXT PRIMARY KEY,
    budget_plan_id TEXT REFERENCES budget_plans(id),
    category_id TEXT REFERENCES categories(id),
    allocated_amount TEXT NOT NULL
);
CREATE INDEX idx_budget_allocations_plan_id ON budget_category_allocations(budget_plan_id);
CREATE INDEX idx_budget_allocations_category_id ON budget_category_allocations(category_id);
`;

function toMs(d: Date | string | number | null): number | null {
  if (d === null || d === undefined) return null;
  if (typeof d === "number") return d;
  return new Date(d).getTime();
}

function toDecimalString(n: unknown): string {
  if (n === null || n === undefined) return "0";
  if (typeof n === "string") return n;
  if (typeof n === "number") return n.toFixed(2);
  return String(n);
}

function toBoolInt(v: unknown): number {
  return v === true || v === 1 || v === "true" ? 1 : 0;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "❌ DATABASE_URL is not set.\n   Run with: DATABASE_URL='postgres://...' npx tsx scripts/migrate-from-supabase.ts",
    );
    process.exit(1);
  }

  console.log(`→ Connecting to Supabase Postgres…`);
  const pg = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false }, // Supabase needs SSL but cert chain isn't required
  });
  await pg.connect();

  // --- Find the user ---
  const { rows: userRows } = await pg.query<{ id: string; email: string }>(
    `SELECT id, email FROM users WHERE email = $1`,
    [USER_EMAIL],
  );
  if (userRows.length === 0) {
    console.error(`❌ No user found with email ${USER_EMAIL}`);
    await pg.end();
    process.exit(1);
  }
  const userId = userRows[0].id;
  console.log(`✓ Found user ${USER_EMAIL} (id=${userId})`);

  // --- Open / reset the SQLite output ---
  if (existsSync(OUT_PATH)) {
    unlinkSync(OUT_PATH);
    console.log(`✓ Removed previous ${OUT_PATH}`);
  }
  const sqlite = new Database(OUT_PATH);
  sqlite.pragma("foreign_keys = OFF"); // off during bulk insert; turn on after
  sqlite.exec(SCHEMA_SQL);
  console.log(`✓ Created fresh SQLite at ${OUT_PATH}`);

  const insertTx = sqlite.transaction(
    (rows: Record<string, any>[], sql: string) => {
      const stmt = sqlite.prepare(sql);
      for (const r of rows) stmt.run(r);
    },
  );

  // --- Wallets ---
  const wallets = (
    await pg.query(
      `SELECT id, name, type, balance FROM wallets WHERE user_id = $1`,
      [userId],
    )
  ).rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    balance: toDecimalString(r.balance),
  }));
  insertTx(
    wallets,
    `INSERT INTO wallets (id, name, type, balance) VALUES (@id, @name, @type, @balance)`,
  );
  console.log(`✓ wallets:     ${wallets.length}`);

  // --- Categories ---
  const categories = (
    await pg.query(
      `SELECT id, name, type, color, emoji, section FROM categories WHERE user_id = $1`,
      [userId],
    )
  ).rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    color: r.color ?? "#6B7280",
    emoji: r.emoji,
    section: r.section,
  }));
  insertTx(
    categories,
    `INSERT INTO categories (id, name, type, color, emoji, section)
     VALUES (@id, @name, @type, @color, @emoji, @section)`,
  );
  console.log(`✓ categories:  ${categories.length}`);

  // --- Transactions (drops repeat fields) ---
  const txs = (
    await pg.query(
      `SELECT id, type, amount, description, date, category_id, wallet_id,
              from_wallet_id, to_wallet_id, exclude_from_budget
       FROM transactions WHERE user_id = $1`,
      [userId],
    )
  ).rows.map((r) => ({
    id: r.id,
    type: r.type,
    amount: toDecimalString(r.amount),
    description: r.description,
    date: toMs(r.date)!,
    category_id: r.category_id,
    wallet_id: r.wallet_id,
    from_wallet_id: r.from_wallet_id,
    to_wallet_id: r.to_wallet_id,
    exclude_from_budget: toBoolInt(r.exclude_from_budget),
  }));
  insertTx(
    txs,
    `INSERT INTO transactions
       (id, type, amount, description, date, category_id, wallet_id,
        from_wallet_id, to_wallet_id, exclude_from_budget)
     VALUES (@id, @type, @amount, @description, @date, @category_id, @wallet_id,
             @from_wallet_id, @to_wallet_id, @exclude_from_budget)`,
  );
  console.log(`✓ transactions: ${txs.length}`);

  // --- Settings (collapse to one row) ---
  const settings = (
    await pg.query(
      `SELECT id, currency, budget_period, date_format,
              budget_limit_warnings, monthly_reports, weekly_summaries, default_wallet_id
       FROM settings WHERE user_id = $1 LIMIT 1`,
      [userId],
    )
  ).rows[0];
  if (settings) {
    sqlite
      .prepare(
        `INSERT INTO settings
           (id, currency, budget_period, date_format,
            budget_limit_warnings, monthly_reports, weekly_summaries, default_wallet_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        settings.id,
        settings.currency ?? "USD",
        settings.budget_period ?? "monthly",
        settings.date_format ?? "MM/DD/YYYY",
        toBoolInt(settings.budget_limit_warnings ?? true),
        toBoolInt(settings.monthly_reports ?? true),
        toBoolInt(settings.weekly_summaries ?? false),
        settings.default_wallet_id,
      );
    console.log(`✓ settings:    1`);
  } else {
    console.log(`✓ settings:    0 (none in source — app will create defaults)`);
  }

  // --- Budget goals ---
  const goals = (
    await pg.query(
      `SELECT id, category_id, monthly_limit, name FROM budget_goals WHERE user_id = $1`,
      [userId],
    )
  ).rows.map((r) => ({
    id: r.id,
    category_id: r.category_id,
    monthly_limit: toDecimalString(r.monthly_limit),
    name: r.name,
  }));
  insertTx(
    goals,
    `INSERT INTO budget_goals (id, category_id, monthly_limit, name)
     VALUES (@id, @category_id, @monthly_limit, @name)`,
  );
  console.log(`✓ budget_goals: ${goals.length}`);

  // --- Budget plans ---
  const plans = (
    await pg.query(
      `SELECT id, name, total_budget, savings_amount, savings_percentage, expense_budget,
              period, month, year, is_active, created_at, updated_at
       FROM budget_plans WHERE user_id = $1`,
      [userId],
    )
  ).rows.map((r) => ({
    id: r.id,
    name: r.name,
    total_budget: toDecimalString(r.total_budget),
    savings_amount: toDecimalString(r.savings_amount),
    savings_percentage: toDecimalString(r.savings_percentage),
    expense_budget: toDecimalString(r.expense_budget),
    period: r.period ?? "monthly",
    month: r.month,
    year: r.year,
    is_active: toBoolInt(r.is_active ?? true),
    created_at: toMs(r.created_at),
    updated_at: toMs(r.updated_at),
  }));
  insertTx(
    plans,
    `INSERT INTO budget_plans
       (id, name, total_budget, savings_amount, savings_percentage, expense_budget,
        period, month, year, is_active, created_at, updated_at)
     VALUES (@id, @name, @total_budget, @savings_amount, @savings_percentage, @expense_budget,
             @period, @month, @year, @is_active, @created_at, @updated_at)`,
  );
  console.log(`✓ budget_plans: ${plans.length}`);

  // --- Budget allocations ---
  const allocs = (
    await pg.query(
      `SELECT id, budget_plan_id, category_id, allocated_amount
       FROM budget_category_allocations WHERE user_id = $1`,
      [userId],
    )
  ).rows.map((r) => ({
    id: r.id,
    budget_plan_id: r.budget_plan_id,
    category_id: r.category_id,
    allocated_amount: toDecimalString(r.allocated_amount),
  }));
  insertTx(
    allocs,
    `INSERT INTO budget_category_allocations
       (id, budget_plan_id, category_id, allocated_amount)
     VALUES (@id, @budget_plan_id, @category_id, @allocated_amount)`,
  );
  console.log(`✓ budget_allocations: ${allocs.length}`);

  // --- Re-derive wallet balances from transactions for safety ---
  // (Handles any drift between stored and computed balances in source DB.)
  for (const w of wallets) {
    const row = sqlite
      .prepare(
        `SELECT COALESCE(SUM(
           CASE
             WHEN type = 'income'   AND wallet_id = ?       THEN  CAST(amount AS REAL)
             WHEN type = 'expense'  AND wallet_id = ?       THEN -CAST(amount AS REAL)
             WHEN type = 'transfer' AND to_wallet_id = ?    THEN  CAST(amount AS REAL)
             WHEN type = 'transfer' AND from_wallet_id = ?  THEN -CAST(amount AS REAL)
             ELSE 0
           END
         ), 0) AS total FROM transactions`,
      )
      .get(w.id, w.id, w.id, w.id) as { total: number };
    sqlite
      .prepare(`UPDATE wallets SET balance = ? WHERE id = ?`)
      .run(row.total.toFixed(2), w.id);
  }
  console.log(`✓ recomputed wallet balances from transactions`);

  sqlite.pragma("foreign_keys = ON");
  sqlite.close();
  await pg.end();

  console.log(
    `\n✅ Done. Output: ${OUT_PATH}\n\nNext step:\n  cp "${OUT_PATH}" "${process.env.HOME}/Library/Application Support/com.budgettier.app/budgettier.db"\n  Then quit and reopen Budgettier — your data will be there.\n`,
  );
}

main().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
