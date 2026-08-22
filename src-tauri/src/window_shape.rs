/// Command tipis — implementasi ada di `platform`.
#[tauri::command]
pub fn set_window_shape(app: tauri::AppHandle, radius: i32) -> Result<(), String> {
    crate::platform::set_window_shape(&app, radius)
}
