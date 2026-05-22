// Wallet CRUD. Mirrors the JSON shape the UI was getting from `/api/wallets`
// in the old Express backend. Keeping the same field names (id/name/type/balance)
// means the React Query hooks don't need to change.
//
// Delete policy: blocks if the wallet is referenced by any transaction. The UI
// surfaces the error in a toast.

use crate::db::DbPool;
use rusqlite::{params, Row};
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
}

#[derive(Debug, Deserialize)]
pub struct WalletInput {
    pub name: String,
    #[serde(rename = "type")]
    pub type_: String,
    pub balance: Option<String>,
}

fn row_to_wallet(row: &Row) -> rusqlite::Result<Wallet> {
    Ok(Wallet {
        id: row.get(0)?,
        name: row.get(1)?,
        type_: row.get(2)?,
        balance: row.get(3)?,
    })
}

#[tauri::command]
pub fn get_wallets(pool: State<DbPool>) -> Result<Vec<Wallet>, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name, type, balance FROM wallets ORDER BY name")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], row_to_wallet)
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_wallet(pool: State<DbPool>, input: WalletInput) -> Result<Wallet, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();
    let balance = input.balance.unwrap_or_else(|| "0".to_string());
    conn.execute(
        "INSERT INTO wallets (id, name, type, balance) VALUES (?1, ?2, ?3, ?4)",
        params![id, input.name, input.type_, balance],
    )
    .map_err(|e| e.to_string())?;
    Ok(Wallet {
        id,
        name: input.name,
        type_: input.type_,
        balance,
    })
}

#[tauri::command]
pub fn update_wallet(
    pool: State<DbPool>,
    id: String,
    input: WalletInput,
) -> Result<Wallet, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let balance = input.balance.unwrap_or_else(|| "0".to_string());
    let updated = conn
        .execute(
            "UPDATE wallets SET name = ?1, type = ?2, balance = ?3 WHERE id = ?4",
            params![input.name, input.type_, balance, id],
        )
        .map_err(|e| e.to_string())?;
    if updated == 0 {
        return Err(format!("wallet {id} not found"));
    }
    Ok(Wallet {
        id,
        name: input.name,
        type_: input.type_,
        balance,
    })
}

#[tauri::command]
pub fn delete_wallet(pool: State<DbPool>, id: String) -> Result<(), String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    // Block delete if any transaction references this wallet.
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM transactions
             WHERE wallet_id = ?1 OR from_wallet_id = ?1 OR to_wallet_id = ?1",
            params![id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if count > 0 {
        return Err(format!(
            "Wallet has {count} transaction(s). Move or delete them first."
        ));
    }
    let removed = conn
        .execute("DELETE FROM wallets WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    if removed == 0 {
        return Err(format!("wallet {id} not found"));
    }
    Ok(())
}
