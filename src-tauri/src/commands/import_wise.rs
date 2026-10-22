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
//   * `Transaction Details Type = CONVERSION` ("Moved X EUR from <Y>" /
//     "Moved X EUR to <Y>") → transfer between this wallet and <Y>, matched
//     by name. The SIGN of the amount gives the direction: negative = money
//     left this wallet.
//   * `Transaction Type = CREDIT` AND amount > 0 → income (or transfer
//     if Payer Name == Card Holder Full Name).
//   * Otherwise (`DEBIT`) → expense.
//
// Dedup: by TransferWise ID column → external_id in DB. A move between two
// Wise balances appears in BOTH balances' statements under different IDs, so
// a transfer that already exists between the same two wallets (same amount,
// same direction, within two minutes) is flagged as a duplicate too.
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
    /// The rule pattern that produced suggested_category_id, shown in the
    /// preview so a wrong auto-match is easy to spot.
    pub matched_pattern: Option<String>,
    /// For transfers only: the other wallet (Wise says "Moved … from <name>"
    /// or "Moved … to <name>"), if a wallet with that name exists.
    pub suggested_other_wallet_id: Option<String>,
    /// For transfers only: the other balance's name as Wise wrote it, so the
    /// UI can remember which wallet the user picked for it.
    pub other_name: Option<String>,
    /// Money left the imported wallet (negative amount in the statement).
    pub outgoing: bool,
    /// Flags the UI shows: "duplicate", "pre-auth", "transfer", "fee", "cashback"
    pub flags: Vec<String>,
    /// Whether to import this row (false if duplicate or pre-auth pair).
    pub include: bool,
}

#[derive(Debug, Serialize)]
pub struct PreviewResult {
    pub rows: Vec<PreviewRow>,
    pub summary: PreviewSummary,
    /// The balance after the statement's latest operation ("Running
    /// Balance"), used to check the wallet against the bank after import.
    pub statement_balance: Option<StatementBalance>,
}

#[derive(Debug, Serialize)]
pub struct StatementBalance {
    pub balance: String,
    pub date_ms: i64,
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
    /// Transfers: the other wallet. `outgoing` decides which side it's on.
    pub other_wallet_id: Option<String>,
    #[serde(default)]
    pub outgoing: bool,
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
            .map(|(id, name)| (normalize_name(&name), id))
            .collect()
    };

    // Rules, loaded once (longest pattern first, word-start matching).
    let matcher = crate::commands::category_rules::RuleMatcher::load(&conn)
        .map_err(|e| e.to_string())?;

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
        let outgoing = amount_f < 0.0;
        let mut other_name: Option<String> = None;
        let (kind, suggested_other_wallet_id) = if details_type == "CONVERSION" {
            // "Moved 300.00 EUR from 10%" / "Moved 400.00 EUR to 10%" — a move
            // between Wise balances (each tracked as its own wallet here).
            other_name = extract_moved_counterpart(&description);
            let other = other_name
                .as_ref()
                .and_then(|name| wallets_by_lower_name.get(&normalize_name(name)).cloned());
            flags.push("transfer".into());
            ("transfer".to_string(), other)
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

        // Suggest category from rules (skip for transfers — they don't carry a
        // category). Match the merchant; only rows without a merchant (fees,
        // deposits) fall back to the description, so boilerplate like
        // "Card transaction of 12.00 EUR issued by" can't trigger a rule.
        let (suggested_category_id, matched_pattern) = if kind == "transfer" {
            (None, None)
        } else {
            let text = if merchant.trim().is_empty() { &description } else { &merchant };
            match matcher.find(text) {
                Some((pattern, category_id)) => (Some(category_id.to_string()), Some(pattern.to_string())),
                None => (None, None),
            }
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
            matched_pattern,
            suggested_other_wallet_id,
            other_name,
            outgoing,
            flags,
            include,
        });
    }

    // ---- Step 1b: moves already recorded from the other balance's statement ----
    for row in preview.iter_mut() {
        let (true, Some(other), true) = (row.type_ == "transfer", row.suggested_other_wallet_id.as_ref(), row.include) else {
            continue;
        };
        // Outgoing here = incoming there: look for a transfer INTO `other`
        // (or, for an incoming move, OUT OF `other`) at the same moment.
        let n: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM transactions
                 WHERE type = 'transfer' AND CAST(amount AS REAL) = CAST(?1 AS REAL)
                   AND abs(date - ?2) <= 120000
                   AND ((?3 = 1 AND to_wallet_id = ?4) OR (?3 = 0 AND from_wallet_id = ?4))",
                params![row.amount, row.date_ms, row.outgoing as i64, other],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        if n > 0 {
            row.include = false;
            row.flags.push("duplicate".into());
        }
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

    let statement_balance = raw_rows
        .iter()
        .filter_map(|r| {
            let balance: f64 = r.get("Running Balance")?.trim().parse().ok()?;
            let date_ms = parse_wise_datetime(r.get("Date Time")?)?;
            Some((date_ms, balance))
        })
        .max_by_key(|(date_ms, _)| *date_ms)
        .map(|(date_ms, balance)| StatementBalance { balance: format!("{balance:.2}"), date_ms });

    Ok(PreviewResult {
        statement_balance,
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
            let other = row
                .other_wallet_id
                .as_ref()
                .ok_or_else(|| format!("transfer row {} needs the other wallet", row.external_id))?;
            if *other == input.target_wallet_id {
                return Err(format!(
                    "transfer row {} cannot go to and from the same wallet",
                    row.external_id
                ));
            }
            affected_wallets.insert(other.clone());
        } else if row.category_id.is_none() {
            return Err(format!(
                "row {} ({}) needs a category before import",
                row.external_id, row.description
            ));
        }

        // Transfers: negative amount in the statement = money left the
        // imported wallet.
        let (from_wallet, to_wallet) = match (&row.other_wallet_id, row.outgoing) {
            (Some(other), true) => (Some(input.target_wallet_id.clone()), Some(other.clone())),
            (Some(other), false) => (Some(other.clone()), Some(input.target_wallet_id.clone())),
            (None, _) => (None, None),
        };
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
                if row.type_ == "transfer" { from_wallet } else { None },
                if row.type_ == "transfer" { to_wallet } else { None },
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
/// Lowercase, with any run of whitespace (Wise writes "EUR\u{a0}Stocks" with a
/// no-break space) collapsed to one plain space.
fn normalize_name(name: &str) -> String {
    name.split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase()
}

/// The other balance in "Moved 300.00 EUR from 10%" / "Moved 400.00 EUR to Save".
fn extract_moved_counterpart(description: &str) -> Option<String> {
    let lower = description.to_lowercase();
    let (idx, len) = match (lower.find(" from "), lower.find(" to ")) {
        (Some(i), _) => (i, 6),
        (None, Some(i)) => (i, 4),
        (None, None) => return None,
    };
    let name = description[idx + len..].trim();
    (!name.is_empty()).then(|| name.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counterpart_from_both_directions() {
        assert_eq!(extract_moved_counterpart("Moved 300.00 EUR from 10%").as_deref(), Some("10%"));
        assert_eq!(extract_moved_counterpart("Moved 400.00 EUR to 10%").as_deref(), Some("10%"));
        assert_eq!(extract_moved_counterpart("Moved 2,601.83 EUR to Save").as_deref(), Some("Save"));
        assert_eq!(extract_moved_counterpart("Card transaction"), None);
        assert_eq!(normalize_name("EUR\u{a0}Stocks"), normalize_name("eur stocks"));
    }
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
