// Auto-categorization rules.
//
// Each rule says "when a transaction description/merchant contains this
// substring (case-insensitive), suggest this category." Matching is
// substring-based — simple but covers ~95% of real cases.
//
// On first launch (after schema v2 migration), we seed ~50 default rules
// for common Berlin merchants — but only if a matching category exists in
// the user's database. Rules whose target category is missing are skipped
// silently.

use crate::db::DbPool;
use rusqlite::{params, Connection, Row};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Serialize)]
pub struct CategoryRule {
    pub id: String,
    pub pattern: String,
    #[serde(rename = "categoryId")]
    pub category_id: String,
    #[serde(rename = "categoryName")]
    pub category_name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct RuleInput {
    pub pattern: String,
    #[serde(rename = "categoryId")]
    pub category_id: String,
}

fn row_to_rule(row: &Row) -> rusqlite::Result<CategoryRule> {
    Ok(CategoryRule {
        id: row.get(0)?,
        pattern: row.get(1)?,
        category_id: row.get(2)?,
        category_name: row.get(3)?,
    })
}

const SELECT_WITH_NAME: &str =
    "SELECT r.id, r.pattern, r.category_id, c.name
     FROM category_rules r
     LEFT JOIN categories c ON c.id = r.category_id
     ORDER BY r.pattern";

#[tauri::command]
pub fn get_category_rules(pool: State<DbPool>) -> Result<Vec<CategoryRule>, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(SELECT_WITH_NAME).map_err(|e| e.to_string())?;
    let mapped = stmt
        .query_map([], row_to_rule)
        .map_err(|e| e.to_string())?;
    let collected: Result<Vec<_>, _> = mapped.collect();
    collected.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_category_rule(
    pool: State<DbPool>,
    input: RuleInput,
) -> Result<CategoryRule, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();
    let pattern = input.pattern.trim().to_string();
    if pattern.is_empty() {
        return Err("Pattern can't be empty".into());
    }
    conn.execute(
        "INSERT INTO category_rules (id, pattern, category_id) VALUES (?1, ?2, ?3)",
        params![id, pattern, input.category_id],
    )
    .map_err(|e| e.to_string())?;

    let name: Option<String> = conn
        .query_row(
            "SELECT name FROM categories WHERE id = ?1",
            params![input.category_id],
            |r| r.get(0),
        )
        .ok();
    Ok(CategoryRule {
        id,
        pattern,
        category_id: input.category_id,
        category_name: name,
    })
}

#[tauri::command]
pub fn delete_category_rule(pool: State<DbPool>, id: String) -> Result<(), String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let n = conn
        .execute("DELETE FROM category_rules WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    if n == 0 {
        return Err(format!("rule {id} not found"));
    }
    Ok(())
}

/// Given a transaction description/merchant string, return the category_id
/// of the FIRST matching rule (longest pattern wins to handle overlapping
/// patterns gracefully, e.g. "Dm Drogerie" vs "Dm" — we want the more
/// specific one). Returns None if nothing matches.
#[tauri::command]
pub fn suggest_category(
    pool: State<DbPool>,
    description: String,
) -> Result<Option<String>, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let needle = description.to_lowercase();
    let mut stmt = conn
        .prepare(
            "SELECT pattern, category_id FROM category_rules
             ORDER BY LENGTH(pattern) DESC",
        )
        .map_err(|e| e.to_string())?;
    let mapped = stmt
        .query_map([], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;
    for row in mapped {
        let (pattern, category_id) = row.map_err(|e| e.to_string())?;
        if needle.contains(&pattern.to_lowercase()) {
            return Ok(Some(category_id));
        }
    }
    Ok(None)
}

/// Seed default rules on first launch (or first launch after schema v2).
/// Only runs if `category_rules` is empty. Each seed rule names its target
/// category by NAME — if the user doesn't have that category, the rule is
/// skipped silently (no error). This means: user must have created the
/// stock categories in their app for seeds to apply.
pub fn seed_default_rules_if_empty(conn: &Connection) -> rusqlite::Result<()> {
    let count: i64 =
        conn.query_row("SELECT COUNT(*) FROM category_rules", [], |r| r.get(0))?;
    if count > 0 {
        return Ok(());
    }

    // (pattern, category_name) pairs. Matching is case-insensitive.
    // Patterns are picked to be specific enough to avoid false matches
    // — e.g. "BB Berlin Facility" is full enough that nothing else will
    // accidentally hit it.
    const DEFAULTS: &[(&str, &str)] = &[
        // Groceries
        ("Rewe", "Groceries"),
        ("Lidl", "Groceries"),
        ("Bio Company", "Groceries"),
        ("Denns Biomarkt", "Groceries"),
        ("Ullrich", "Groceries"),
        ("Go Asia", "Groceries"),
        ("E-Reichelt", "Groceries"),
        ("Hung Nguyen The", "Groceries"),
        ("Gernot Lenz", "Groceries"),
        ("Muddastadt", "Groceries"),
        ("Dm Drogerie", "Groceries"),
        ("Rossmann", "Groceries"),
        // Food Delivery
        ("Flink", "Food Delivery"),
        // Restaurants/Cafes
        ("Sofi Bakery", "Restaurants/Cafes"),
        ("Kamps", "Restaurants/Cafes"),
        ("Keyu Cafe", "Restaurants/Cafes"),
        ("Yva Cafe", "Restaurants/Cafes"),
        ("Ls Akkurat Cafe", "Restaurants/Cafes"),
        ("Sant Buena Cafe", "Restaurants/Cafes"),
        ("Happy Matcha", "Restaurants/Cafes"),
        ("Lyfe Berlin", "Restaurants/Cafes"),
        ("Goodlyfe", "Restaurants/Cafes"),
        ("Pommes Freunde", "Restaurants/Cafes"),
        ("Orient Master", "Restaurants/Cafes"),
        ("Ls Pho Mitte", "Restaurants/Cafes"),
        ("25hours Gastro", "Restaurants/Cafes"),
        // Housing & Utilities
        ("Muji", "Home Supplies"),
        ("BB Berlin Facility", "Rent"),
        ("VATTENFALL", "Electricity"),
        ("freenet", "Phone"),
        ("Telekom Deutschland", "Internet"),
        // Transportation
        ("Bolt.eu", "Taxi/Ride Sharing"),
        ("Uber", "Taxi/Ride Sharing"),
        ("uber.com", "Taxi/Ride Sharing"),
        ("Lime", "Scooter sharing"),
        ("Flix", "Public Transport"),
        ("DB Vertrieb", "Public Transport"),
        // Health & Wellness
        ("Platon1", "Doctor/Dentist"),
        ("Newsoul", "Wellness"),
        // Shopping
        ("Subdued", "Clothes/Shoes"),
        ("Birkenstock", "Clothes/Shoes"),
        ("Vivobarefoot", "Clothes/Shoes"),
        ("Fielmann", "Clothes/Shoes"),
        // Entertainment
        ("Netflix", "Subscriptions"),
        ("Apple.com/bill", "Subscriptions"),
        ("Claude.ai", "Subscriptions"),
        ("Zoologischer Garten", "Entertainment"),
        ("Nyx*Photoautomat", "Photos"),
        ("Sp Film Speed Lab", "Photos"),
        // Finance
        ("ottonova", "Health Insurance"),
        ("Haftpflichtkasse", "Insurance"),
        // Custom
        ("Blume 2000", "Gifts"),
        // Income
        ("WPP Production", "Salary"),
    ];

    let mut inserted = 0usize;
    let mut skipped = 0usize;
    for (pattern, cat_name) in DEFAULTS {
        // Find category by name (any type — income or expense — but exact match).
        let cat_id: Option<String> = conn
            .query_row(
                "SELECT id FROM categories WHERE LOWER(name) = LOWER(?1) LIMIT 1",
                params![cat_name],
                |r| r.get(0),
            )
            .ok();
        match cat_id {
            Some(cid) => {
                let id = Uuid::new_v4().to_string();
                conn.execute(
                    "INSERT INTO category_rules (id, pattern, category_id) VALUES (?1, ?2, ?3)",
                    params![id, pattern, cid],
                )?;
                inserted += 1;
            }
            None => {
                skipped += 1;
            }
        }
    }
    eprintln!(
        "[db] seeded {} auto-categorization rules ({} skipped — categories missing)",
        inserted, skipped
    );
    Ok(())
}
