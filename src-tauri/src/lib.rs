/// Starts Tir. The Rust side only reads and writes files, runs git and
/// opens system dialogs (architecture, design rule 3); none exist yet.
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Tir");
}
