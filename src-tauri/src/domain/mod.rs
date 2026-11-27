//! Kiểu dữ liệu cốt lõi, không phụ thuộc Tauri hay hệ điều hành.

mod action;
pub mod format;
pub mod time;
mod trigger;

pub use action::Action;
pub use trigger::Trigger;
