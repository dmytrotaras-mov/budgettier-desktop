// Category sections (groups like "Food & Drinks", "Katya").
//
// Sections are rows in the `sections` table (see migration v5). Categories
// reference a section by NAME in `categories.section`, so renaming a section
// cascades the new name onto its categories in the same SQL transaction.
//
// Built-in sections (is_default = 1) can be renamed but not deleted; "deleting"
// one resets it to its default name. Hidden sections (the internal "System"
// group for Opening Balance) are never editable from the UI.
//
// import_legacy_sections performs the one-time move of section data that used
// to live in the webview's localStorage (renames, emojis, custom sections,
// manual category assignments).

use crate::db::DbPool;
use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Serialize)]
pub struct Section {
    pub id: String,
    #[serde(rename = "type")]
    pub type_: String,
    pub name: String,
    pub emoji: Option<String>,
    #[serde(rename = "sortOrder")]
    pub sort_order: i64,
    #[serde(rename = "isDefault")]
    pub is_default: bool,
    pub hidden: bool,
}

const SECTION_COLS: &str = "id, type, name, emoji, sort_order, is_default, hidden";

fn row_to_section(row: &Row) -> rusqlite::Result<Section> {
    Ok(Section {
        id: row.get(0)?,
        type_: row.get(1)?,
        name: row.get(2)?,
        emoji: row.get(3)?,
        sort_order: row.get(4)?,
        is_default: row.get::<_, i64>(5)? != 0,
        hidden: row.get::<_, i64>(6)? != 0,
    })
}

fn find_section(conn: &Connection, id: &str) -> rusqlite::Result<Option<Section>> {
    conn.query_row(
        &format!("SELECT {SECTION_COLS} FROM sections WHERE id = ?1"),
        params![id],
        row_to_section,
    )
    .optional()
}

fn name_taken(conn: &Connection, type_: &str, name: &str, except_id: &str) -> rusqlite::Result<bool> {
    let n: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sections WHERE type = ?1 AND name = ?2 AND id != ?3",
        params![type_, name, except_id],
        |r| r.get(0),
    )?;
    Ok(n > 0)
}

/// Rename a section and move its categories to the new name.
fn rename_section(conn: &Connection, section: &Section, new_name: &str) -> Result<(), String> {
    if new_name == section.name {
        return Ok(());
    }
    if name_taken(conn, &section.type_, new_name, &section.id).map_err(|e| e.to_string())? {
        return Err(format!("A section named \"{new_name}\" already exists"));
    }
    conn.execute(
        "UPDATE sections SET name = ?1 WHERE id = ?2",
        params![new_name, section.id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE categories SET section = ?1 WHERE type = ?2 AND section = ?3",
        params![new_name, section.type_, section.name],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_sections(pool: State<DbPool>) -> Result<Vec<Section>, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {SECTION_COLS} FROM sections ORDER BY type, sort_order, name"
        ))
        .map_err(|e| e.to_string())?;
    let mapped = stmt.query_map([], row_to_section).map_err(|e| e.to_string())?;
    let collected: Result<Vec<_>, _> = mapped.collect();
    collected.map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
pub struct CreateSectionInput {
    #[serde(rename = "type")]
    pub type_: String,
    pub name: String,
    pub emoji: Option<String>,
}

#[tauri::command]
pub fn create_section(pool: State<DbPool>, input: CreateSectionInput) -> Result<Section, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let name = input.name.trim();
    if name.is_empty() {
        return Err("Section name can't be empty".into());
    }
    if name_taken(&conn, &input.type_, name, "").map_err(|e| e.to_string())? {
        return Err(format!("A section named \"{name}\" already exists"));
    }
    // New custom sections go after existing visible ones (hidden ones sit at 999).
    let next_order: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort_order), 0) + 1 FROM sections WHERE type = ?1 AND hidden = 0",
            params![input.type_],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let id = format!("custom_{}", Uuid::new_v4().simple());
    let emoji = input.emoji.filter(|e| !e.trim().is_empty());
    conn.execute(
        "INSERT INTO sections (id, type, name, emoji, sort_order, is_default, hidden)
         VALUES (?1, ?2, ?3, ?4, ?5, 0, 0)",
        params![id, input.type_, name, emoji, next_order],
    )
    .map_err(|e| e.to_string())?;
    find_section(&conn, &id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "section vanished after insert".to_string())
}

#[derive(Debug, Deserialize)]
pub struct UpdateSectionInput {
    pub name: Option<String>,
    pub emoji: Option<String>,
}

#[tauri::command]
pub fn update_section(
    pool: State<DbPool>,
    id: String,
    input: UpdateSectionInput,
) -> Result<Section, String> {
    let mut conn = pool.get().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let section = find_section(&tx, &id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("section {id} not found"))?;
    if section.hidden {
        return Err("This section can't be edited".into());
    }
    if let Some(name) = input.name.as_deref().map(str::trim) {
        if name.is_empty() {
            return Err("Section name can't be empty".into());
        }
        rename_section(&tx, &section, name)?;
    }
    if let Some(emoji) = input.emoji {
        let emoji = Some(emoji).filter(|e| !e.trim().is_empty());
        tx.execute("UPDATE sections SET emoji = ?1 WHERE id = ?2", params![emoji, id])
            .map_err(|e| e.to_string())?;
    }
    let updated = find_section(&tx, &id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "section vanished after update".to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(updated)
}

#[derive(Debug, Serialize)]
pub struct DeleteSectionResult {
    /// Built-in section: name was reset to its default instead of deleting.
    pub reset: bool,
    /// Custom section: number of categories moved to "Custom Categories".
    #[serde(rename = "movedCategories")]
    pub moved_categories: usize,
}

#[tauri::command]
pub fn delete_section(pool: State<DbPool>, id: String) -> Result<DeleteSectionResult, String> {
    let mut conn = pool.get().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let section = find_section(&tx, &id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("section {id} not found"))?;
    if section.hidden {
        return Err("This section can't be deleted".into());
    }

    let result = if section.is_default {
        let default_name: Option<String> = tx
            .query_row(
                "SELECT default_name FROM sections WHERE id = ?1",
                params![id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        let default_name = default_name.unwrap_or_else(|| section.name.clone());
        if default_name == section.name {
            return Err("Built-in sections can't be deleted".into());
        }
        rename_section(&tx, &section, &default_name)?;
        DeleteSectionResult { reset: true, moved_categories: 0 }
    } else {
        let moved = tx
            .execute(
                "UPDATE categories SET section = NULL WHERE type = ?1 AND section = ?2",
                params![section.type_, section.name],
            )
            .map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM sections WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        DeleteSectionResult { reset: false, moved_categories: moved }
    };
    tx.commit().map_err(|e| e.to_string())?;
    Ok(result)
}

/// Most recently used categories of a type, newest first — derived from
/// transaction history instead of being stored separately.
#[tauri::command]
pub fn get_recent_categories(
    pool: State<DbPool>,
    type_filter: String,
    limit: Option<i64>,
) -> Result<Vec<String>, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT category_id FROM transactions
             WHERE type = ?1 AND category_id IS NOT NULL AND is_opening = 0
             GROUP BY category_id
             ORDER BY MAX(date) DESC
             LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;
    let mapped = stmt
        .query_map(params![type_filter, limit.unwrap_or(5)], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    let collected: Result<Vec<_>, _> = mapped.collect();
    collected.map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// One-time import of section data that used to live in localStorage.
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize, Default)]
pub struct LegacyCustomSection {
    pub name: String,
    pub emoji: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
pub struct LegacySectionsForType {
    /// localStorage `customSections_{type}`: legacy id → section
    #[serde(rename = "customSections", default)]
    pub custom_sections: HashMap<String, LegacyCustomSection>,
    /// `categoryAssignments_{type}`: category name → legacy section id
    #[serde(default)]
    pub assignments: HashMap<String, String>,
    /// `sectionOverrides_{type}`: built-in section id → renamed name
    #[serde(default)]
    pub overrides: HashMap<String, String>,
    /// `sectionEmojiOverrides_{type}`: built-in section id → emoji
    #[serde(rename = "emojiOverrides", default)]
    pub emoji_overrides: HashMap<String, String>,
}

#[derive(Debug, Deserialize, Default)]
pub struct LegacySectionsPayload {
    #[serde(default)]
    pub expense: LegacySectionsForType,
    #[serde(default)]
    pub income: LegacySectionsForType,
}

#[derive(Debug, Serialize, Default)]
pub struct LegacyImportSummary {
    pub renamed: usize,
    #[serde(rename = "emojisSet")]
    pub emojis_set: usize,
    #[serde(rename = "sectionsCreated")]
    pub sections_created: usize,
    #[serde(rename = "categoriesAssigned")]
    pub categories_assigned: usize,
    pub skipped: Vec<String>,
}

/// Built-in section a category name was placed in by migration v5 (if any).
/// Used to tell a migration-backfilled section apart from one the user chose.
fn builtin_section_id_for(type_: &str, category_name: &str) -> Option<&'static str> {
    let groups: &[(&str, &[&str])] = if type_ == "income" {
        &[
            ("income_primary", &["Salary", "Freelance", "Business"]),
            ("income_other", &["Investments", "Rental Income", "Other Income"]),
        ]
    } else {
        &[
            ("expense_housing_utilities", &["Rent/Mortgage", "Electricity", "Water", "Gas/Heating", "Internet/Phone"]),
            ("expense_food_drinks", &["Groceries", "Restaurants/Cafes", "Food Delivery"]),
            ("expense_transportation", &["Public Transport", "Fuel/Gas", "Taxi/Ride Sharing", "Car Maintenance"]),
            ("expense_health_wellness", &["Health Insurance", "Doctor/Dentist", "Medicine", "Gym/Fitness"]),
            ("expense_entertainment", &["Subscriptions", "Hobbies", "Travel", "Events/Cinema"]),
            ("expense_shopping", &["Clothes/Shoes", "Home Goods"]),
            ("expense_finance", &["Loans/Credit", "Savings/Investments", "Insurance"]),
            ("expense_education_other", &["Education", "Gifts/Charity", "Miscellaneous"]),
        ]
    };
    groups
        .iter()
        .find(|(_, names)| names.contains(&category_name))
        .map(|(id, _)| *id)
}

fn apply_legacy_for_type(
    conn: &Connection,
    type_: &str,
    legacy: &LegacySectionsForType,
    summary: &mut LegacyImportSummary,
) -> Result<(), String> {
    // 1. Renamed built-in sections.
    for (id, new_name) in &legacy.overrides {
        let new_name = new_name.trim();
        if new_name.is_empty() {
            continue;
        }
        let Some(section) = find_section(conn, id).map_err(|e| e.to_string())? else {
            continue;
        };
        if section.type_ != type_ || section.hidden || section.name == new_name {
            continue;
        }
        match rename_section(conn, &section, new_name) {
            Ok(()) => summary.renamed += 1,
            Err(e) => summary.skipped.push(format!("rename {}: {e}", section.name)),
        }
    }

    // 2. Emojis chosen for built-in sections.
    for (id, emoji) in &legacy.emoji_overrides {
        if emoji.trim().is_empty() {
            continue;
        }
        let n = conn
            .execute(
                "UPDATE sections SET emoji = ?1 WHERE id = ?2 AND type = ?3 AND hidden = 0",
                params![emoji, id, type_],
            )
            .map_err(|e| e.to_string())?;
        summary.emojis_set += n;
    }

    // 3. Custom sections (they may have no categories yet — keep them anyway).
    let mut legacy_id_to_name: HashMap<&str, String> = HashMap::new();
    for (legacy_id, custom) in &legacy.custom_sections {
        let name = custom.name.trim();
        if name.is_empty() {
            continue;
        }
        legacy_id_to_name.insert(legacy_id.as_str(), name.to_string());
        let emoji = custom.emoji.clone().filter(|e| !e.trim().is_empty());
        let existing: Option<(String, Option<String>)> = conn
            .query_row(
                "SELECT id, emoji FROM sections WHERE type = ?1 AND name = ?2",
                params![type_, name],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        match existing {
            Some((id, None)) if emoji.is_some() => {
                conn.execute("UPDATE sections SET emoji = ?1 WHERE id = ?2", params![emoji, id])
                    .map_err(|e| e.to_string())?;
                summary.emojis_set += 1;
            }
            Some(_) => {}
            None => {
                conn.execute(
                    "INSERT INTO sections (id, type, name, emoji, sort_order, is_default, hidden)
                     VALUES (?1, ?2, ?3, ?4, 100, 0, 0)",
                    params![format!("custom_{}", Uuid::new_v4().simple()), type_, name, emoji],
                )
                .map_err(|e| e.to_string())?;
                summary.sections_created += 1;
            }
        }
    }

    // 4. Manual category → section assignments. The old UI preferred a section
    //    stored on the category over a manual assignment, so only apply one when
    //    the category had no section of its own before migration v5 — i.e. it's
    //    empty, or it's exactly what v5 backfilled from the built-in list.
    for (category_name, legacy_section_id) in &legacy.assignments {
        let target = if let Some(name) = legacy_id_to_name.get(legacy_section_id.as_str()) {
            Some(name.clone())
        } else {
            find_section(conn, legacy_section_id)
                .map_err(|e| e.to_string())?
                .filter(|s| s.type_ == type_ && !s.hidden)
                .map(|s| s.name)
        };
        let Some(target) = target else {
            summary.skipped.push(format!("assignment {category_name}: unknown section"));
            continue;
        };
        let current: Option<Option<String>> = conn
            .query_row(
                "SELECT section FROM categories WHERE type = ?1 AND name = ?2",
                params![type_, category_name],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        let Some(current) = current else { continue };
        let backfilled_name = match builtin_section_id_for(type_, category_name) {
            Some(id) => find_section(conn, id).map_err(|e| e.to_string())?.map(|s| s.name),
            None => None,
        };
        let user_chose_own = matches!(&current, Some(c) if Some(c) != backfilled_name.as_ref());
        if user_chose_own || current.as_deref() == Some(target.as_str()) {
            continue;
        }
        conn.execute(
            "UPDATE categories SET section = ?1 WHERE type = ?2 AND name = ?3",
            params![target, type_, category_name],
        )
        .map_err(|e| e.to_string())?;
        summary.categories_assigned += 1;
    }
    Ok(())
}

/// Apply a legacy payload inside one transaction. Safe to run more than once.
pub fn apply_legacy_sections(
    conn: &mut Connection,
    payload: &LegacySectionsPayload,
) -> Result<LegacyImportSummary, String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let mut summary = LegacyImportSummary::default();
    apply_legacy_for_type(&tx, "expense", &payload.expense, &mut summary)?;
    apply_legacy_for_type(&tx, "income", &payload.income, &mut summary)?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(summary)
}

#[tauri::command]
pub fn import_legacy_sections(
    pool: State<DbPool>,
    payload: LegacySectionsPayload,
) -> Result<LegacyImportSummary, String> {
    let mut conn = pool.get().map_err(|e| e.to_string())?;
    let summary = apply_legacy_sections(&mut conn, &payload)?;
    eprintln!(
        "[sections] legacy import: {} renamed, {} emojis, {} sections, {} assignments, {} skipped",
        summary.renamed,
        summary.emojis_set,
        summary.sections_created,
        summary.categories_assigned,
        summary.skipped.len()
    );
    Ok(summary)
}

#[cfg(test)]
mod tests {
    //! Runs migrations + the legacy import against a COPY of a real database.
    //! Usage: BUDGETTIER_TEST_DB=/path/to/copy.db BUDGETTIER_TEST_LEGACY=/path/legacy.json \
    //!        cargo test --lib sections -- --nocapture
    use super::*;

    #[test]
    fn migrate_and_import_real_copy() {
        let Ok(db_path) = std::env::var("BUDGETTIER_TEST_DB") else {
            eprintln!("BUDGETTIER_TEST_DB not set — skipping");
            return;
        };
        let mut conn = Connection::open(&db_path).expect("open db copy");
        crate::db::migrate(&conn).expect("migrate");

        if let Ok(legacy_path) = std::env::var("BUDGETTIER_TEST_LEGACY") {
            let raw = std::fs::read_to_string(legacy_path).expect("read legacy json");
            let payload: LegacySectionsPayload = serde_json::from_str(&raw).expect("parse legacy");
            let summary = apply_legacy_sections(&mut conn, &payload).expect("import");
            println!("SUMMARY {summary:?}");
            // Second run must be a no-op.
            let again = apply_legacy_sections(&mut conn, &payload).expect("import again");
            assert_eq!(again.renamed + again.sections_created + again.categories_assigned, 0);
        }

        let mut stmt = conn
            .prepare("SELECT type, name, COALESCE(emoji,''), hidden FROM sections ORDER BY type, sort_order, name")
            .unwrap();
        for row in stmt
            .query_map([], |r| {
                Ok(format!(
                    "SECTION {} | {} | {} | hidden={}",
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, i64>(3)?
                ))
            })
            .unwrap()
        {
            println!("{}", row.unwrap());
        }
        let mut stmt = conn
            .prepare("SELECT type, COALESCE(section,'<none>'), GROUP_CONCAT(name, ', ') FROM categories GROUP BY type, section ORDER BY type, section")
            .unwrap();
        for row in stmt
            .query_map([], |r| {
                Ok(format!(
                    "CATS {} | {} | {}",
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?
                ))
            })
            .unwrap()
        {
            println!("{}", row.unwrap());
        }
    }
}
