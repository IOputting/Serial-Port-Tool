#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod state;
mod serial_core;

use state::PortState;
use std::sync::{Arc, Mutex, atomic::AtomicBool};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(PortState {
            should_read: Arc::new(AtomicBool::new(false)),
            serial_writer: Arc::new(Mutex::new(None)),
        })
        .invoke_handler(tauri::generate_handler![
            serial_core::get_available_ports,
            serial_core::connect_port,
            serial_core::disconnect_port,
            serial_core::send_data,
            serial_core::set_dtr_rts,
            serial_core::send_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
