// Wallet CRUD. Mirrors the JSON shape the UI was getting from `/api/wallets`
// in the old Express backend. Keeping the same field names (id/name/type/balance)
// means the React Query hooks don't need to change. `color` and `emoji` are the
// user's look for the wallet; NULL falls back to the wallet type's default.
//
// Delete policy: blocks if the wallet is referenced by any transaction. The UI
// surfaces the error in a toast.

use crate::db::DbPool;
use rusqlite::{params, Connection, Row};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Serialize)]
pub struct Wallet {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub type_: String,
    pub balance: String,
    pub color: Option<String>,
    pub emoji: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct WalletInput {
    pub name: String,
    #[serde(rename = "type")]
    pub type_: String,
    pub balance: Option<String>,
    /// Absent = keep, "" = back to the type's default, otherwise "#rrggbb".
    pub color: Option<String>,
    /// Absent = keep, "" = back to the type's icon, otherwise an emoji.
    pub emoji: Option<String>,
}

const WALLET_COLS: &str = "id, name, type, balance, color, emoji";

fn row_to_wallet(row: &Row) -> rusqlite::Result<Wallet> {
    Ok(Wallet {
        id: row.get(0)?,
        name: row.get(1)?,
        type_: row.get(2)?,
        balance: row.get(3)?,
        color: row.get(4)?,
        emoji: row.get(5)?,
    })
}

fn valid_color(c: &Option<String>) -> Result<(), String> {
    match c.as_deref() {
        None | Some("") => Ok(()),
        Some(c) if c.len() == 7 && c.starts_with('#') && c[1..].chars().all(|ch| ch.is_ascii_hexdigit()) => Ok(()),
        Some(c) => Err(format!("invalid color: {c}")),
    }
}

fn find_wallet(conn: &Connection, id: &str) -> Result<Wallet, String> {
    conn.query_row(&format!("SELECT {WALLET_COLS} FROM wallets WHERE id = ?1"), params![id], row_to_wallet)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_wallets(pool: State<DbPool>) -> Result<Vec<Wallet>, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(&format!("SELECT {WALLET_COLS} FROM wallets ORDER BY name"))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], row_to_wallet)
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_wallet(pool: State<DbPool>, input: WalletInput) -> Result<Wallet, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    valid_color(&input.color)?;
    let id = Uuid::new_v4().to_string();
    let balance = input.balance.unwrap_or_else(|| "0".to_string());
    let color = input.color.filter(|c| !c.is_empty());
    let emoji = input.emoji.filter(|e| !e.trim().is_empty());
    conn.execute(
        "INSERT INTO wallets (id, name, type, balance, color, emoji) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, input.name, input.type_, balance, color, emoji],
    )
    .map_err(|e| e.to_string())?;
    find_wallet(&conn, &id)
}

#[tauri::command]
pub fn update_wallet(
    pool: State<DbPool>,
    id: String,
    input: WalletInput,
) -> Result<Wallet, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    valid_color(&input.color)?;
    // Balance is derived from transactions; only touch it when explicitly sent.
    // Color and emoji: absent keeps the current value, "" resets to the default.
    let updated = conn
        .execute(
            "UPDATE wallets SET name = ?1, type = ?2, balance = COALESCE(?3, balance),
                 color = CASE WHEN ?4 IS NULL THEN color ELSE NULLIF(?4, '') END,
                 emoji = CASE WHEN ?5 IS NULL THEN emoji ELSE NULLIF(trim(?5), '') END
             WHERE id = ?6",
            params![input.name, input.type_, input.balance, input.color, input.emoji, id],
        )
        .map_err(|e| e.to_string())?;
    if updated == 0 {
        return Err(format!("wallet {id} not found"));
    }
    find_wallet(&conn, &id)
}

#[tauri::command]
pub fn delete_wallet(pool: State<DbPool>, id: String) -> Result<(), String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    // Block delete if any transaction references this wallet.
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM transactions
             WHERE is_opening = 0 AND
                   (wallet_id = ?1 OR from_wallet_id = ?1 OR to_wallet_id = ?1)",
            params![id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if count > 0 {
        return Err(format!(
            "Wallet has {count} transaction(s). Move or delete them first."
        ));
    }
    // The opening balance belongs to the wallet — it goes with it.
    conn.execute(
        "DELETE FROM transactions WHERE wallet_id = ?1 AND is_opening = 1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    let removed = conn
        .execute("DELETE FROM wallets WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    if removed == 0 {
        return Err(format!("wallet {id} not found"));
    }
    Ok(())
}
