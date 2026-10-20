// Category CRUD. Deleting a category that is still used needs a replacement:
// its transactions, auto-categorization rules and budget limits move to that
// category (limits are added to the replacement's limit in the same month).

use crate::db::DbPool;
use rusqlite::{params, Connection, OptionalExtension, Row};
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

#[derive(Debug, Default, Serialize)]
pub struct DeleteCategoryResult {
    #[serde(rename = "movedTransactions")]
    pub moved_transactions: usize,
    #[serde(rename = "movedRules")]
    pub moved_rules: usize,
    #[serde(rename = "movedLimits")]
    pub moved_limits: usize,
}

fn category_type(conn: &Connection, id: &str) -> rusqlite::Result<Option<String>> {
    conn.query_row("SELECT type FROM categories WHERE id = ?1", params![id], |r| r.get(0))
        .optional()
}

/// "400" for whole amounts, "412.50" otherwise — matches what the budget UI saves.
fn money_text(n: f64) -> String {
    if n.fract().abs() < 1e-9 { format!("{}", n.round() as i64) } else { format!("{n:.2}") }
}

/// Delete a category, moving everything that points at it to `replacement`.
/// Without a replacement the category must be unused by transactions; its
/// rules and budget limits are then dropped with it.
pub fn delete_category_with(
    conn: &mut Connection,
    id: &str,
    replacement: Option<&str>,
) -> Result<DeleteCategoryResult, String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let type_ = category_type(&tx, id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("category {id} not found"))?;
    if let Some(r) = replacement {
        if r == id {
            return Err("Pick a different category to move to".into());
        }
        match category_type(&tx, r).map_err(|e| e.to_string())? {
            Some(t) if t == type_ => {}
            Some(_) => return Err("The replacement must be the same type (income or expense)".into()),
            None => return Err("The replacement category no longer exists".into()),
        }
    }

    let mut result = DeleteCategoryResult::default();
    let tx_count: i64 = tx
        .query_row("SELECT COUNT(*) FROM transactions WHERE category_id = ?1", params![id], |r| r.get(0))
        .map_err(|e| e.to_string())?;

    match replacement {
        Some(r) => {
            result.moved_transactions = tx
                .execute("UPDATE transactions SET category_id = ?1 WHERE category_id = ?2", params![r, id])
                .map_err(|e| e.to_string())?;
            result.moved_rules = tx
                .execute("UPDATE category_rules SET category_id = ?1 WHERE category_id = ?2", params![r, id])
                .map_err(|e| e.to_string())?;
            tx.execute("UPDATE budget_goals SET category_id = ?1 WHERE category_id = ?2", params![r, id])
                .map_err(|e| e.to_string())?;

            // Budget limits: add to the replacement's limit in the same plan, or
            // hand the limit over when the replacement had none there.
            let limits: Vec<(String, Option<String>, String)> = {
                let mut stmt = tx
                    .prepare("SELECT id, budget_plan_id, allocated_amount FROM budget_category_allocations WHERE category_id = ?1")
                    .map_err(|e| e.to_string())?;
                let rows = stmt
                    .query_map(params![id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
                    .map_err(|e| e.to_string())?;
                rows.collect::<Result<_, _>>().map_err(|e| e.to_string())?
            };
            for (limit_id, plan_id, amount) in limits {
                let existing: Option<(String, String)> = tx
                    .query_row(
                        "SELECT id, allocated_amount FROM budget_category_allocations
                         WHERE category_id = ?1 AND budget_plan_id IS ?2",
                        params![r, plan_id],
                        |row| Ok((row.get(0)?, row.get(1)?)),
                    )
                    .optional()
                    .map_err(|e| e.to_string())?;
                match existing {
                    Some((target_id, target_amount)) => {
                        let sum = target_amount.parse::<f64>().unwrap_or(0.0) + amount.parse::<f64>().unwrap_or(0.0);
                        tx.execute(
                            "UPDATE budget_category_allocations SET allocated_amount = ?1 WHERE id = ?2",
                            params![money_text(sum), target_id],
                        )
                        .map_err(|e| e.to_string())?;
                        tx.execute("DELETE FROM budget_category_allocations WHERE id = ?1", params![limit_id])
                            .map_err(|e| e.to_string())?;
                    }
                    None => {
                        tx.execute(
                            "UPDATE budget_category_allocations SET category_id = ?1 WHERE id = ?2",
                            params![r, limit_id],
                        )
                        .map_err(|e| e.to_string())?;
                    }
                }
                result.moved_limits += 1;
            }
        }
        None => {
            if tx_count > 0 {
                return Err(format!(
                    "Category has {tx_count} transaction(s). Choose a category to move them to."
                ));
            }
            for table in ["category_rules", "budget_goals", "budget_category_allocations"] {
                tx.execute(&format!("DELETE FROM {table} WHERE category_id = ?1"), params![id])
                    .map_err(|e| e.to_string())?;
            }
        }
    }

    tx.execute("DELETE FROM categories WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(result)
}

#[tauri::command]
pub fn delete_category(
    pool: State<DbPool>,
    id: String,
    replacement_id: Option<String>,
) -> Result<DeleteCategoryResult, String> {
    let mut conn = pool.get().map_err(|e| e.to_string())?;
    delete_category_with(&mut conn, &id, replacement_id.as_deref().filter(|r| !r.is_empty()))
}

#[cfg(test)]
mod delete_tests {
    use super::*;

    fn db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        crate::db::migrate(&conn).unwrap();
        conn.execute_batch(
            "INSERT INTO categories (id, name, type) VALUES
                ('coffee', 'Coffee', 'expense'), ('cafes', 'Cafes', 'expense'),
                ('tips', 'Tips', 'expense'), ('salary', 'Salary', 'income');
             INSERT INTO wallets (id, name, type, balance) VALUES ('w', 'Cash', 'cash', '0');
             INSERT INTO transactions (id, type, amount, description, date, category_id, wallet_id)
                VALUES ('t1', 'expense', '4', 'Flat white', '2026-10-01', 'coffee', 'w'),
                       ('t2', 'expense', '3', 'Espresso', '2026-10-02', 'coffee', 'w');
             INSERT INTO category_rules (id, pattern, category_id) VALUES ('r1', 'Starbucks', 'coffee'), ('r2', 'Tip', 'tips');
             INSERT INTO budget_plans (id, name, total_budget, savings_amount, savings_percentage, expense_budget, month)
                VALUES ('p', 'Oct', '0', '0', '0', '0', '2026-10');
             INSERT INTO budget_category_allocations (id, budget_plan_id, category_id, allocated_amount)
                VALUES ('a1', 'p', 'coffee', '40'), ('a2', 'p', 'cafes', '100'), ('a3', 'p', 'tips', '15');",
        )
        .unwrap();
        conn
    }

    fn count(conn: &Connection, sql: &str) -> i64 {
        conn.query_row(sql, [], |r| r.get(0)).unwrap()
    }

    #[test]
    fn used_category_moves_everything_to_the_replacement() {
        let mut conn = db();
        assert!(delete_category_with(&mut conn, "coffee", None).is_err(), "used category needs a replacement");
        assert!(delete_category_with(&mut conn, "coffee", Some("salary")).is_err(), "types must match");

        let res = delete_category_with(&mut conn, "coffee", Some("cafes")).unwrap();
        assert_eq!((res.moved_transactions, res.moved_rules, res.moved_limits), (2, 1, 1));
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM categories WHERE id = 'coffee'"), 0);
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM transactions WHERE category_id = 'cafes'"), 2);
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM category_rules WHERE category_id = 'cafes'"), 1);
        let limit: String = conn
            .query_row("SELECT allocated_amount FROM budget_category_allocations WHERE category_id = 'cafes'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(limit, "140");
    }

    #[test]
    fn unused_category_with_rules_and_limits_can_be_deleted() {
        let mut conn = db();
        delete_category_with(&mut conn, "tips", None).unwrap();
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM category_rules WHERE id = 'r2'"), 0);
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM budget_category_allocations WHERE id = 'a3'"), 0);
    }
}
