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

/// Escape a value for CSV: wrap in quotes if it contains comma, quote or newline.
fn csv_escape(s: &str) -> String {
    if s.contains([',', '"', '\n', '\r']) {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}

/// Export all transactions to a CSV file, with category and wallet names
/// resolved (not raw IDs). Columns: Date, Type, Amount, Description,
/// Category, Wallet, From Wallet, To Wallet, Excluded From Budget.
#[tauri::command]
pub fn export_csv(pool: State<DbPool>, dest_path: String) -> Result<usize, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT t.date, t.type, t.amount, COALESCE(t.description, ''),
                    COALESCE(c.name, ''), COALESCE(w.name, ''),
                    COALESCE(fw.name, ''), COALESCE(tw.name, ''),
                    t.exclude_from_budget
             FROM transactions t
             LEFT JOIN categories c  ON c.id  = t.category_id
             LEFT JOIN wallets    w  ON w.id  = t.wallet_id
             LEFT JOIN wallets    fw ON fw.id = t.from_wallet_id
             LEFT JOIN wallets    tw ON tw.id = t.to_wallet_id
             ORDER BY t.date DESC",
        )
        .map_err(|e| e.to_string())?;

    let mut out = String::from(
        "Date,Type,Amount,Description,Category,Wallet,From Wallet,To Wallet,Excluded From Budget\n",
    );
    let mut count = 0usize;
    let rows = stmt
        .query_map([], |r| {
            let date_ms: i64 = r.get(0)?;
            Ok((
                date_ms,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, String>(4)?,
                r.get::<_, String>(5)?,
                r.get::<_, String>(6)?,
                r.get::<_, String>(7)?,
                r.get::<_, i64>(8)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    for row in rows {
        let (date_ms, ty, amount, desc, cat, wal, fw, tw, excl) =
            row.map_err(|e| e.to_string())?;
        // YYYY-MM-DD from epoch ms (UTC).
        let days = date_ms.div_euclid(86_400_000);
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
        let date = format!("{:04}-{:02}-{:02}", y, m, d);

        out.push_str(&format!(
            "{},{},{},{},{},{},{},{},{}\n",
            csv_escape(&date),
            csv_escape(&ty),
            csv_escape(&amount),
            csv_escape(&desc),
            csv_escape(&cat),
            csv_escape(&wal),
            csv_escape(&fw),
            csv_escape(&tw),
            if excl != 0 { "yes" } else { "no" },
        ));
        count += 1;
    }

    fs::write(&dest_path, out).map_err(|e| format!("write failed: {e}"))?;
    Ok(count)
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
