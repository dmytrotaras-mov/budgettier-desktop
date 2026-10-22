// Budget plans (period-based) and category allocations within them.
// Includes the special `/budget-allocations/current-month` flow that auto-
// creates the current month's plan, copying the previous month's plan if one
// exists. This was the trickiest route in the old Express server — same logic
// here, just in SQL.

use crate::db::DbPool;
use rusqlite::{params, Connection, Row};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Serialize)]
pub struct BudgetPlan {
    pub id: String,
    pub name: String,
    #[serde(rename = "totalBudget")]
    pub total_budget: String,
    #[serde(rename = "savingsAmount")]
    pub savings_amount: String,
    #[serde(rename = "savingsPercentage")]
    pub savings_percentage: String,
    #[serde(rename = "expenseBudget")]
    pub expense_budget: String,
    pub period: String,
    pub month: Option<String>,
    pub year: Option<String>,
    #[serde(rename = "isActive")]
    pub is_active: bool,
}

#[derive(Debug, Serialize)]
pub struct BudgetAllocation {
    pub id: String,
    #[serde(rename = "budgetPlanId")]
    pub budget_plan_id: Option<String>,
    #[serde(rename = "categoryId")]
    pub category_id: Option<String>,
    #[serde(rename = "allocatedAmount")]
    pub allocated_amount: String,
}

fn row_to_plan(row: &Row) -> rusqlite::Result<BudgetPlan> {
    Ok(BudgetPlan {
        id: row.get(0)?,
        name: row.get(1)?,
        total_budget: row.get(2)?,
        savings_amount: row.get(3)?,
        savings_percentage: row.get(4)?,
        expense_budget: row.get(5)?,
        period: row.get(6)?,
        month: row.get(7)?,
        year: row.get(8)?,
        is_active: row.get::<_, i64>(9).map(|v| v != 0).unwrap_or(true),
    })
}

fn row_to_alloc(row: &Row) -> rusqlite::Result<BudgetAllocation> {
    Ok(BudgetAllocation {
        id: row.get(0)?,
        budget_plan_id: row.get(1)?,
        category_id: row.get(2)?,
        allocated_amount: row.get(3)?,
    })
}

const PLAN_COLS: &str =
    "id, name, total_budget, savings_amount, savings_percentage, expense_budget,
     period, month, year, is_active";

const ALLOC_COLS: &str =
    "id, budget_plan_id, category_id, allocated_amount";

// ---- Plans ----

#[tauri::command]
pub fn get_budget_plans(
    pool: State<DbPool>,
    period: Option<String>,
    month: Option<String>,
    year: Option<String>,
) -> Result<Value, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;

    // If period+month/year given, return single plan or null (matches legacy API).
    if let (Some(p), Some(m_or_y)) = (
        period.as_deref(),
        month.as_deref().or(year.as_deref()),
    ) {
        let col = if month.is_some() { "month" } else { "year" };
        let plan = conn
            .query_row(
                &format!(
                    "SELECT {PLAN_COLS} FROM budget_plans WHERE period = ?1 AND {col} = ?2 LIMIT 1"
                ),
                params![p, m_or_y],
                row_to_plan,
            )
            .ok();
        return Ok(serde_json::to_value(plan).map_err(|e| e.to_string())?);
    }

    let mut stmt = conn
        .prepare(&format!(
            "SELECT {PLAN_COLS} FROM budget_plans ORDER BY created_at DESC"
        ))
        .map_err(|e| e.to_string())?;
    let plans: Vec<BudgetPlan> = stmt
        .query_map([], row_to_plan)
        .map_err(|e| e.to_string())?
        .collect::<Result<_, _>>()
        .map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(plans).map_err(|e| e.to_string())?)
}

#[derive(Debug, Deserialize)]
pub struct PlanInput {
    pub name: String,
    #[serde(rename = "totalBudget")]
    pub total_budget: String,
    #[serde(rename = "savingsAmount")]
    pub savings_amount: String,
    #[serde(rename = "savingsPercentage")]
    pub savings_percentage: String,
    #[serde(rename = "expenseBudget")]
    pub expense_budget: String,
    pub period: Option<String>,
    pub month: Option<String>,
    pub year: Option<String>,
    #[serde(rename = "isActive")]
    pub is_active: Option<bool>,
}

#[tauri::command]
pub fn create_budget_plan(pool: State<DbPool>, input: PlanInput) -> Result<BudgetPlan, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    insert_plan(&conn, input)
}

fn insert_plan(conn: &Connection, input: PlanInput) -> Result<BudgetPlan, String> {
    let id = Uuid::new_v4().to_string();
    let period = input.period.clone().unwrap_or_else(|| "monthly".to_string());
    let is_active = input.is_active.unwrap_or(true);
    conn.execute(
        &format!(
            "INSERT INTO budget_plans ({PLAN_COLS})
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)"
        ),
        params![
            id,
            input.name,
            input.total_budget,
            input.savings_amount,
            input.savings_percentage,
            input.expense_budget,
            period,
            input.month,
            input.year,
            if is_active { 1_i64 } else { 0_i64 },
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(BudgetPlan {
        id,
        name: input.name,
        total_budget: input.total_budget,
        savings_amount: input.savings_amount,
        savings_percentage: input.savings_percentage,
        expense_budget: input.expense_budget,
        period,
        month: input.month,
        year: input.year,
        is_active,
    })
}

#[tauri::command]
pub fn update_budget_plan(
    pool: State<DbPool>,
    id: String,
    input: Value,
) -> Result<BudgetPlan, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let map = input.as_object().ok_or("plan update must be an object")?;
    let mut sets: Vec<String> = Vec::new();
    let mut bind: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    macro_rules! add {
        ($col:expr, $v:expr) => {{
            sets.push(format!("{} = ?{}", $col, bind.len() + 1));
            bind.push(Box::new($v));
        }};
    }
    for (k, v) in map {
        match k.as_str() {
            "name" => {
                if let Some(s) = v.as_str() {
                    add!("name", s.to_string());
                }
            }
            "totalBudget" => {
                if let Some(s) = v.as_str() {
                    add!("total_budget", s.to_string());
                }
            }
            "savingsAmount" => {
                if let Some(s) = v.as_str() {
                    add!("savings_amount", s.to_string());
                }
            }
            "savingsPercentage" => {
                if let Some(s) = v.as_str() {
                    add!("savings_percentage", s.to_string());
                }
            }
            "expenseBudget" => {
                if let Some(s) = v.as_str() {
                    add!("expense_budget", s.to_string());
                }
            }
            "period" => {
                if let Some(s) = v.as_str() {
                    add!("period", s.to_string());
                }
            }
            "month" => {
                if v.is_null() {
                    add!("month", Option::<String>::None);
                } else if let Some(s) = v.as_str() {
                    add!("month", Some(s.to_string()));
                }
            }
            "year" => {
                if v.is_null() {
                    add!("year", Option::<String>::None);
                } else if let Some(s) = v.as_str() {
                    add!("year", Some(s.to_string()));
                }
            }
            "isActive" => {
                if let Some(b) = v.as_bool() {
                    add!("is_active", if b { 1_i64 } else { 0_i64 });
                }
            }
            _ => {}
        }
    }
    if !sets.is_empty() {
        sets.push(format!("updated_at = ?{}", bind.len() + 1));
        bind.push(Box::new(now_ms()));
        let sql = format!(
            "UPDATE budget_plans SET {} WHERE id = ?{}",
            sets.join(", "),
            bind.len() + 1
        );
        bind.push(Box::new(id.clone()));
        let bind_refs: Vec<&dyn rusqlite::ToSql> = bind.iter().map(|b| b.as_ref()).collect();
        conn.execute(&sql, bind_refs.as_slice())
            .map_err(|e| e.to_string())?;
    }
    let plan = conn
        .query_row(
            &format!("SELECT {PLAN_COLS} FROM budget_plans WHERE id = ?1"),
            params![id],
            row_to_plan,
        )
        .map_err(|e| e.to_string())?;
    Ok(plan)
}

#[tauri::command]
pub fn delete_budget_plan(pool: State<DbPool>, id: String) -> Result<(), String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    // Cascade allocations
    conn.execute(
        "DELETE FROM budget_category_allocations WHERE budget_plan_id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    let n = conn
        .execute("DELETE FROM budget_plans WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    if n == 0 {
        return Err(format!("budget plan {id} not found"));
    }
    Ok(())
}

// ---- Allocations ----

#[tauri::command]
pub fn get_budget_allocations(
    pool: State<DbPool>,
    budget_plan_id: String,
) -> Result<Vec<BudgetAllocation>, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {ALLOC_COLS} FROM budget_category_allocations WHERE budget_plan_id = ?1"
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![budget_plan_id], row_to_alloc)
        .map_err(|e| e.to_string())?;
    let out: Result<Vec<_>, _> = rows.collect();
    out.map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
pub struct AllocationInput {
    #[serde(rename = "budgetPlanId")]
    pub budget_plan_id: Option<String>,
    #[serde(rename = "categoryId")]
    pub category_id: Option<String>,
    #[serde(rename = "allocatedAmount")]
    pub allocated_amount: String,
}

#[tauri::command]
pub fn create_budget_allocation(
    pool: State<DbPool>,
    input: AllocationInput,
) -> Result<BudgetAllocation, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();
    conn.execute(
        &format!(
            "INSERT INTO budget_category_allocations ({ALLOC_COLS}) VALUES (?1, ?2, ?3, ?4)"
        ),
        params![
            id,
            input.budget_plan_id,
            input.category_id,
            input.allocated_amount
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(BudgetAllocation {
        id,
        budget_plan_id: input.budget_plan_id,
        category_id: input.category_id,
        allocated_amount: input.allocated_amount,
    })
}

#[tauri::command]
pub fn update_budget_allocation(
    pool: State<DbPool>,
    id: String,
    input: Value,
) -> Result<BudgetAllocation, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let map = input.as_object().ok_or("update must be object")?;
    let mut sets: Vec<String> = Vec::new();
    let mut bind: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    for (k, v) in map {
        match k.as_str() {
            "budgetPlanId" => {
                if let Some(s) = v.as_str() {
                    sets.push(format!("budget_plan_id = ?{}", bind.len() + 1));
                    bind.push(Box::new(s.to_string()));
                }
            }
            "categoryId" => {
                if let Some(s) = v.as_str() {
                    sets.push(format!("category_id = ?{}", bind.len() + 1));
                    bind.push(Box::new(s.to_string()));
                }
            }
            "allocatedAmount" => {
                if let Some(s) = v.as_str() {
                    sets.push(format!("allocated_amount = ?{}", bind.len() + 1));
                    bind.push(Box::new(s.to_string()));
                }
            }
            _ => {}
        }
    }
    if !sets.is_empty() {
        let sql = format!(
            "UPDATE budget_category_allocations SET {} WHERE id = ?{}",
            sets.join(", "),
            bind.len() + 1
        );
        bind.push(Box::new(id.clone()));
        let bind_refs: Vec<&dyn rusqlite::ToSql> = bind.iter().map(|b| b.as_ref()).collect();
        conn.execute(&sql, bind_refs.as_slice())
            .map_err(|e| e.to_string())?;
    }
    let row = conn
        .query_row(
            &format!("SELECT {ALLOC_COLS} FROM budget_category_allocations WHERE id = ?1"),
            params![id],
            row_to_alloc,
        )
        .map_err(|e| e.to_string())?;
    Ok(row)
}

#[tauri::command]
pub fn delete_budget_allocation(pool: State<DbPool>, id: String) -> Result<(), String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let n = conn
        .execute(
            "DELETE FROM budget_category_allocations WHERE id = ?1",
            params![id],
        )
        .map_err(|e| e.to_string())?;
    if n == 0 {
        return Err(format!("allocation {id} not found"));
    }
    Ok(())
}

// ---- Current month auto-create ----

#[derive(Debug, Serialize)]
pub struct MonthBudget {
    #[serde(rename = "budgetPlanId")]
    pub budget_plan_id: String,
    pub allocations: Vec<BudgetAllocation>,
    pub month: String,
    /// False for a past month that never had a budget (nothing is created
    /// for it automatically — history isn't invented).
    pub exists: bool,
    /// Most recent earlier month that has a budget: what a new month copies.
    #[serde(rename = "copySource")]
    pub copy_source: Option<String>,
    /// Income set by hand for this month (overrides the income mode).
    #[serde(rename = "expectedIncome")]
    pub expected_income: Option<String>,
}

fn expected_income_of(conn: &Connection, plan_id: &str) -> Option<String> {
    conn.query_row("SELECT expected_income FROM budget_plans WHERE id = ?1", params![plan_id], |r| r.get(0))
        .ok()
        .flatten()
}

fn find_plan(conn: &Connection, month: &str) -> Option<BudgetPlan> {
    conn.query_row(
        &format!("SELECT {PLAN_COLS} FROM budget_plans WHERE period = 'monthly' AND month = ?1 LIMIT 1"),
        params![month],
        row_to_plan,
    )
    .ok()
}

fn latest_plan_before(conn: &Connection, month: &str) -> Option<BudgetPlan> {
    conn.query_row(
        &format!(
            "SELECT {PLAN_COLS} FROM budget_plans
             WHERE period = 'monthly' AND month < ?1 ORDER BY month DESC LIMIT 1"
        ),
        params![month],
        row_to_plan,
    )
    .ok()
}

fn allocations_for(conn: &Connection, plan_id: &str) -> Result<Vec<BudgetAllocation>, String> {
    let mut stmt = conn
        .prepare(&format!("SELECT {ALLOC_COLS} FROM budget_category_allocations WHERE budget_plan_id = ?1"))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![plan_id], row_to_alloc)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string());
    rows
}

/// Create `month`'s plan as a copy of `source` (limits included), atomically.
fn create_plan_copy(conn: &Connection, month: &str, source: Option<&BudgetPlan>) -> Result<BudgetPlan, String> {
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    let zero = || "0".to_string();
    let plan = insert_plan(
        &tx,
        PlanInput {
            name: format!("Budget for {month}"),
            total_budget: source.map(|p| p.total_budget.clone()).unwrap_or_else(zero),
            savings_amount: source.map(|p| p.savings_amount.clone()).unwrap_or_else(zero),
            savings_percentage: source.map(|p| p.savings_percentage.clone()).unwrap_or_else(zero),
            expense_budget: source.map(|p| p.expense_budget.clone()).unwrap_or_else(zero),
            period: Some("monthly".to_string()),
            month: Some(month.to_string()),
            year: None,
            is_active: Some(true),
        },
    )?;
    if let Some(src) = source {
        for a in allocations_for(&tx, &src.id)? {
            tx.execute(
                "INSERT INTO budget_category_allocations (id, budget_plan_id, category_id, allocated_amount)
                 VALUES (?1, ?2, ?3, ?4)",
                params![Uuid::new_v4().to_string(), plan.id, a.category_id, a.allocated_amount],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(plan)
}

fn valid_month(month: &str) -> bool {
    let b = month.as_bytes();
    b.len() == 7 && b[4] == b'-' && month[..4].parse::<u32>().is_ok()
        && month[5..].parse::<u32>().map_or(false, |m| (1..=12).contains(&m))
}

/// Budget for `month` ("YYYY-MM"). When it has none and `create` is set, it
/// is created as a copy of the most recent earlier month's budget.
pub(crate) fn month_budget(conn: &Connection, month: &str, create: bool) -> Result<MonthBudget, String> {
    if !valid_month(month) {
        return Err(format!("invalid month: {month}"));
    }
    let source = latest_plan_before(conn, month);
    let plan = match find_plan(conn, month) {
        Some(p) => Some(p),
        None if create => Some(create_plan_copy(conn, month, source.as_ref())?),
        None => None,
    };
    Ok(match plan {
        Some(p) => MonthBudget {
            expected_income: expected_income_of(conn, &p.id),
            allocations: allocations_for(conn, &p.id)?,
            budget_plan_id: p.id,
            month: month.to_string(),
            exists: true,
            copy_source: source.and_then(|s| s.month),
        },
        None => MonthBudget {
            budget_plan_id: String::new(),
            allocations: Vec::new(),
            month: month.to_string(),
            exists: false,
            copy_source: source.and_then(|s| s.month),
            expected_income: None,
        },
    })
}

/// Set (or clear, with None/"") the income a month is planned around.
#[tauri::command]
pub fn set_month_income(pool: State<DbPool>, month: String, amount: Option<String>) -> Result<MonthBudget, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let budget = month_budget(&conn, &month, true)?;
    let amount = match amount.as_deref().map(str::trim) {
        None | Some("") => None,
        Some(a) => Some(format!("{:.2}", a.replace(',', ".").parse::<f64>().map_err(|_| format!("not an amount: {a}"))?)),
    };
    conn.execute("UPDATE budget_plans SET expected_income = ?1 WHERE id = ?2", params![amount, budget.budget_plan_id])
        .map_err(|e| e.to_string())?;
    month_budget(&conn, &month, false)
}

fn current_month_str() -> String {
    let (y, m) = current_year_month();
    format!("{:04}-{:02}", y, m)
}

#[tauri::command]
pub fn get_current_month_allocations(pool: State<DbPool>) -> Result<MonthBudget, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    month_budget(&conn, &current_month_str(), true)
}

/// The budget for any month. The current and future months are created on
/// first view (copied from the latest earlier budget); past months are not.
#[tauri::command]
pub fn get_month_budget(pool: State<DbPool>, month: String) -> Result<MonthBudget, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let create = month.as_str() >= current_month_str().as_str();
    month_budget(&conn, &month, create)
}

/// Explicitly create a (past) month's budget by copying the latest earlier one.
#[tauri::command]
pub fn create_month_budget(pool: State<DbPool>, month: String) -> Result<MonthBudget, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    month_budget(&conn, &month, true)
}

// ---- helpers ----

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Convert UTC `now_ms()` into (year, month1-based) without pulling chrono in.
fn current_year_month() -> (i32, u32) {
    let secs = now_ms() / 1000;
    let days = secs.div_euclid(86400);
    let z = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let m = (if mp < 10 { mp + 3 } else { mp - 9 }) as u32;
    let y = if m <= 2 { y + 1 } else { y };
    (y as i32, m)
}

#[cfg(test)]
mod month_budget_tests {
    use super::*;

    fn db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::migrate(&conn).unwrap();
        conn.execute("INSERT INTO categories (id, name, type) VALUES ('groc', 'Groceries', 'expense')", []).unwrap();
        conn
    }

    fn limit(conn: &Connection, month: &str) -> Option<String> {
        let b = month_budget(conn, month, false).unwrap();
        b.allocations.first().map(|a| a.allocated_amount.clone())
    }

    #[test]
    fn flex_budget_without_a_category_is_copied_to_new_months() {
        let conn = db();
        let sep = month_budget(&conn, "2026-09", true).unwrap();
        conn.execute(
            "INSERT INTO budget_category_allocations (id, budget_plan_id, category_id, allocated_amount)
             VALUES ('flex', ?1, NULL, '150')",
            params![sep.budget_plan_id],
        )
        .unwrap();
        let oct = month_budget(&conn, "2026-10", true).unwrap();
        let flex: Vec<_> = oct.allocations.iter().filter(|a| a.category_id.is_none()).collect();
        assert_eq!(flex.len(), 1);
        assert_eq!(flex[0].allocated_amount, "150");
    }

    #[test]
    fn months_are_independent_and_new_months_copy_the_latest() {
        let conn = db();
        // September budget with Groceries 400.
        let sep = month_budget(&conn, "2026-09", true).unwrap();
        conn.execute(
            "INSERT INTO budget_category_allocations (id, budget_plan_id, category_id, allocated_amount)
             VALUES ('a1', ?1, 'groc', '400')",
            params![sep.budget_plan_id],
        )
        .unwrap();

        // October is created as a copy, then changed to 450.
        let oct = month_budget(&conn, "2026-10", true).unwrap();
        assert_eq!(oct.copy_source.as_deref(), Some("2026-09"));
        assert_eq!(limit(&conn, "2026-10").as_deref(), Some("400"));
        conn.execute(
            "UPDATE budget_category_allocations SET allocated_amount = '450' WHERE budget_plan_id = ?1",
            params![oct.budget_plan_id],
        )
        .unwrap();

        // September keeps its own limit; December copies the latest (October), skipping the gap.
        assert_eq!(limit(&conn, "2026-09").as_deref(), Some("400"));
        month_budget(&conn, "2026-12", true).unwrap();
        assert_eq!(limit(&conn, "2026-12").as_deref(), Some("450"));

        // A month that was never opened isn't created by a read-only look.
        let aug = month_budget(&conn, "2026-08", false).unwrap();
        assert!(!aug.exists && aug.allocations.is_empty());
        assert!(month_budget(&conn, "2026-13", false).is_err());
    }
}
