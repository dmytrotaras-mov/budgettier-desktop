// Native macOS menu bar.
//
// Three submenus only:
//   Budgettier — About, Preferences (⌘,), Quit (⌘Q)
//   Edit       — standard Cut/Copy/Paste/Undo/Redo/Select All (predefined)
//   Window     — Minimize, Zoom (predefined)
//
// "Preferences" emits an event to the JS side so the React router can navigate
// to /settings — opening it inline rather than as a separate window keeps the
// implementation simple and matches the user's "single window" preference.

use tauri::menu::{
    AboutMetadataBuilder, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder,
};
use tauri::{App, Emitter};

pub const PREFERENCES_EVENT: &str = "menu:preferences";

pub fn build(app: &App) -> tauri::Result<()> {
    let handle = app.handle();

    // ---- Budgettier (app menu) ----
    let about = PredefinedMenuItem::about(
        handle,
        Some("About Budgettier"),
        Some(
            AboutMetadataBuilder::new()
                .name(Some("Budgettier"))
                .version(Some(env!("CARGO_PKG_VERSION")))
                .copyright(Some("© Budgettier"))
                .build(),
        ),
    )?;
    let preferences = MenuItemBuilder::with_id("preferences", "Preferences…")
        .accelerator("CmdOrCtrl+,")
        .build(handle)?;
    let quit = PredefinedMenuItem::quit(handle, Some("Quit Budgettier"))?;

    let app_submenu = SubmenuBuilder::new(handle, "Budgettier")
        .item(&about)
        .separator()
        .item(&preferences)
        .separator()
        .item(&quit)
        .build()?;

    // ---- Edit (standard) ----
    let edit_submenu = SubmenuBuilder::new(handle, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    // ---- Window (standard) ----
    let window_submenu = SubmenuBuilder::new(handle, "Window")
        .minimize()
        .item(&PredefinedMenuItem::maximize(handle, None)?)
        .build()?;

    let menu = MenuBuilder::new(handle)
        .item(&app_submenu)
        .item(&edit_submenu)
        .item(&window_submenu)
        .build()?;

    app.set_menu(menu)?;

    // Forward "preferences" clicks to the JS side.
    let handle_for_event = handle.clone();
    app.on_menu_event(move |_app, event| {
        if event.id() == "preferences" {
            // Emit to all windows (we only have one).
            let _ = handle_for_event.emit(PREFERENCES_EVENT, ());
        }
    });

    Ok(())
}
