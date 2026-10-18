#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod blocks;
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            app.manage(blocks::BlockStore::new(
                app.path().app_data_dir()?.join("work-blocks.json"),
            ));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            blocks::list_work_blocks,
            blocks::create_work_block,
            blocks::update_work_block,
            blocks::delete_work_block,
        ])
        .run(tauri::generate_context!())
        .expect("failed to launch DevScope");
}
