use std::sync::{Arc, Mutex, atomic::AtomicBool};

pub struct PortState {
    pub should_read: Arc<AtomicBool>,
    pub serial_writer: Arc<Mutex<Option<Box<dyn serialport::SerialPort>>>>,
}
