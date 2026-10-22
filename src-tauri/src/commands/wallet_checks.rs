// Balance checks: the user tells us what the bank says a wallet holds, we
// compare it with the balance derived from transactions and remember the
// result. The latest check per wallet is a checkpoint — the next check only
// needs to look at what changed since.
//
// A Wise import records a check automatically from the statement's
// "Running Balance" (source = "statement"); manual checks use "manual".
// adjust_wallet_balance closes a gap with a "Balance adjustment" transaction
// that is excluded from the budget, so it never shows up as spending.

use crate::db::DbPool;
use rusqlite::{params, Connection, Row};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Serialize)]
pub struct WalletCheck {
    pub id: String,
    #[serde(rename = "walletId")]
    pub wallet_id: String,
    #[serde(rename = "checkedAt")]
    pub checked_at: i64,
    #[serde(rename = "bankBalance")]
    pub bank_balance: String,
    #[serde(rename = "appBalance")]
    pub app_balance: String,
    pub source: String,
}

const CHECK_COLS: &str = "id, wallet_id, checked_at, bank_balance, app_balance, source";

fn row_to_check(row: &Row) -> rusqlite::Result<WalletCheck> {
    Ok(WalletCheck {
        id: row.get(0)?,
        wallet_id: row.get(1)?,
        checked_at: row.get(2)?,
        bank_balance: row.get(3)?,
        app_balance: row.get(4)?,
        source: row.get(5)?,
    })
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// A wallet's balance from its transactions, up to and including `at`.
pub fn balance_at(conn: &Connection, wallet_id: &str, at: i64) -> rusqlite::Result<f64> {
    conn.query_row(
        "SELECT COALESCE(SUM(
            CASE
              WHEN type = 'income'   AND wallet_id = ?1      THEN  CAST(amount AS REAL)
              WHEN type = 'expense'  AND wallet_id = ?1      THEN -CAST(amount AS REAL)
              WHEN type = 'transfer' AND to_wallet_id = ?1   THEN  CAST(amount AS REAL)
              WHEN type = 'transfer' AND from_wallet_id = ?1 THEN -CAST(amount AS REAL)
              ELSE 0
            END), 0)
         FROM transactions WHERE date <= ?2",
        params![wallet_id, at],
        |r| r.get(0),
    )
}

fn parse_money(s: &str) -> Result<f64, String> {
    s.trim()
        .replace(',', ".")
        .parse::<f64>()
        .map_err(|_| format!("not an amount: {s}"))
}

fn insert_check(
    conn: &Connection,
    wallet_id: &str,
    at: i64,
    bank: f64,
    app: f64,
    source: &str,
) -> rusqlite::Result<WalletCheck> {
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO wallet_checks (id, wallet_id, checked_at, bank_balance, app_balance, source)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, wallet_id, at, format!("{bank:.2}"), format!("{app:.2}"), source],
    )?;
    conn.query_row(&format!("SELECT {CHECK_COLS} FROM wallet_checks WHERE id = ?1"), params![id], row_to_check)
}

/// The latest check of every wallet that has one.
#[tauri::command]
pub fn get_wallet_checks(pool: State<DbPool>) -> Result<Vec<WalletCheck>, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {CHECK_COLS} FROM wallet_checks c
             WHERE checked_at = (SELECT MAX(checked_at) FROM wallet_checks WHERE wallet_id = c.wallet_id)
             GROUP BY wallet_id"
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], row_to_check).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
pub struct RecordCheckInput {
    #[serde(rename = "walletId")]
    pub wallet_id: String,
    #[serde(rename = "bankBalance")]
    pub bank_balance: String,
    /// When the bank showed that balance (a statement's last operation);
    /// defaults to now.
    #[serde(rename = "atMs")]
    pub at_ms: Option<i64>,
    pub source: Option<String>,
}

#[tauri::command]
pub fn record_wallet_check(pool: State<DbPool>, input: RecordCheckInput) -> Result<WalletCheck, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let bank = parse_money(&input.bank_balance)?;
    let at = input.at_ms.unwrap_or_else(now_ms);
    let app = balance_at(&conn, &input.wallet_id, at).map_err(|e| e.to_string())?;
    let source = input.source.as_deref().unwrap_or("manual");
    insert_check(&conn, &input.wallet_id, at, bank, app, source).map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
pub struct AdjustInput {
    #[serde(rename = "walletId")]
    pub wallet_id: String,
    #[serde(rename = "bankBalance")]
    pub bank_balance: String,
}

/// Make the wallet match the bank now: book the difference as a Balance
/// adjustment (kept out of the budget) and record a matching check.
pub fn adjust_to(conn: &mut Connection, wallet_id: &str, bank: f64, at: i64) -> Result<WalletCheck, String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let app = balance_at(&tx, wallet_id, at).map_err(|e| e.to_string())?;
    let diff = ((bank - app) * 100.0).round() / 100.0;
    if diff.abs() >= 0.01 {
        let type_ = if diff > 0.0 { "income" } else { "expense" };
        let category: String = tx
            .query_row(
                "SELECT id FROM categories WHERE name = 'Balance adjustment' AND type = ?1 LIMIT 1",
                params![type_],
                |r| r.get(0),
            )
            .map_err(|e| format!("Balance adjustment category missing: {e}"))?;
        tx.execute(
            "INSERT INTO transactions (id, type, amount, description, date, category_id, wallet_id, exclude_from_budget)
             VALUES (?1, ?2, ?3, 'Balance adjustment — matched to the bank', ?4, ?5, ?6, 1)",
            params![Uuid::new_v4().to_string(), type_, format!("{:.2}", diff.abs()), at, category, wallet_id],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "UPDATE wallets SET balance = ?1 WHERE id = ?2",
            params![format!("{:.2}", balance_at(&tx, wallet_id, i64::MAX).map_err(|e| e.to_string())?), wallet_id],
        )
        .map_err(|e| e.to_string())?;
    }
    let check = insert_check(&tx, wallet_id, at, bank, bank, "manual").map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(check)
}

#[tauri::command]
pub fn adjust_wallet_balance(pool: State<DbPool>, input: AdjustInput) -> Result<WalletCheck, String> {
    let mut conn = pool.get().map_err(|e| e.to_string())?;
    let bank = parse_money(&input.bank_balance)?;
    adjust_to(&mut conn, &input.wallet_id, bank, now_ms())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adjustment_closes_the_gap_and_stays_out_of_the_budget() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        crate::db::migrate(&conn).unwrap();
        crate::commands::opening_balance::seed_opening_categories(&conn).unwrap();
        conn.execute_batch(
            "INSERT INTO wallets (id, name, type, balance) VALUES ('n', 'N26', 'bank', '0');
             INSERT INTO categories (id, name, type) VALUES ('g', 'Gas', 'expense');
             INSERT INTO transactions (id, type, amount, date, category_id, wallet_id) VALUES ('t', 'expense', '39', 1000, 'g', 'n');",
        )
        .unwrap();
        // App says −39, bank says 100 → +139 adjustment.
        let check = adjust_to(&mut conn, "n", 100.0, 2000).unwrap();
        assert_eq!(check.app_balance, "100.00");
        assert!((balance_at(&conn, "n", i64::MAX).unwrap() - 100.0).abs() < 1e-9);
        let excluded: i64 = conn
            .query_row("SELECT exclude_from_budget FROM transactions WHERE description LIKE 'Balance adjustment%'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(excluded, 1);
        // Already matching → no new transaction.
        adjust_to(&mut conn, "n", 100.0, 3000).unwrap();
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM transactions", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 2);
    }
}
