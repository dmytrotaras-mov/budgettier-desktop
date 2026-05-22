// Category CRUD. Same delete policy as wallets — block if any transaction
// or budget allocation references this category.

use crate::db::DbPool;
use rusqlite::{params, Row};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Serialize)]
pub struct Category {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub type_: String,
    pub color: Option<String>,
    pub emoji: Option<String>,
    pub section: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CategoryInput {
    pub name: String,
    #[serde(rename = "type")]
    pub type_: String,
    pub color: Option<String>,
    pub emoji: Option<String>,
    pub section: Option<String>,
}

fn row_to_category(row: &Row) -> rusqlite::Result<Category> {
    Ok(Category {
        id: row.get(0)?,
        name: row.get(1)?,
        type_: row.get(2)?,
        color: row.get(3)?,
        emoji: row.get(4)?,
        section: row.get(5)?,
    })
}

#[tauri::command]
pub fn get_categories(
    pool: State<DbPool>,
    type_filter: Option<String>,
) -> Result<Vec<Category>, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let (sql, params): (&str, Vec<&dyn rusqlite::ToSql>) = match &type_filter {
        Some(t) => (
            "SELECT id, name, type, color, emoji, section FROM categories WHERE type = ?1 ORDER BY name",
            vec![t],
        ),
        None => (
            "SELECT id, name, type, color, emoji, section FROM categories ORDER BY name",
            vec![],
        ),
    };
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params.as_slice(), row_to_category)
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_category(pool: State<DbPool>, input: CategoryInput) -> Result<Category, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO categories (id, name, type, color, emoji, section)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            id,
            input.name,
            input.type_,
            input.color.as_deref().unwrap_or("#6B7280"),
            input.emoji,
            input.section,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(Category {
        id,
        name: input.name,
        type_: input.type_,
        color: Some(input.color.unwrap_or_else(|| "#6B7280".to_string())),
        emoji: input.emoji,
        section: input.section,
    })
}

#[tauri::command]
pub fn update_category(
    pool: State<DbPool>,
    id: String,
    input: CategoryInput,
) -> Result<Category, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let updated = conn
        .execute(
            "UPDATE categories SET name = ?1, type = ?2, color = ?3, emoji = ?4, section = ?5
             WHERE id = ?6",
            params![
                input.name,
                input.type_,
                input.color.as_deref().unwrap_or("#6B7280"),
                input.emoji,
                input.section,
                id,
            ],
        )
        .map_err(|e| e.to_string())?;
    if updated == 0 {
        return Err(format!("category {id} not found"));
    }
    Ok(Category {
        id,
        name: input.name,
        type_: input.type_,
        color: Some(input.color.unwrap_or_else(|| "#6B7280".to_string())),
        emoji: input.emoji,
        section: input.section,
    })
}

#[tauri::command]
pub fn delete_category(pool: State<DbPool>, id: String) -> Result<(), String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let tx_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM transactions WHERE category_id = ?1",
            params![id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if tx_count > 0 {
        return Err(format!(
            "Category has {tx_count} transaction(s). Move or delete them first."
        ));
    }
    let alloc_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM budget_category_allocations WHERE category_id = ?1",
            params![id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if alloc_count > 0 {
        // Allocations are derived data — safe to drop them with the category.
        conn.execute(
            "DELETE FROM budget_category_allocations WHERE category_id = ?1",
            params![id],
        )
        .map_err(|e| e.to_string())?;
    }
    let removed = conn
        .execute("DELETE FROM categories WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    if removed == 0 {
        return Err(format!("category {id} not found"));
    }
    Ok(())
}
