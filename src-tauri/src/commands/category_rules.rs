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
    let pattern = input.pattern.split_whitespace().collect::<Vec<_>>().join(" ");
    if pattern.chars().count() < MIN_PATTERN_LEN {
        return Err(format!(
            "Pattern must be at least {MIN_PATTERN_LEN} characters — shorter ones match almost everything"
        ));
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

/// Shortest pattern a rule may have. One-letter rules matched nearly every
/// merchant and silently mis-categorized imports.
pub const MIN_PATTERN_LEN: usize = 2;

/// Lowercase and collapse runs of whitespace ("BB Berlin  Facility" from Wise
/// must still match a "BB Berlin Facility" rule).
pub fn normalize_for_match(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase()
}

/// True if `pattern` occurs in `text` at the START of a word, so "rice" does
/// not match "price" and "ls" does not match "rolls". Both inputs must already
/// be normalized.
pub fn matches_at_word_start(text: &str, pattern: &str) -> bool {
    if pattern.is_empty() {
        return false;
    }
    let mut from = 0;
    while let Some(pos) = text[from..].find(pattern) {
        let idx = from + pos;
        let prev_is_word_char = text[..idx]
            .chars()
            .next_back()
            .map_or(false, |c| c.is_alphanumeric());
        if !prev_is_word_char {
            return true;
        }
        from = idx + text[idx..].chars().next().map_or(1, |c| c.len_utf8());
    }
    false
}

/// All rules, normalized and ordered longest-first so the most specific
/// pattern wins (e.g. "Dm Drogerie" before "Dm").
pub struct RuleMatcher {
    rules: Vec<(String, String, String)>, // (normalized pattern, original pattern, category_id)
}

impl RuleMatcher {
    pub fn load(conn: &rusqlite::Connection) -> rusqlite::Result<Self> {
        let mut stmt = conn.prepare("SELECT pattern, category_id FROM category_rules")?;
        let mapped = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
        let mut rules = Vec::new();
        for row in mapped {
            let (pattern, category_id) = row?;
            let normalized = normalize_for_match(&pattern);
            if normalized.chars().count() >= MIN_PATTERN_LEN {
                rules.push((normalized, pattern, category_id));
            }
        }
        rules.sort_by(|a, b| b.0.chars().count().cmp(&a.0.chars().count()).then(a.0.cmp(&b.0)));
        Ok(Self { rules })
    }

    /// Returns (original pattern, category_id) of the best matching rule.
    pub fn find(&self, text: &str) -> Option<(&str, &str)> {
        let text = normalize_for_match(text);
        self.rules
            .iter()
            .find(|(pattern, _, _)| matches_at_word_start(&text, pattern))
            .map(|(_, original, category_id)| (original.as_str(), category_id.as_str()))
    }
}

/// Suggest a category for a transaction description typed by the user.
/// Returns None if no rule matches.
#[tauri::command]
pub fn suggest_category(
    pool: State<DbPool>,
    description: String,
) -> Result<Option<String>, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let matcher = RuleMatcher::load(&conn).map_err(|e| e.to_string())?;
    Ok(matcher.find(&description).map(|(_, category_id)| category_id.to_string()))
}

#[cfg(test)]
mod matcher_tests {
    use super::*;

    #[test]
    fn word_start_matching() {
        let m = |t: &str, p: &str| matches_at_word_start(&normalize_for_match(t), &normalize_for_match(p));
        assert!(m("Rewe Markt Gmbh-Zw Berlin", "Rewe"));
        assert!(m("H&m Home De0191 BERLIN", "H&M"));
        assert!(m("Paid to BB Berlin  Facility Management GmbH", "BB Berlin Facility"));
        assert!(m("Spc*Apo Rosenthaler Platz", "Apo"));
        assert!(!m("Sp No Sugar Factory BERLIN", "a"));
        assert!(!m("Mcpaper Berlin", "Rice"));
        assert!(!m("Price Club", "Rice"));
        assert!(!m("Rolls Royce", "Ls"));
        assert!(m("Ls Akkurat Cafe Berlin", "Ls"));
    }
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
