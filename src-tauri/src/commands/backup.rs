// Backup / restore the local SQLite database.
//
// Backup: copies the live db file to a user-chosen path. We checkpoint WAL
// first so the .db file contains everything (no leftover wal/shm needed).
//
// Restore: copies a user-chosen file over the live db. Because rusqlite holds
// open connections in the pool, we cannot just overwrite at runtime — instead
// we copy to a `.pending` path and ask the user to relaunch. On startup
// db::init swaps it in.

use crate::db::{db_path, DbPool};
use rusqlite::params;
use std::fs;
use tauri::{AppHandle, State};

#[tauri::command]
pub fn backup_db(app: AppHandle, pool: State<DbPool>, dest_path: String) -> Result<(), String> {
    // Force WAL checkpoint so the .db file is self-contained.
    {
        let conn = pool.get().map_err(|e| e.to_string())?;
        conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
            .map_err(|e| e.to_string())?;
        // explicit drop via end-of-scope releases the connection
        let _ = &conn;
    }
    let src = db_path(&app)?;
    fs::copy(&src, &dest_path)
        .map(|_| ())
        .map_err(|e| format!("copy failed: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn restore_db(app: AppHandle, source_path: String) -> Result<(), String> {
    // Sanity check: verify the source file is a SQLite database with our tables.
    {
        let probe = rusqlite::Connection::open_with_flags(
            &source_path,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
        )
        .map_err(|e| format!("not a valid SQLite file: {e}"))?;
        let count: i64 = probe
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master
                 WHERE type='table' AND name IN ('wallets','transactions','categories','settings')",
                params![],
                |r| r.get(0),
            )
            .map_err(|e| format!("could not read tables: {e}"))?;
        if count < 4 {
            return Err(
                "This file does not look like a Budgettier backup (missing core tables).".into(),
            );
        }
    }

    // Stage at <db>.pending — db::init swaps it in on next startup.
    let mut pending = db_path(&app)?;
    let file_name = pending
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "budgettier.db".to_string());
    pending.set_file_name(format!("{file_name}.pending"));
    fs::copy(&source_path, &pending).map_err(|e| format!("staging failed: {e}"))?;
    Ok(())
}
