//! Kiểu dữ liệu cốt lõi, không phụ thuộc Tauri hay hệ điều hành.

mod action;
pub mod format;
mod job;
pub mod time;
mod trigger;

pub use action::Action;
pub use job::{Job, Phase};
pub use trigger::Trigger;
