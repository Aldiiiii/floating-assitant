use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_sql::{Migration, MigrationKind};

mod llm;
mod lm;
mod screenshot;
mod window_shape;

const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        description: "create_conversations",
        sql: "CREATE TABLE conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL DEFAULT 'Percakapan baru',
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
        );",
        kind: MigrationKind::Up,
    },
    Migration {
        version: 2,
        description: "create_messages",
        sql: "CREATE TABLE messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
            role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
            content TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
        );
        CREATE INDEX idx_messages_conversation ON messages(conversation_id);",
        kind: MigrationKind::Up,
    },
];

fn focus_main(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

fn toggle_main(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        if win.is_visible().unwrap_or(false) {
            let _ = win.hide();
        } else {
            focus_main(app);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(
                    "sqlite:assistant.db",
                    MIGRATIONS
                        .iter()
                        .map(|m| Migration {
                            version: m.version,
                            description: m.description,
                            sql: m.sql,
                            kind: MigrationKind::Up,
                        })
                        .collect(),
                )
                .build(),
        )
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        toggle_main(app);
                    }
                })
                .build(),
        )
        .manage(llm::StreamRegistry::default())
        .manage(screenshot::AreaSelectionState::default())
        .invoke_handler(tauri::generate_handler![
            lm::lm_list_models,
            llm::chat_stream,
            llm::chat_cancel,
            screenshot::capture_fullscreen,
            screenshot::capture_active_window,
            screenshot::capture_area,
            screenshot::submit_area_selection,
            screenshot::cancel_area_selection,
            window_shape::set_window_shape
        ])
        .setup(|app| {
            let show = MenuItem::with_id(app, "show", "Tampilkan", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Keluar", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;

            TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().expect("missing default icon").clone())
                .tooltip("AI Assistant")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => focus_main(app),
                    "quit" => {
                        // Shutdown tertib: hancurkan window/webview dulu agar
                        // WebView2 tidak meninggalkan noise teardown, lalu exit.
                        let app = app.clone();
                        tauri::async_runtime::spawn(async move {
                            if let Some(w) = app.get_webview_window("overlay") {
                                let _ = w.close();
                            }
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.close();
                            }
                            tokio::time::sleep(std::time::Duration::from_millis(250)).await;
                            app.exit(0);
                        });
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        focus_main(tray.app_handle());
                    }
                })
                .build(app)?;

            app.global_shortcut().register("Alt+Space")?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
