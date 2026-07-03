// Transaction CRUD with automatic wallet balance recomputation.
//
// Strategy: every mutation runs in a SQL transaction that (a) writes the
// transaction row, then (b) re-derives affected wallet balances by summing
// all transactions that touch them. This is O(N) per write but at our scale
// (~1000 transactions total) it's instant and removes any chance of drift.
//
// Date format: JS sends an ISO 8601 string; we parse to ms-since-epoch.
// We keep the same JSON field names the old Express API produced so the React
// hooks see no difference (date is sent back as ISO string).

use crate::db::DbPool;
use rusqlite::{params, Connection, Row};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Serialize)]
pub struct Transaction {
    pub id: String,
    #[serde(rename = "type")]
    pub type_: String,
    pub amount: String,
    pub description: Option<String>,
    pub date: String, // ISO 8601
    #[serde(rename = "categoryId")]
    pub category_id: Option<String>,
    #[serde(rename = "walletId")]
    pub wallet_id: Option<String>,
    #[serde(rename = "fromWalletId")]
    pub from_wallet_id: Option<String>,
    #[serde(rename = "toWalletId")]
    pub to_wallet_id: Option<String>,
    #[serde(rename = "excludeFromBudget")]
    pub exclude_from_budget: bool,
    #[serde(rename = "isOpening")]
    pub is_opening: bool,
}

#[derive(Debug, Deserialize)]
pub struct TransactionInput {
    #[serde(rename = "type")]
    pub type_: String,
    pub amount: Value, // string or number
    pub description: Option<String>,
    pub date: Value, // ISO string or millis
    #[serde(rename = "categoryId")]
    pub category_id: Option<String>,
    #[serde(rename = "walletId")]
    pub wallet_id: Option<String>,
    #[serde(rename = "fromWalletId")]
    pub from_wallet_id: Option<String>,
    #[serde(rename = "toWalletId")]
    pub to_wallet_id: Option<String>,
    #[serde(rename = "excludeFromBudget")]
    pub exclude_from_budget: Option<bool>,
}

fn amount_to_string(v: &Value) -> Result<String, String> {
    match v {
        Value::String(s) => Ok(s.clone()),
        Value::Number(n) => Ok(n.to_string()),
        _ => Err("amount must be string or number".into()),
    }
}

fn date_to_ms(v: &Value) -> Result<i64, String> {
    match v {
        Value::Number(n) => n.as_i64().ok_or_else(|| "date number not int".into()),
        Value::String(s) => {
            // Accept ISO 8601 ("2026-01-15T00:00:00Z" or "2026-01-15") and convert to ms.
            // Hand-roll a tiny parser to avoid pulling chrono into deps.
            // First try as integer.
            if let Ok(n) = s.parse::<i64>() {
                return Ok(n);
            }
            // Try ISO via std: split into date + time, fall back to date-only.
            // Simplest: use SQLite's strftime through a one-shot call. But we don't
            // have a connection here, so do it inline.
            parse_iso_to_ms(s)
        }
        _ => Err("date must be string or number".into()),
    }
}

/// Parse "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM:SS[.sss][Z|+HH:MM]" to ms-since-epoch (UTC).
fn parse_iso_to_ms(s: &str) -> Result<i64, String> {
    // Cheap parser: rely on the canonical shapes JS Date.toISOString() produces
    // ("YYYY-MM-DDTHH:MM:SS.sssZ") and the date-only variant the form sends.
    let bytes = s.as_bytes();
    if bytes.len() < 10 || bytes[4] != b'-' || bytes[7] != b'-' {
        return Err(format!("unrecognized date format: {s}"));
    }
    let y: i32 = s[0..4].parse().map_err(|e| format!("year: {e}"))?;
    let m: u32 = s[5..7].parse().map_err(|e| format!("month: {e}"))?;
    let d: u32 = s[8..10].parse().map_err(|e| format!("day: {e}"))?;

    let (hh, mm, ss, ms) = if bytes.len() >= 19 && (bytes[10] == b'T' || bytes[10] == b' ') {
        let hh: u32 = s[11..13].parse().map_err(|e| format!("hour: {e}"))?;
        let mm: u32 = s[14..16].parse().map_err(|e| format!("min: {e}"))?;
        let ss: u32 = s[17..19].parse().map_err(|e| format!("sec: {e}"))?;
        let ms: u32 = if bytes.len() >= 23 && bytes[19] == b'.' {
            s[20..23].parse().unwrap_or(0)
        } else {
            0
        };
        (hh, mm, ss, ms)
    } else {
        (0, 0, 0, 0)
    };

    // Days from 1970-01-01 to y-m-d using the civil-from-ymd algorithm
    // (Howard Hinnant). Treats input as UTC.
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = (y - era * 400) as u32; // 0..=399
    let doy = (153 * if m > 2 { m - 3 } else { m + 9 } as i64 + 2) / 5
        + d as i64
        - 1;
    let doe = yoe as i64 * 365 + (yoe / 4) as i64 - (yoe / 100) as i64 + doy;
    let days = era as i64 * 146097 + doe - 719468;

    let secs = days * 86400 + hh as i64 * 3600 + mm as i64 * 60 + ss as i64;
    Ok(secs * 1000 + ms as i64)
}

fn ms_to_iso(ms: i64) -> String {
    // Inverse of parse_iso_to_ms — produce JS-compatible "YYYY-MM-DDTHH:MM:SS.sssZ".
    let total_ms = ms;
    let secs = total_ms.div_euclid(1000);
    let ms_part = total_ms.rem_euclid(1000) as u32;
    let days = secs.div_euclid(86400);
    let tod = secs.rem_euclid(86400) as u32;
    let hh = tod / 3600;
    let mm = (tod % 3600) / 60;
    let ss = tod % 60;

    // Civil-from-days (Hinnant)
    let z = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64; // 0..=146096
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = (if mp < 10 { mp + 3 } else { mp - 9 }) as u32;
    let y = if m <= 2 { y + 1 } else { y };

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        y, m, d, hh, mm, ss, ms_part
    )
}

fn row_to_transaction(row: &Row) -> rusqlite::Result<Transaction> {
    let date_ms: i64 = row.get(4)?;
    Ok(Transaction {
        id: row.get(0)?,
        type_: row.get(1)?,
        amount: row.get(2)?,
        description: row.get(3)?,
        date: ms_to_iso(date_ms),
        category_id: row.get(5)?,
        wallet_id: row.get(6)?,
        from_wallet_id: row.get(7)?,
        to_wallet_id: row.get(8)?,
        exclude_from_budget: row.get::<_, i64>(9)? != 0,
        is_opening: row.get::<_, i64>(10)? != 0,
    })
}

// Columns for INSERT — 10 fields (is_opening defaults to 0 via schema).
const SELECT_COLS: &str = "id, type, amount, description, date, category_id, wallet_id,
                           from_wallet_id, to_wallet_id, exclude_from_budget";
// Columns for SELECT/read — includes is_opening at index 10.
const READ_COLS: &str = "id, type, amount, description, date, category_id, wallet_id,
                         from_wallet_id, to_wallet_id, exclude_from_budget, is_opening";

#[tauri::command]
pub fn get_transactions(
    pool: State<DbPool>,
    start_date: Option<String>,
    end_date: Option<String>,
) -> Result<Vec<Transaction>, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let rows = match (start_date, end_date) {
        (Some(s), Some(e)) => {
            let start_ms = parse_iso_to_ms(&s)?;
            let end_ms = parse_iso_to_ms(&e)?;
            let mut stmt = conn
                .prepare(&format!(
                    "SELECT {READ_COLS} FROM transactions
                     WHERE date >= ?1 AND date <= ?2 ORDER BY date DESC"
                ))
                .map_err(|e| e.to_string())?;
            let mapped = stmt
                .query_map(params![start_ms, end_ms], row_to_transaction)
                .map_err(|e| e.to_string())?;
            let collected: Result<Vec<_>, _> = mapped.collect();
            collected.map_err(|e| e.to_string())?
        }
        _ => {
            let mut stmt = conn
                .prepare(&format!(
                    "SELECT {READ_COLS} FROM transactions ORDER BY date DESC"
                ))
                .map_err(|e| e.to_string())?;
            let mapped = stmt
                .query_map([], row_to_transaction)
                .map_err(|e| e.to_string())?;
            let collected: Result<Vec<_>, _> = mapped.collect();
            collected.map_err(|e| e.to_string())?
        }
    };
    Ok(rows)
}

#[tauri::command]
pub fn create_transaction(
    pool: State<DbPool>,
    input: TransactionInput,
) -> Result<Transaction, String> {
    let mut conn = pool.get().map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();
    let amount = amount_to_string(&input.amount)?;
    let date_ms = date_to_ms(&input.date)?;
    let exclude = input.exclude_from_budget.unwrap_or(false);

    if input.type_ == "transfer" {
        let from = input
            .from_wallet_id
            .as_ref()
            .ok_or("transfer requires fromWalletId")?;
        let to = input
            .to_wallet_id
            .as_ref()
            .ok_or("transfer requires toWalletId")?;
        if from == to {
            return Err("Cannot transfer to the same wallet".into());
        }
    } else if input.type_ == "income" || input.type_ == "expense" {
        if input.wallet_id.is_none() {
            return Err(format!("{} transactions require a walletId", input.type_));
        }
        if input.category_id.is_none() {
            return Err(format!("{} transactions require a categoryId", input.type_));
        }
    } else {
        return Err(format!("unknown transaction type: {}", input.type_));
    }

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        &format!(
            "INSERT INTO transactions ({SELECT_COLS}) VALUES
             (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)"
        ),
        params![
            id,
            input.type_,
            amount,
            input.description,
            date_ms,
            input.category_id,
            input.wallet_id,
            input.from_wallet_id,
            input.to_wallet_id,
            if exclude { 1_i64 } else { 0_i64 },
        ],
    )
    .map_err(|e| e.to_string())?;

    // Recompute affected wallet balances.
    let mut affected: Vec<String> = Vec::new();
    if let Some(w) = &input.wallet_id {
        affected.push(w.clone());
    }
    if let Some(w) = &input.from_wallet_id {
        affected.push(w.clone());
    }
    if let Some(w) = &input.to_wallet_id {
        affected.push(w.clone());
    }
    for w in &affected {
        recompute_wallet_balance(&tx, w).map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;

    let conn2 = pool.get().map_err(|e| e.to_string())?;
    let row = conn2
        .query_row(
            &format!("SELECT {READ_COLS} FROM transactions WHERE id = ?1"),
            params![id],
            row_to_transaction,
        )
        .map_err(|e| e.to_string())?;
    Ok(row)
}

#[tauri::command]
pub fn update_transaction(
    pool: State<DbPool>,
    id: String,
    input: Value,
) -> Result<Transaction, String> {
    let mut conn = pool.get().map_err(|e| e.to_string())?;
    let map = input
        .as_object()
        .ok_or("transaction update must be an object")?;

    // Capture old wallet refs so we recompute their balances too.
    let old: (Option<String>, Option<String>, Option<String>) = conn
        .query_row(
            "SELECT wallet_id, from_wallet_id, to_wallet_id FROM transactions WHERE id = ?1",
            params![id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map_err(|e| e.to_string())?;

    let mut sets: Vec<String> = Vec::new();
    let mut bind: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    macro_rules! add_text {
        ($col:expr, $v:expr) => {{
            sets.push(format!("{} = ?{}", $col, bind.len() + 1));
            bind.push(Box::new($v));
        }};
    }
    for (k, v) in map {
        match k.as_str() {
            "type" => {
                if let Some(s) = v.as_str() {
                    add_text!("type", s.to_string());
                }
            }
            "amount" => add_text!("amount", amount_to_string(v)?),
            "description" => {
                if v.is_null() {
                    add_text!("description", Option::<String>::None);
                } else if let Some(s) = v.as_str() {
                    add_text!("description", Some(s.to_string()));
                }
            }
            "date" => add_text!("date", date_to_ms(v)?),
            "categoryId" => {
                if v.is_null() {
                    add_text!("category_id", Option::<String>::None);
                } else if let Some(s) = v.as_str() {
                    add_text!("category_id", Some(s.to_string()));
                }
            }
            "walletId" => {
                if v.is_null() {
                    add_text!("wallet_id", Option::<String>::None);
                } else if let Some(s) = v.as_str() {
                    add_text!("wallet_id", Some(s.to_string()));
                }
            }
            "fromWalletId" => {
                if v.is_null() {
                    add_text!("from_wallet_id", Option::<String>::None);
                } else if let Some(s) = v.as_str() {
                    add_text!("from_wallet_id", Some(s.to_string()));
                }
            }
            "toWalletId" => {
                if v.is_null() {
                    add_text!("to_wallet_id", Option::<String>::None);
                } else if let Some(s) = v.as_str() {
                    add_text!("to_wallet_id", Some(s.to_string()));
                }
            }
            "excludeFromBudget" => {
                if let Some(b) = v.as_bool() {
                    add_text!("exclude_from_budget", if b { 1_i64 } else { 0_i64 });
                }
            }
            _ => {}
        }
    }

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    if !sets.is_empty() {
        let sql = format!(
            "UPDATE transactions SET {} WHERE id = ?{}",
            sets.join(", "),
            bind.len() + 1
        );
        bind.push(Box::new(id.clone()));
        let bind_refs: Vec<&dyn rusqlite::ToSql> = bind.iter().map(|b| b.as_ref()).collect();
        let n = tx.execute(&sql, bind_refs.as_slice()).map_err(|e| e.to_string())?;
        if n == 0 {
            return Err(format!("transaction {id} not found"));
        }
    }

    // Re-derive any wallet that was involved (old or new)
    let new: (Option<String>, Option<String>, Option<String>) = tx
        .query_row(
            "SELECT wallet_id, from_wallet_id, to_wallet_id FROM transactions WHERE id = ?1",
            params![id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map_err(|e| e.to_string())?;
    let mut to_recompute: Vec<String> = Vec::new();
    for w in [old.0, old.1, old.2, new.0, new.1, new.2].into_iter().flatten() {
        if !to_recompute.contains(&w) {
            to_recompute.push(w);
        }
    }
    for w in &to_recompute {
        recompute_wallet_balance(&tx, w).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;

    let conn2 = pool.get().map_err(|e| e.to_string())?;
    let row = conn2
        .query_row(
            &format!("SELECT {READ_COLS} FROM transactions WHERE id = ?1"),
            params![id],
            row_to_transaction,
        )
        .map_err(|e| e.to_string())?;
    Ok(row)
}

#[tauri::command]
pub fn delete_transaction(pool: State<DbPool>, id: String) -> Result<(), String> {
    let mut conn = pool.get().map_err(|e| e.to_string())?;
    let old: (Option<String>, Option<String>, Option<String>) = conn
        .query_row(
            "SELECT wallet_id, from_wallet_id, to_wallet_id FROM transactions WHERE id = ?1",
            params![id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let removed = tx
        .execute("DELETE FROM transactions WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    if removed == 0 {
        return Err(format!("transaction {id} not found"));
    }
    for w in [old.0, old.1, old.2].into_iter().flatten() {
        recompute_wallet_balance(&tx, &w).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

/// Recompute a wallet's balance by summing all transactions that touch it.
/// Income → +amount on wallet_id. Expense → -amount on wallet_id.
/// Transfer → -amount on from_wallet_id, +amount on to_wallet_id.
fn recompute_wallet_balance(conn: &Connection, wallet_id: &str) -> rusqlite::Result<()> {
    let total: f64 = conn.query_row(
        "SELECT COALESCE(SUM(
            CASE
              WHEN type = 'income'  AND wallet_id = ?1      THEN  CAST(amount AS REAL)
              WHEN type = 'expense' AND wallet_id = ?1      THEN -CAST(amount AS REAL)
              WHEN type = 'transfer' AND to_wallet_id = ?1  THEN  CAST(amount AS REAL)
              WHEN type = 'transfer' AND from_wallet_id = ?1 THEN -CAST(amount AS REAL)
              ELSE 0
            END
        ), 0) FROM transactions",
        params![wallet_id],
        |r| r.get(0),
    )?;
    // Format with 2 decimals to match the legacy decimal(12,2) representation.
    let formatted = format!("{:.2}", total);
    conn.execute(
        "UPDATE wallets SET balance = ?1 WHERE id = ?2",
        params![formatted, wallet_id],
    )?;
    Ok(())
}
