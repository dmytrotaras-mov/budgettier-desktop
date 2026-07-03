// Opening balance support.
//
// An "opening balance" is the money a wallet held before the user started
// tracking transactions. It's stored as a special transaction:
//   - type = income (positive) or expense (negative amount)
//   - is_opening = 1  → hidden from transaction lists
//   - exclude_from_budget = 1 → doesn't pollute income/expense stats
//   - category = "Opening Balance" (income or expense variant)
//   - date = user-chosen (defaults to the day before the wallet's first tx)
//
// It DOES count toward the wallet balance (recompute sums all transactions),
// so the balance and the Overview balance line finally reflect real money.
//
// One opening transaction per wallet — set_opening_balance replaces any prior.

use crate::db::DbPool;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

const OPENING_CATEGORY_NAME: &str = "Opening Balance";

#[derive(Debug, Serialize)]
pub struct OpeningBalance {
    pub id: String,
    #[serde(rename = "walletId")]
    pub wallet_id: String,
    /// Signed amount: positive means the wallet started with money, negative debt.
    pub amount: String,
    /// ISO date string (YYYY-MM-DD).
    pub date: String,
}

#[derive(Debug, Deserialize)]
pub struct SetOpeningInput {
    #[serde(rename = "walletId")]
    pub wallet_id: String,
    /// Signed amount as string, e.g. "1500.00" or "-320.00".
    pub amount: String,
    /// ISO date "YYYY-MM-DD".
    pub date: String,
}

/// Ensure the two Opening Balance categories exist. Called during db init.
/// Idempotent — only inserts if missing.
pub fn seed_opening_categories(conn: &Connection) -> rusqlite::Result<()> {
    for type_ in ["income", "expense"] {
        let exists: i64 = conn.query_row(
            "SELECT COUNT(*) FROM categories WHERE name = ?1 AND type = ?2",
            params![OPENING_CATEGORY_NAME, type_],
            |r| r.get(0),
        )?;
        if exists == 0 {
            let id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO categories (id, name, type, color, emoji, section)
                 VALUES (?1, ?2, ?3, '#9CA3AF', '🏦', 'System')",
                params![id, OPENING_CATEGORY_NAME, type_],
            )?;
        }
    }
    Ok(())
}

fn opening_category_id(conn: &Connection, type_: &str) -> rusqlite::Result<String> {
    conn.query_row(
        "SELECT id FROM categories WHERE name = ?1 AND type = ?2 LIMIT 1",
        params![OPENING_CATEGORY_NAME, type_],
        |r| r.get(0),
    )
}

/// Convert "YYYY-MM-DD" to ms-since-epoch (UTC midnight).
fn date_to_ms(s: &str) -> Result<i64, String> {
    if s.len() < 10 {
        return Err(format!("bad date: {s}"));
    }
    let y: i32 = s[0..4].parse().map_err(|_| "bad year")?;
    let m: u32 = s[5..7].parse().map_err(|_| "bad month")?;
    let d: u32 = s[8..10].parse().map_err(|_| "bad day")?;
    let y2 = if m <= 2 { y - 1 } else { y };
    let era = if y2 >= 0 { y2 } else { y2 - 399 } / 400;
    let yoe = (y2 - era * 400) as u32;
    let doy = (153 * if m > 2 { m - 3 } else { m + 9 } as i64 + 2) / 5 + d as i64 - 1;
    let doe = yoe as i64 * 365 + (yoe / 4) as i64 - (yoe / 100) as i64 + doy;
    let days = era as i64 * 146097 + doe - 719468;
    Ok(days * 86_400_000)
}

fn ms_to_date(ms: i64) -> String {
    let days = ms.div_euclid(86_400_000);
    let z = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = (if mp < 10 { mp + 3 } else { mp - 9 }) as u32;
    let y = if m <= 2 { y + 1 } else { y };
    format!("{:04}-{:02}-{:02}", y, m, d)
}

#[tauri::command]
pub fn get_opening_balance(
    pool: State<DbPool>,
    wallet_id: String,
) -> Result<Option<OpeningBalance>, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let row = conn
        .query_row(
            "SELECT id, type, amount, date FROM transactions
             WHERE wallet_id = ?1 AND is_opening = 1 LIMIT 1",
            params![wallet_id],
            |r| {
                let id: String = r.get(0)?;
                let type_: String = r.get(1)?;
                let amount: String = r.get(2)?;
                let date_ms: i64 = r.get(3)?;
                Ok((id, type_, amount, date_ms))
            },
        )
        .ok();
    Ok(row.map(|(id, type_, amount, date_ms)| {
        // Present a signed amount: expense opening → negative.
        let signed = if type_ == "expense" {
            format!("-{}", amount)
        } else {
            amount
        };
        OpeningBalance {
            id,
            wallet_id,
            amount: signed,
            date: ms_to_date(date_ms),
        }
    }))
}

/// Suggest the opening date = day before the wallet's earliest non-opening
/// transaction. Returns today if the wallet has no transactions yet.
#[tauri::command]
pub fn suggest_opening_date(pool: State<DbPool>, wallet_id: String) -> Result<String, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let earliest: Option<i64> = conn
        .query_row(
            "SELECT MIN(date) FROM transactions
             WHERE is_opening = 0 AND
                   (wallet_id = ?1 OR from_wallet_id = ?1 OR to_wallet_id = ?1)",
            params![wallet_id],
            |r| r.get(0),
        )
        .ok()
        .flatten();
    match earliest {
        Some(ms) => Ok(ms_to_date(ms - 86_400_000)), // day before
        None => {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0);
            Ok(ms_to_date(now))
        }
    }
}

#[tauri::command]
pub fn set_opening_balance(
    pool: State<DbPool>,
    input: SetOpeningInput,
) -> Result<OpeningBalance, String> {
    let mut conn = pool.get().map_err(|e| e.to_string())?;
    let amount_f: f64 = input
        .amount
        .trim()
        .replace(',', ".")
        .parse()
        .map_err(|_| format!("invalid amount: {}", input.amount))?;
    let date_ms = date_to_ms(&input.date)?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Remove any prior opening transaction for this wallet.
    tx.execute(
        "DELETE FROM transactions WHERE wallet_id = ?1 AND is_opening = 1",
        params![input.wallet_id],
    )
    .map_err(|e| e.to_string())?;

    // Zero opening balance → just clear it, no new row.
    if amount_f != 0.0 {
        let type_ = if amount_f >= 0.0 { "income" } else { "expense" };
        let cat_id = opening_category_id(&tx, type_).map_err(|e| e.to_string())?;
        let id = Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO transactions
                (id, type, amount, description, date, category_id, wallet_id,
                 exclude_from_budget, is_opening)
             VALUES (?1, ?2, ?3, 'Opening balance', ?4, ?5, ?6, 1, 1)",
            params![
                id,
                type_,
                format!("{:.2}", amount_f.abs()),
                date_ms,
                cat_id,
                input.wallet_id,
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    recompute_balance(&tx, &input.wallet_id).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;

    get_opening_balance(pool, input.wallet_id)
        .map(|o| o.unwrap_or(OpeningBalance {
            id: String::new(),
            wallet_id: String::new(),
            amount: "0.00".into(),
            date: input.date,
        }))
}

fn recompute_balance(conn: &Connection, wallet_id: &str) -> rusqlite::Result<()> {
    let total: f64 = conn.query_row(
        "SELECT COALESCE(SUM(
            CASE
              WHEN type = 'income'   AND wallet_id = ?1       THEN  CAST(amount AS REAL)
              WHEN type = 'expense'  AND wallet_id = ?1       THEN -CAST(amount AS REAL)
              WHEN type = 'transfer' AND to_wallet_id = ?1    THEN  CAST(amount AS REAL)
              WHEN type = 'transfer' AND from_wallet_id = ?1  THEN -CAST(amount AS REAL)
              ELSE 0
            END
        ), 0) FROM transactions",
        params![wallet_id],
        |r| r.get(0),
    )?;
    conn.execute(
        "UPDATE wallets SET balance = ?1 WHERE id = ?2",
        params![format!("{:.2}", total), wallet_id],
    )?;
    Ok(())
}
