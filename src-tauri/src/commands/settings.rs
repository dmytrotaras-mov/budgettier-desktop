// Settings is a single-row table. GET ensures a row exists (creates default if not).
// UPDATE accepts a partial JSON object — only provided fields are written.

use crate::db::DbPool;
use rusqlite::{params, Row};
use serde::Serialize;
use serde_json::Value;
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Serialize)]
pub struct Settings {
    pub id: String,
    pub currency: String,
    #[serde(rename = "budgetPeriod")]
    pub budget_period: String,
    #[serde(rename = "dateFormat")]
    pub date_format: String,
    #[serde(rename = "budgetLimitWarnings")]
    pub budget_limit_warnings: bool,
    #[serde(rename = "monthlyReports")]
    pub monthly_reports: bool,
    #[serde(rename = "weeklySummaries")]
    pub weekly_summaries: bool,
    #[serde(rename = "defaultWalletId")]
    pub default_wallet_id: Option<String>,
}

fn row_to_settings(row: &Row) -> rusqlite::Result<Settings> {
    Ok(Settings {
        id: row.get(0)?,
        currency: row.get(1)?,
        budget_period: row.get(2)?,
        date_format: row.get(3)?,
        budget_limit_warnings: row.get::<_, i64>(4)? != 0,
        monthly_reports: row.get::<_, i64>(5)? != 0,
        weekly_summaries: row.get::<_, i64>(6)? != 0,
        default_wallet_id: row.get(7)?,
    })
}

fn ensure_singleton(conn: &rusqlite::Connection) -> rusqlite::Result<String> {
    let existing: Option<String> = conn
        .query_row("SELECT id FROM settings LIMIT 1", [], |r| r.get(0))
        .ok();
    if let Some(id) = existing {
        return Ok(id);
    }
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO settings (id) VALUES (?1)",
        params![id],
    )?;
    Ok(id)
}

#[tauri::command]
pub fn get_settings(pool: State<DbPool>) -> Result<Settings, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    ensure_singleton(&conn).map_err(|e| e.to_string())?;
    let s = conn
        .query_row(
            "SELECT id, currency, budget_period, date_format, budget_limit_warnings,
                    monthly_reports, weekly_summaries, default_wallet_id
             FROM settings LIMIT 1",
            [],
            row_to_settings,
        )
        .map_err(|e| e.to_string())?;
    Ok(s)
}

#[tauri::command]
pub fn update_settings(pool: State<DbPool>, input: Value) -> Result<Settings, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let id = ensure_singleton(&conn).map_err(|e| e.to_string())?;

    // Patch one field at a time. JS sends camelCase → translate to snake_case.
    let map = input.as_object().ok_or("settings input must be an object")?;
    let mut sets: Vec<String> = Vec::new();
    let mut bind: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    fn push_text(
        sets: &mut Vec<String>,
        bind: &mut Vec<Box<dyn rusqlite::ToSql>>,
        col: &str,
        v: &Value,
    ) {
        if let Some(s) = v.as_str() {
            sets.push(format!("{col} = ?{}", bind.len() + 1));
            bind.push(Box::new(s.to_string()));
        }
    }
    fn push_bool(
        sets: &mut Vec<String>,
        bind: &mut Vec<Box<dyn rusqlite::ToSql>>,
        col: &str,
        v: &Value,
    ) {
        if let Some(b) = v.as_bool() {
            sets.push(format!("{col} = ?{}", bind.len() + 1));
            bind.push(Box::new(if b { 1_i64 } else { 0_i64 }));
        }
    }

    for (k, v) in map {
        match k.as_str() {
            "currency" => push_text(&mut sets, &mut bind, "currency", v),
            "budgetPeriod" => push_text(&mut sets, &mut bind, "budget_period", v),
            "dateFormat" => push_text(&mut sets, &mut bind, "date_format", v),
            "budgetLimitWarnings" => push_bool(&mut sets, &mut bind, "budget_limit_warnings", v),
            "monthlyReports" => push_bool(&mut sets, &mut bind, "monthly_reports", v),
            "weeklySummaries" => push_bool(&mut sets, &mut bind, "weekly_summaries", v),
            "defaultWalletId" => {
                if v.is_null() {
                    sets.push(format!("default_wallet_id = ?{}", bind.len() + 1));
                    bind.push(Box::new(Option::<String>::None));
                } else if let Some(s) = v.as_str() {
                    sets.push(format!("default_wallet_id = ?{}", bind.len() + 1));
                    bind.push(Box::new(s.to_string()));
                }
            }
            _ => {} // ignore unknown keys silently
        }
    }

    if !sets.is_empty() {
        let sql = format!(
            "UPDATE settings SET {} WHERE id = ?{}",
            sets.join(", "),
            bind.len() + 1
        );
        bind.push(Box::new(id));
        let bind_refs: Vec<&dyn rusqlite::ToSql> = bind.iter().map(|b| b.as_ref()).collect();
        conn.execute(&sql, bind_refs.as_slice())
            .map_err(|e| e.to_string())?;
    }

    get_settings(pool)
}
