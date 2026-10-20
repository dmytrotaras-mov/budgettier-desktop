mod commands;
mod db;
mod menu;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // Open SQLite, run migrations, register the pool as managed state.
            let pool = db::init(app.handle()).expect("failed to initialize database");
            commands::auto_backup::start_scheduler(pool.clone());
            app.manage(pool);
            // Build native macOS menu and wire ⌘, → JS event.
            menu::build(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::wallets::get_wallets,
            commands::wallets::create_wallet,
            commands::wallets::update_wallet,
            commands::wallets::delete_wallet,
            commands::categories::get_categories,
            commands::categories::create_category,
            commands::categories::update_category,
            commands::categories::delete_category,
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::transactions::get_transactions,
            commands::transactions::create_transaction,
            commands::transactions::update_transaction,
            commands::transactions::delete_transaction,
            commands::budgets::get_budget_plans,
            commands::budgets::create_budget_plan,
            commands::budgets::update_budget_plan,
            commands::budgets::delete_budget_plan,
            commands::budgets::get_budget_allocations,
            commands::budgets::create_budget_allocation,
            commands::budgets::update_budget_allocation,
            commands::budgets::delete_budget_allocation,
            commands::budgets::get_current_month_allocations,
            commands::budgets::get_month_budget,
            commands::budgets::create_month_budget,
            commands::backup::backup_db,
            commands::backup::restore_db,
            commands::backup::export_csv,
            commands::auto_backup::get_backup_status,
            commands::auto_backup::set_auto_backup,
            commands::auto_backup::backup_now,
            commands::auto_backup::reveal_backup_folder,
            commands::category_rules::get_category_rules,
            commands::category_rules::create_category_rule,
            commands::category_rules::delete_category_rule,
            commands::category_rules::suggest_category,
            commands::import_wise::preview_wise_csv,
            commands::import_wise::import_wise_csv,
            commands::opening_balance::get_opening_balance,
            commands::opening_balance::set_opening_balance,
            commands::opening_balance::suggest_opening_date,
            commands::sections::get_sections,
            commands::sections::create_section,
            commands::sections::update_section,
            commands::sections::delete_section,
            commands::sections::get_recent_categories,
            commands::sections::import_legacy_sections,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
