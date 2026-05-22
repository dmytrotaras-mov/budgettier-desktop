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
pub struct CurrentMonth {
    #[serde(rename = "budgetPlanId")]
    pub budget_plan_id: String,
    pub allocations: Vec<BudgetAllocation>,
}

#[tauri::command]
pub fn get_current_month_allocations(pool: State<DbPool>) -> Result<CurrentMonth, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let (now_y, now_m) = current_year_month();
    let month_str = format!("{:04}-{:02}", now_y, now_m);

    let existing: Option<BudgetPlan> = conn
        .query_row(
            &format!(
                "SELECT {PLAN_COLS} FROM budget_plans
                 WHERE period = 'monthly' AND month = ?1 LIMIT 1"
            ),
            params![month_str],
            row_to_plan,
        )
        .ok();

    let plan = match existing {
        Some(p) => p,
        None => {
            // Try to copy previous month
            let (prev_y, prev_m) = if now_m == 1 {
                (now_y - 1, 12)
            } else {
                (now_y, now_m - 1)
            };
            let prev_month_str = format!("{:04}-{:02}", prev_y, prev_m);
            let prev: Option<BudgetPlan> = conn
                .query_row(
                    &format!(
                        "SELECT {PLAN_COLS} FROM budget_plans
                         WHERE period = 'monthly' AND month = ?1 LIMIT 1"
                    ),
                    params![prev_month_str],
                    row_to_plan,
                )
                .ok();

            let new_plan = match prev {
                Some(p) => insert_plan(
                    &conn,
                    PlanInput {
                        name: format!("Budget for {}", month_str),
                        total_budget: p.total_budget.clone(),
                        savings_amount: p.savings_amount.clone(),
                        savings_percentage: p.savings_percentage.clone(),
                        expense_budget: p.expense_budget.clone(),
                        period: Some("monthly".to_string()),
                        month: Some(month_str.clone()),
                        year: None,
                        is_active: Some(true),
                    },
                )?,
                None => insert_plan(
                    &conn,
                    PlanInput {
                        name: format!("Budget for {}", month_str),
                        total_budget: "0".into(),
                        savings_amount: "0".into(),
                        savings_percentage: "0".into(),
                        expense_budget: "0".into(),
                        period: Some("monthly".to_string()),
                        month: Some(month_str.clone()),
                        year: None,
                        is_active: Some(true),
                    },
                )?,
            };

            // Copy previous month's allocations into the new plan.
            // Collect first (drop the prepared statement / iterator before re-using conn).
            let prev_id_opt: Option<String> = conn
                .query_row(
                    "SELECT id FROM budget_plans WHERE period = 'monthly' AND month = ?1 LIMIT 1",
                    params![prev_month_str],
                    |r| r.get::<_, String>(0),
                )
                .ok();
            if let Some(prev_id) = prev_id_opt {
                let prev_allocs: Vec<BudgetAllocation> = {
                    let mut stmt = conn
                        .prepare(&format!(
                            "SELECT {ALLOC_COLS} FROM budget_category_allocations
                             WHERE budget_plan_id = ?1"
                        ))
                        .map_err(|e| e.to_string())?;
                    let mapped = stmt
                        .query_map(params![prev_id], row_to_alloc)
                        .map_err(|e| e.to_string())?;
                    let collected: Result<Vec<_>, _> = mapped.collect();
                    collected.map_err(|e| e.to_string())?
                };
                for a in prev_allocs {
                    let new_id = Uuid::new_v4().to_string();
                    conn.execute(
                        "INSERT INTO budget_category_allocations
                         (id, budget_plan_id, category_id, allocated_amount)
                         VALUES (?1, ?2, ?3, ?4)",
                        params![new_id, new_plan.id, a.category_id, a.allocated_amount],
                    )
                    .map_err(|e| e.to_string())?;
                }
            }
            new_plan
        }
    };

    let mut stmt = conn
        .prepare(&format!(
            "SELECT {ALLOC_COLS} FROM budget_category_allocations WHERE budget_plan_id = ?1"
        ))
        .map_err(|e| e.to_string())?;
    let allocations: Vec<BudgetAllocation> = stmt
        .query_map(params![plan.id], row_to_alloc)
        .map_err(|e| e.to_string())?
        .collect::<Result<_, _>>()
        .map_err(|e| e.to_string())?;

    Ok(CurrentMonth {
        budget_plan_id: plan.id,
        allocations,
    })
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
