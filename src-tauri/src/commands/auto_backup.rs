// Automatic backups to iCloud Drive / Budgettier.
//
// A background thread checks every few hours and writes a fresh copy of the
// database once a week (and right away if there has never been one). Copies
// are made with `VACUUM INTO`, which produces a consistent, compact file even
// while the app is using the database. Each copy is written to a hidden temp
// name first and renamed, so iCloud never syncs a half-written file. Only the
// newest KEEP copies are kept.

use crate::commands::settings::ensure_singleton;
use crate::db::DbPool;
use rusqlite::{params, Connection};
use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::State;

const KEEP: usize = 8;
const WEEK_MS: i64 = 7 * 86_400_000;
const CHECK_EVERY: Duration = Duration::from_secs(6 * 60 * 60);
const PREFIX: &str = "budgettier-";

#[derive(Debug, Serialize)]
pub struct BackupStatus {
    pub enabled: bool,
    #[serde(rename = "lastBackupAt")]
    pub last_backup_at: Option<i64>,
    pub folder: Option<String>,
    #[serde(rename = "icloudAvailable")]
    pub icloud_available: bool,
    #[serde(rename = "backupCount")]
    pub backup_count: usize,
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// `~/Library/Mobile Documents/com~apple~CloudDocs/Budgettier`, or None when
/// iCloud Drive isn't set up on this Mac.
fn backup_dir() -> Option<PathBuf> {
    let home = std::env::var_os("HOME")?;
    let icloud = PathBuf::from(home).join("Library/Mobile Documents/com~apple~CloudDocs");
    icloud.is_dir().then(|| icloud.join("Budgettier"))
}

/// "YYYY-MM-DD" (UTC) from epoch ms.
fn ymd(ms: i64) -> String {
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

/// Backup files in the folder, oldest first (names sort by date).
fn list_backups(dir: &PathBuf) -> Vec<PathBuf> {
    let mut files: Vec<PathBuf> = fs::read_dir(dir)
        .map(|entries| {
            entries
                .filter_map(|e| e.ok().map(|e| e.path()))
                .filter(|p| {
                    p.file_name()
                        .and_then(|n| n.to_str())
                        .map(|n| n.starts_with(PREFIX) && n.ends_with(".db"))
                        .unwrap_or(false)
                })
                .collect()
        })
        .unwrap_or_default();
    files.sort();
    files
}

fn read_state(conn: &Connection) -> rusqlite::Result<(bool, Option<i64>)> {
    ensure_singleton(conn)?;
    conn.query_row(
        "SELECT auto_backup, last_auto_backup FROM settings LIMIT 1",
        [],
        |r| Ok((r.get::<_, i64>(0)? != 0, r.get(1)?)),
    )
}

fn status(conn: &Connection) -> Result<BackupStatus, String> {
    let (enabled, last) = read_state(conn).map_err(|e| e.to_string())?;
    let dir = backup_dir();
    Ok(BackupStatus {
        enabled,
        last_backup_at: last,
        folder: dir.as_ref().map(|d| d.to_string_lossy().to_string()),
        icloud_available: dir.is_some(),
        backup_count: dir.as_ref().map(|d| list_backups(d).len()).unwrap_or(0),
    })
}

/// Write today's backup (replacing an earlier one from the same day) and
/// prune old copies.
fn run_backup(pool: &DbPool) -> Result<PathBuf, String> {
    let dir = backup_dir().ok_or("iCloud Drive isn't available on this Mac.")?;
    fs::create_dir_all(&dir).map_err(|e| format!("couldn't create {}: {e}", dir.display()))?;

    let now = now_ms();
    let name = format!("{PREFIX}{}.db", ymd(now));
    let tmp = dir.join(format!(".{name}.tmp"));
    let dest = dir.join(&name);
    let _ = fs::remove_file(&tmp);

    let conn = pool.get().map_err(|e| e.to_string())?;
    conn.execute("VACUUM INTO ?1", params![tmp.to_string_lossy()])
        .map_err(|e| format!("backup failed: {e}"))?;
    fs::rename(&tmp, &dest).map_err(|e| format!("couldn't save backup: {e}"))?;

    ensure_singleton(&conn).map_err(|e| e.to_string())?;
    conn.execute("UPDATE settings SET last_auto_backup = ?1", params![now])
        .map_err(|e| e.to_string())?;

    let files = list_backups(&dir);
    if files.len() > KEEP {
        for old in &files[..files.len() - KEEP] {
            let _ = fs::remove_file(old);
        }
    }
    Ok(dest)
}

fn backup_if_due(pool: &DbPool) {
    let due = match pool.get().map_err(|e| e.to_string()).and_then(|c| {
        read_state(&c).map_err(|e| e.to_string())
    }) {
        Ok((enabled, last)) => enabled && last.map_or(true, |t| now_ms() - t >= WEEK_MS),
        Err(e) => {
            eprintln!("[backup] couldn't read settings: {e}");
            false
        }
    };
    if !due {
        return;
    }
    match run_backup(pool) {
        Ok(path) => eprintln!("[backup] wrote {}", path.display()),
        Err(e) => eprintln!("[backup] {e}"),
    }
}

/// Start the background checker. Called once from app setup.
pub fn start_scheduler(pool: DbPool) {
    std::thread::spawn(move || loop {
        backup_if_due(&pool);
        std::thread::sleep(CHECK_EVERY);
    });
}

#[tauri::command]
pub fn get_backup_status(pool: State<DbPool>) -> Result<BackupStatus, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    status(&conn)
}

#[tauri::command]
pub fn set_auto_backup(pool: State<DbPool>, enabled: bool) -> Result<BackupStatus, String> {
    {
        let conn = pool.get().map_err(|e| e.to_string())?;
        ensure_singleton(&conn).map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE settings SET auto_backup = ?1",
            params![if enabled { 1_i64 } else { 0_i64 }],
        )
        .map_err(|e| e.to_string())?;
    }
    // Turning it on with no recent backup → make one now.
    if enabled {
        backup_if_due(&pool);
    }
    let conn = pool.get().map_err(|e| e.to_string())?;
    status(&conn)
}

#[tauri::command]
pub fn backup_now(pool: State<DbPool>) -> Result<BackupStatus, String> {
    run_backup(&pool)?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    status(&conn)
}

/// Open the backup folder in Finder.
#[tauri::command]
pub fn reveal_backup_folder() -> Result<(), String> {
    let dir = backup_dir().ok_or("iCloud Drive isn't available on this Mac.")?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::process::Command::new("open")
        .arg(&dir)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ymd_formats_utc_dates() {
        assert_eq!(ymd(0), "1970-01-01");
        assert_eq!(ymd(1_792_454_400_000), "2026-10-20");
    }

    #[test]
    fn vacuum_into_accepts_bound_path() {
        let dir = std::env::temp_dir().join(format!("budgettier-test-{}", now_ms()));
        fs::create_dir_all(&dir).unwrap();
        let dest = dir.join("copy.db");
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE t (x); INSERT INTO t VALUES (42);").unwrap();
        conn.execute("VACUUM INTO ?1", params![dest.to_string_lossy()]).unwrap();
        let copy = Connection::open(&dest).unwrap();
        let x: i64 = copy.query_row("SELECT x FROM t", [], |r| r.get(0)).unwrap();
        assert_eq!(x, 42);
        let _ = fs::remove_dir_all(&dir);
    }
}
