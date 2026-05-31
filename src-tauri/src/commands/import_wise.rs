// Wise CSV importer.
//
// Two-phase flow:
//   1. preview_wise_csv  — parses file, classifies rows, returns a preview
//      array. NO writes to DB. Frontend shows table, user edits.
//   2. import_wise_csv   — takes the user-confirmed preview, writes rows
//      into the DB in one SQL transaction, recomputes wallet balances.
//
// Classification logic (per row):
//   * Skip empty rows.
//   * `Transaction Details Type = CONVERSION` and description matches
//     "Moved X EUR from <Y>" → transfer. Source wallet = match by name.
//   * `Transaction Type = CREDIT` AND amount > 0 → income (or transfer
//     if Payer Name == Card Holder Full Name).
//   * Otherwise (`DEBIT`) → expense.
//
// Dedup: by TransferWise ID column → external_id in DB.
//
// Pre-auth pairs: two rows with same merchant + same |amount| + opposite
// signs within 60 seconds → both flagged "pre-auth" and unchecked by default.

use crate::db::DbPool;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PreviewRow {
    pub external_id: String,
    /// "income" | "expense" | "transfer"
    #[serde(rename = "type")]
    pub type_: String,
    /// EUR amount, always positive. Sign is implied by `type`.
    pub amount: String,
    /// ISO 8601 ms-epoch as i64.
    pub date_ms: i64,
    pub description: String,
    pub merchant: String,
    /// Suggested category id (matched via category_rules). None = uncategorized.
    pub suggested_category_id: Option<String>,
    /// For transfers only: suggested source wallet id (if Wise tells us
    /// "Moved from <name>" and we found a matching wallet).
    pub suggested_from_wallet_id: Option<String>,
    /// Flags the UI shows: "duplicate", "pre-auth", "transfer", "fee", "cashback"
    pub flags: Vec<String>,
    /// Whether to import this row (false if duplicate or pre-auth pair).
    pub include: bool,
}

#[derive(Debug, Serialize)]
pub struct PreviewResult {
    pub rows: Vec<PreviewRow>,
    pub summary: PreviewSummary,
}

#[derive(Debug, Serialize)]
pub struct PreviewSummary {
    pub total: usize,
    pub to_import: usize,
    pub duplicates: usize,
    pub pre_auth: usize,
    pub transfers: usize,
    pub uncategorized: usize,
}

#[derive(Debug, Deserialize)]
pub struct ImportInput {
    /// Rows the user has confirmed (with possibly edited categories / source wallets).
    pub rows: Vec<ConfirmedRow>,
    /// Wallet receiving the imported transactions (the Wise wallet).
    pub target_wallet_id: String,
}

#[derive(Debug, Deserialize)]
pub struct ConfirmedRow {
    pub external_id: String,
    #[serde(rename = "type")]
    pub type_: String,
    pub amount: String,
    pub date_ms: i64,
    pub description: String,
    pub category_id: Option<String>,
    pub from_wallet_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ImportResult {
    pub inserted: usize,
    pub skipped: usize,
}

// ===========================================================================
// preview_wise_csv
// ===========================================================================

#[tauri::command]
pub fn preview_wise_csv(
    pool: State<DbPool>,
    file_path: String,
) -> Result<PreviewResult, String> {
    let csv_text = fs::read_to_string(&file_path)
        .map_err(|e| format!("could not read file: {e}"))?;
    let raw_rows = parse_csv(&csv_text)?;

    let conn = pool.get().map_err(|e| e.to_string())?;

    // Pull existing external_ids for dedup check.
    let existing_ids: HashSet<String> = {
        let mut stmt = conn
            .prepare("SELECT external_id FROM transactions WHERE external_id IS NOT NULL")
            .map_err(|e| e.to_string())?;
        let mapped = stmt
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        mapped.filter_map(|r| r.ok()).collect()
    };

    // Pull wallets for "Moved from <name>" matching.
    let wallets_by_lower_name: HashMap<String, String> = {
        let mut stmt = conn
            .prepare("SELECT id, name FROM wallets")
            .map_err(|e| e.to_string())?;
        let mapped = stmt
            .query_map([], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
            })
            .map_err(|e| e.to_string())?;
        mapped
            .filter_map(|r| r.ok())
            .map(|(id, name)| (name.to_lowercase(), id))
            .collect()
    };

    // Pre-fetch all rules for in-memory category suggestion (avoids N queries).
    let rules: Vec<(String, String)> = {
        let mut stmt = conn
            .prepare("SELECT pattern, category_id FROM category_rules ORDER BY LENGTH(pattern) DESC")
            .map_err(|e| e.to_string())?;
        let mapped = stmt
            .query_map([], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
            })
            .map_err(|e| e.to_string())?;
        mapped.filter_map(|r| r.ok()).collect()
    };
    let suggest = |desc_and_merchant: &str| -> Option<String> {
        let needle = desc_and_merchant.to_lowercase();
        for (pattern, cat_id) in &rules {
            if needle.contains(&pattern.to_lowercase()) {
                return Some(cat_id.clone());
            }
        }
        None
    };

    // ---- Step 1: classify each row ----
    let mut preview: Vec<PreviewRow> = Vec::new();
    for raw in &raw_rows {
        let external_id = raw.get("TransferWise ID").cloned().unwrap_or_default();
        if external_id.is_empty() {
            continue; // skip header-only or empty rows
        }
        let amount_str = raw.get("Amount").cloned().unwrap_or_default();
        let amount_f: f64 = amount_str.parse().unwrap_or(0.0);
        if amount_f == 0.0 {
            continue;
        }
        let merchant = raw.get("Merchant").cloned().unwrap_or_default();
        let description = raw.get("Description").cloned().unwrap_or_default();
        let date_str = raw.get("Date Time").cloned().unwrap_or_default();
        let date_ms = parse_wise_datetime(&date_str)
            .or_else(|| parse_wise_date(raw.get("Date").map(|s| s.as_str()).unwrap_or("")))
            .unwrap_or(0);
        let details_type = raw.get("Transaction Details Type").cloned().unwrap_or_default();
        let tx_type = raw.get("Transaction Type").cloned().unwrap_or_default();
        let payer_name = raw.get("Payer Name").cloned().unwrap_or_default();
        let card_holder = raw.get("Card Holder Full Name").cloned().unwrap_or_default();

        let mut flags: Vec<String> = Vec::new();
        let mut is_dup = false;
        if existing_ids.contains(&external_id) {
            is_dup = true;
            flags.push("duplicate".into());
        }

        // Classify: type + optional source wallet
        let (kind, suggested_from_wallet_id) = if details_type == "CONVERSION" {
            // "Moved 300.00 EUR from 10%" — internal Wise transfer (from another
            // Wise pocket or a separately-tracked wallet in Budgettier).
            let from = extract_moved_from(&description)
                .and_then(|name| wallets_by_lower_name.get(&name.to_lowercase()).cloned());
            flags.push("transfer".into());
            ("transfer".to_string(), from)
        } else if tx_type == "CREDIT" {
            // External CREDIT. If the payer is the user themself → likely a
            // self-transfer from another bank (e.g. N26 → Wise).
            let is_self_transfer = !payer_name.is_empty()
                && !card_holder.is_empty()
                && payer_name.to_lowercase() == card_holder.to_lowercase();
            if is_self_transfer {
                flags.push("transfer".into());
                ("transfer".to_string(), None) // user picks source in UI
            } else {
                ("income".to_string(), None)
            }
        } else {
            // DEBIT — could be expense or outgoing self-transfer.
            let payee_name = raw.get("Payee Name").cloned().unwrap_or_default();
            let is_self_transfer = !payee_name.is_empty()
                && !card_holder.is_empty()
                && payee_name.to_lowercase() == card_holder.to_lowercase();
            if is_self_transfer {
                flags.push("transfer".into());
                ("transfer".to_string(), None)
            } else {
                ("expense".to_string(), None)
            }
        };

        // Tag fees/cashback so the UI can show a hint
        if details_type == "ACCRUAL_CHARGE" {
            flags.push("fee".into());
        }
        if description.to_lowercase().contains("cashback") {
            flags.push("cashback".into());
        }

        // Suggest category from rules (skip for transfers — they don't carry a category)
        let suggested_category_id = if kind == "transfer" {
            None
        } else {
            // Try merchant first (cleaner), fall back to description.
            suggest(&merchant).or_else(|| suggest(&description))
        };

        let include = !is_dup;
        if suggested_category_id.is_none() && kind != "transfer" {
            flags.push("uncategorized".into());
        }

        preview.push(PreviewRow {
            external_id,
            type_: kind,
            amount: format!("{:.2}", amount_f.abs()),
            date_ms,
            description: description.clone(),
            merchant: merchant.clone(),
            suggested_category_id,
            suggested_from_wallet_id,
            flags,
            include,
        });
    }

    // ---- Step 2: detect pre-authorization pairs ----
    // Strategy: same merchant, same |amount|, opposite signs (one +, one −),
    // dates within 60 seconds. Mark both as pre-auth and uncheck.
    mark_pre_auth_pairs(&raw_rows, &mut preview);

    // ---- Step 3: summary ----
    let total = preview.len();
    let to_import = preview.iter().filter(|r| r.include).count();
    let duplicates = preview.iter().filter(|r| r.flags.contains(&"duplicate".into())).count();
    let pre_auth = preview.iter().filter(|r| r.flags.contains(&"pre-auth".into())).count();
    let transfers = preview.iter().filter(|r| r.type_ == "transfer").count();
    let uncategorized = preview
        .iter()
        .filter(|r| r.flags.contains(&"uncategorized".into()))
        .count();

    Ok(PreviewResult {
        rows: preview,
        summary: PreviewSummary {
            total,
            to_import,
            duplicates,
            pre_auth,
            transfers,
            uncategorized,
        },
    })
}

// ===========================================================================
// import_wise_csv
// ===========================================================================

#[tauri::command]
pub fn import_wise_csv(
    pool: State<DbPool>,
    input: ImportInput,
) -> Result<ImportResult, String> {
    let mut conn = pool.get().map_err(|e| e.to_string())?;
    let mut inserted = 0usize;
    let mut skipped = 0usize;
    let mut affected_wallets: HashSet<String> = HashSet::new();
    affected_wallets.insert(input.target_wallet_id.clone());

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for row in &input.rows {
        // Idempotency: re-check that this external_id is not already in DB
        // (could have been imported between preview and confirm).
        let exists: i64 = tx
            .query_row(
                "SELECT COUNT(*) FROM transactions WHERE external_id = ?1",
                params![row.external_id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        if exists > 0 {
            skipped += 1;
            continue;
        }

        // Validation per type
        if row.type_ == "transfer" {
            let from = row
                .from_wallet_id
                .as_ref()
                .ok_or_else(|| format!("transfer row {} missing from_wallet_id", row.external_id))?;
            if *from == input.target_wallet_id {
                return Err(format!(
                    "transfer row {} cannot have same source and target wallet",
                    row.external_id
                ));
            }
            affected_wallets.insert(from.clone());
        } else if row.category_id.is_none() {
            return Err(format!(
                "row {} ({}) needs a category before import",
                row.external_id, row.description
            ));
        }

        let id = uuid::Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO transactions
                (id, type, amount, description, date, category_id, wallet_id,
                 from_wallet_id, to_wallet_id, exclude_from_budget, external_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0, ?10)",
            params![
                id,
                row.type_,
                row.amount,
                row.description,
                row.date_ms,
                if row.type_ == "transfer" { None } else { row.category_id.clone() },
                if row.type_ == "transfer" {
                    None
                } else {
                    Some(input.target_wallet_id.clone())
                },
                if row.type_ == "transfer" {
                    row.from_wallet_id.clone()
                } else {
                    None
                },
                if row.type_ == "transfer" {
                    Some(input.target_wallet_id.clone())
                } else {
                    None
                },
                row.external_id,
            ],
        )
        .map_err(|e| format!("insert failed for {}: {e}", row.external_id))?;
        inserted += 1;
    }

    // Recompute affected wallets' balances inside the same transaction.
    for w in &affected_wallets {
        recompute_balance(&tx, w).map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(ImportResult { inserted, skipped })
}

fn recompute_balance(conn: &rusqlite::Connection, wallet_id: &str) -> rusqlite::Result<()> {
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

// ===========================================================================
// CSV parsing (minimal — Wise format only)
// ===========================================================================

/// Returns Vec<HashMap<column_name, value>>.
fn parse_csv(text: &str) -> Result<Vec<HashMap<String, String>>, String> {
    let mut lines = text.lines();
    let header_line = lines.next().ok_or("empty CSV")?;
    let headers = split_csv_line(header_line);
    let mut out = Vec::new();
    for line in lines {
        if line.trim().is_empty() {
            continue;
        }
        let values = split_csv_line(line);
        let mut row = HashMap::new();
        for (i, h) in headers.iter().enumerate() {
            row.insert(h.clone(), values.get(i).cloned().unwrap_or_default());
        }
        out.push(row);
    }
    Ok(out)
}

/// Quote-aware CSV line splitter. Handles "" escape, comma inside quotes.
fn split_csv_line(line: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut buf = String::new();
    let mut in_quotes = false;
    let mut chars = line.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '"' if in_quotes && chars.peek() == Some(&'"') => {
                buf.push('"');
                chars.next();
            }
            '"' => in_quotes = !in_quotes,
            ',' if !in_quotes => {
                out.push(buf.trim().to_string());
                buf.clear();
            }
            _ => buf.push(c),
        }
    }
    out.push(buf.trim().to_string());
    out
}

// ===========================================================================
// Date parsing — Wise specific formats
// ===========================================================================

/// "26-05-2026 08:49:08.463" → ms since epoch (treating as UTC).
fn parse_wise_datetime(s: &str) -> Option<i64> {
    if s.len() < 19 {
        return None;
    }
    let d: u32 = s.get(0..2)?.parse().ok()?;
    let m: u32 = s.get(3..5)?.parse().ok()?;
    let y: i32 = s.get(6..10)?.parse().ok()?;
    let hh: u32 = s.get(11..13)?.parse().ok()?;
    let mm: u32 = s.get(14..16)?.parse().ok()?;
    let ss: u32 = s.get(17..19)?.parse().ok()?;
    let ms: u32 = if s.len() >= 23 && s.as_bytes().get(19) == Some(&b'.') {
        s.get(20..23)?.parse().unwrap_or(0)
    } else {
        0
    };
    Some(civil_to_ms(y, m, d, hh, mm, ss, ms))
}

/// "26-05-2026" → ms since epoch (00:00:00 UTC).
fn parse_wise_date(s: &str) -> Option<i64> {
    if s.len() < 10 {
        return None;
    }
    let d: u32 = s.get(0..2)?.parse().ok()?;
    let m: u32 = s.get(3..5)?.parse().ok()?;
    let y: i32 = s.get(6..10)?.parse().ok()?;
    Some(civil_to_ms(y, m, d, 0, 0, 0, 0))
}

fn civil_to_ms(y: i32, m: u32, d: u32, hh: u32, mm: u32, ss: u32, ms: u32) -> i64 {
    // Hinnant's civil-from-ymd, treating as UTC.
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = (y - era * 400) as u32;
    let doy = (153 * if m > 2 { m - 3 } else { m + 9 } as i64 + 2) / 5
        + d as i64
        - 1;
    let doe = yoe as i64 * 365 + (yoe / 4) as i64 - (yoe / 100) as i64 + doy;
    let days = era as i64 * 146097 + doe - 719468;
    let secs = days * 86400 + hh as i64 * 3600 + mm as i64 * 60 + ss as i64;
    secs * 1000 + ms as i64
}

// ===========================================================================
// Misc helpers
// ===========================================================================

/// Extract wallet name from "Moved 300.00 EUR from 10%".
fn extract_moved_from(description: &str) -> Option<String> {
    let lower = description.to_lowercase();
    let idx = lower.find(" from ")?;
    Some(description[idx + 6..].trim().to_string())
}

/// Walk through preview rows; pair up pre-auth rows in-place by marking
/// both with "pre-auth" flag and unchecking them.
fn mark_pre_auth_pairs(_raw: &[HashMap<String, String>], preview: &mut [PreviewRow]) {
    let n = preview.len();
    let mut paired: HashSet<usize> = HashSet::new();
    for i in 0..n {
        if paired.contains(&i) {
            continue;
        }
        let a = &preview[i];
        if a.merchant.is_empty() {
            continue;
        }
        for j in (i + 1)..n {
            if paired.contains(&j) {
                continue;
            }
            let b = &preview[j];
            if a.merchant != b.merchant {
                continue;
            }
            if a.amount != b.amount {
                continue;
            }
            // Different types means opposite signs (income vs expense).
            // Both transfers → not a pre-auth pair.
            if a.type_ == b.type_ {
                continue;
            }
            if (a.date_ms - b.date_ms).abs() > 60_000 {
                continue;
            }
            paired.insert(i);
            paired.insert(j);
            break;
        }
    }
    for i in paired {
        if !preview[i].flags.contains(&"pre-auth".into()) {
            preview[i].flags.push("pre-auth".into());
        }
        preview[i].include = false;
    }
}
