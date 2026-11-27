use serde::Serialize;

use crate::domain::Job;
use crate::sensors::Readings;

/// Lần hẹn kèm các giá trị tính sẵn cho giao diện.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobView {
    #[serde(flatten)]
    pub job: Job,
    pub remaining: Option<i64>,
    pub satisfied_ms: i64,
}

impl JobView {
    pub fn new(job: &Job, now: i64) -> Self {
        JobView {
            job: job.clone(),
            remaining: job.remaining(now),
            satisfied_ms: job.satisfied_since.map(|s| now - s).unwrap_or(0),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct NextRun {
    pub id: String,
    pub at: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Snapshot {
    pub job: Option<JobView>,
    pub sensors: Readings,
    pub next: Vec<NextRun>,
}
