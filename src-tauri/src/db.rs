// SQLite database setup. Opens (or creates) the local DB file under the app's
// data directory, applies foreign-key enforcement, and runs schema migrations.
//
// The pool (DbPool) is registered as Tauri state and accessed by commands via
// `tauri::State<DbPool>`. Each command checks out a connection for its work.

use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::Connection;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub type DbPool = Pool<SqliteConnectionManager>;

/// Resolve the on-disk path for our SQLite file. macOS:
///   ~/Library/Application Support/com.budgettier.app/budgettier.db
pub fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let mut dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("could not resolve app data dir: {e}"))?;
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("could not create app data dir: {e}"))?;
    dir.push("budgettier.db");
    Ok(dir)
}

/// Build the connection pool, enable FK enforcement, run migrations.
/// Also handles a staged restore: if `<db>.pending` exists, replace the live
/// db with it before opening (one-shot, then deleted).
pub fn init(app: &AppHandle) -> Result<DbPool, String> {
    let path = db_path(app)?;
    let pending = path.with_file_name(format!(
        "{}.pending",
        path.file_name().map(|s| s.to_string_lossy()).unwrap_or_default()
    ));
    if pending.exists() {
        eprintln!("[db] applying pending restore: {}", pending.display());
        std::fs::rename(&pending, &path)
            .map_err(|e| format!("could not apply restore: {e}"))?;
    }
    eprintln!("[db] opening {}", path.display());

    let manager = SqliteConnectionManager::file(&path).with_init(|conn| {
        // Foreign keys are off by default in SQLite — enable per connection.
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;
        Ok(())
    });
    let pool = Pool::builder()
        .max_size(8)
        .build(manager)
        .map_err(|e| format!("pool build failed: {e}"))?;

    let conn = pool
        .get()
        .map_err(|e| format!("checkout for migration failed: {e}"))?;
    migrate(&conn).map_err(|e| format!("migration failed: {e}"))?;

    Ok(pool)
}

/// Idempotent CREATE TABLE statements. Mirrors shared/schema.ts.
/// Adding a new column? Bump this with `ALTER TABLE ... ADD COLUMN ...`
/// guarded by a check on `pragma_table_info`. For now everything is fresh.
fn migrate(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS categories (
            id        TEXT PRIMARY KEY,
            name      TEXT NOT NULL,
            type      TEXT NOT NULL,
            color     TEXT DEFAULT '#6B7280',
            emoji     TEXT,
            section   TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_categories_type ON categories(type);

        CREATE TABLE IF NOT EXISTS wallets (
            id      TEXT PRIMARY KEY,
            name    TEXT NOT NULL,
            type    TEXT NOT NULL,
            balance TEXT NOT NULL DEFAULT '0'
        );

        CREATE TABLE IF NOT EXISTS transactions (
            id                  TEXT PRIMARY KEY,
            type                TEXT NOT NULL,
            amount              TEXT NOT NULL,
            description         TEXT,
            date                INTEGER NOT NULL,
            category_id         TEXT REFERENCES categories(id),
            wallet_id           TEXT REFERENCES wallets(id),
            from_wallet_id      TEXT REFERENCES wallets(id),
            to_wallet_id        TEXT REFERENCES wallets(id),
            exclude_from_budget INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
        CREATE INDEX IF NOT EXISTS idx_transactions_category_id ON transactions(category_id);
        CREATE INDEX IF NOT EXISTS idx_transactions_wallet_id ON transactions(wallet_id);
        CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);

        CREATE TABLE IF NOT EXISTS settings (
            id                     TEXT PRIMARY KEY,
            currency               TEXT NOT NULL DEFAULT 'USD',
            budget_period          TEXT NOT NULL DEFAULT 'monthly',
            date_format            TEXT NOT NULL DEFAULT 'MM/DD/YYYY',
            budget_limit_warnings  INTEGER NOT NULL DEFAULT 1,
            monthly_reports        INTEGER NOT NULL DEFAULT 1,
            weekly_summaries       INTEGER NOT NULL DEFAULT 0,
            default_wallet_id      TEXT REFERENCES wallets(id)
        );

        CREATE TABLE IF NOT EXISTS budget_goals (
            id            TEXT PRIMARY KEY,
            category_id   TEXT REFERENCES categories(id),
            monthly_limit TEXT NOT NULL,
            name          TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_budget_goals_category_id ON budget_goals(category_id);

        CREATE TABLE IF NOT EXISTS budget_plans (
            id                 TEXT PRIMARY KEY,
            name               TEXT NOT NULL,
            total_budget       TEXT NOT NULL,
            savings_amount     TEXT NOT NULL,
            savings_percentage TEXT NOT NULL,
            expense_budget     TEXT NOT NULL,
            period             TEXT NOT NULL DEFAULT 'monthly',
            month              TEXT,
            year               TEXT,
            is_active          INTEGER DEFAULT 1,
            created_at         INTEGER DEFAULT (unixepoch() * 1000),
            updated_at         INTEGER DEFAULT (unixepoch() * 1000)
        );
        CREATE INDEX IF NOT EXISTS idx_budget_plans_month ON budget_plans(month);
        CREATE INDEX IF NOT EXISTS idx_budget_plans_year ON budget_plans(year);
        CREATE INDEX IF NOT EXISTS idx_budget_plans_active ON budget_plans(is_active);

        CREATE TABLE IF NOT EXISTS budget_category_allocations (
            id               TEXT PRIMARY KEY,
            budget_plan_id   TEXT REFERENCES budget_plans(id),
            category_id      TEXT REFERENCES categories(id),
            allocated_amount TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_budget_allocations_plan_id
            ON budget_category_allocations(budget_plan_id);
        CREATE INDEX IF NOT EXISTS idx_budget_allocations_category_id
            ON budget_category_allocations(category_id);
        "#,
    )
}
