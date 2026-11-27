//! Bộ máy hẹn giờ: giữ một lần hẹn đang chạy, theo dõi điều kiện và các lịch lặp.
//!
//! Engine là logic thuần: nhận thời gian `now` và nguồn cảm biến từ bên ngoài, trả về
//! danh sách [`Event`] để tầng ứng dụng xử lý (mở cửa sổ cảnh báo, tắt máy…).
//! Nhờ vậy toàn bộ hành vi được kiểm thử mà không cần Tauri hay hệ thống thật.

mod view;

use crate::domain::{time, Action, Job, Phase, Trigger};
use crate::sensors::{Readings, SensorSource};
use crate::store::{new_id, HistoryEntry, Store};

pub use view::{JobView, NextRun, Snapshot};

/// Việc tầng ứng dụng cần làm sau mỗi thao tác.
#[derive(Debug, Clone, PartialEq)]
pub enum Event {
    /// Trạng thái thay đổi — gửi lại cho giao diện, cập nhật khay.
    Changed,
    /// Sắp đến giờ — mở cửa sổ cảnh báo.
    Warn(Job),
    /// Đóng cửa sổ cảnh báo.
    Unwarn,
    /// Đến giờ — thực hiện hành động rồi gọi [`Engine::finish`] với `entry_id`.
    Execute {
        job: Job,
        dry_run: bool,
        entry_id: String,
    },
}

/// Người dùng quay lại máy nếu rảnh dưới chừng này giây.
const BACK_AT_DESK_SECS: u64 = 3;
/// Đếm lùi sau điều kiện không bao giờ ngắn hơn chừng này.
const MIN_GRACE_SECS: u64 = 10;

pub struct Engine {
    job: Option<Job>,
    readings: Readings,
    busy: bool,
}

impl Engine {
    /// Khôi phục lần hẹn đã lưu (nếu còn hợp lệ) khi mở lại ứng dụng.
    pub fn restore(store: &mut Store, now: i64) -> Self {
        let job = store.data.job.take().and_then(|mut j| match j.phase {
            Phase::Countdown if !j.from_condition => (j.deadline.unwrap_or(0) > now + 5000).then(|| {
                j.warned = false;
                j
            }),
            _ => {
                j.phase = Phase::Watching;
                j.from_condition = false;
                j.deadline = None;
                j.satisfied_since = None;
                j.warned = false;
                Some(j)
            }
        });
        store.data.job = job.clone();
        Engine {
            job,
            readings: Readings::default(),
            busy: false,
        }
    }

    pub fn job(&self) -> Option<&Job> {
        self.job.as_ref()
    }

    pub fn readings(&self) -> &Readings {
        &self.readings
    }

    fn persist(&self, store: &mut Store) {
        store.data.job = self.job.clone();
        store.save().ok();
    }

    fn log(store: &mut Store, job: &Job, result: &str, note: Option<String>) -> String {
        let id = new_id();
        store.log(HistoryEntry {
            id: id.clone(),
            at: time::now_ms(),
            action: job.action,
            trigger: job.trigger.clone(),
            source: job.source.clone(),
            result: result.into(),
            note,
        });
        id
    }

    /// Bắt đầu một lần hẹn mới (thay lần đang chạy, nếu có).
    pub fn start(
        &mut self,
        store: &mut Store,
        action: Action,
        trigger: Trigger,
        source: &str,
        now: i64,
        sensors: &dyn SensorSource,
    ) -> Result<Vec<Event>, String> {
        let (phase, deadline) = match &trigger {
            Trigger::Countdown { seconds: 0 } => return Err("Thời gian phải lớn hơn 0".into()),
            Trigger::Countdown { seconds } => (Phase::Countdown, Some(now + *seconds as i64 * 1000)),
            Trigger::At { time } => (
                Phase::Countdown,
                Some(time::at_deadline(time, now).ok_or("Giờ không hợp lệ")?),
            ),
            Trigger::Battery { .. } if sensors.battery().is_none() => {
                return Err("Máy này không có pin".into())
            }
            Trigger::Process { name } if name.trim().is_empty() => return Err("Nhập tên ứng dụng".into()),
            Trigger::Process { name } if !sensors.is_running(name) => {
                return Err(format!("Tiến trình \"{}\" không hoạt động", name.trim()))
            }
            _ => (Phase::Watching, None),
        };
        let mut events = Vec::new();
        if let Some(old) = self.job.take() {
            Self::log(store, &old, "cancel", Some("Bị thay bằng hẹn mới".into()));
            events.push(Event::Unwarn);
        }
        self.job = Some(Job {
            id: new_id(),
            action,
            trigger,
            source: source.into(),
            started_at: now,
            phase,
            deadline,
            total_ms: deadline.map(|d| d - now),
            warned: false,
            satisfied_since: None,
            from_condition: false,
            need: 0,
        });
        self.persist(store);
        events.push(Event::Changed);
        Ok(events)
    }

    pub fn cancel(&mut self, store: &mut Store, reason: &str) -> Vec<Event> {
        let Some(job) = self.job.take() else { return vec![] };
        Self::log(store, &job, "cancel", Some(reason.into()));
        self.persist(store);
        vec![Event::Unwarn, Event::Changed]
    }

    /// Hoãn thêm `minutes` phút (chỉ khi đang đếm lùi).
    pub fn postpone(&mut self, store: &mut Store, minutes: i64, now: i64) -> Vec<Event> {
        let Some(job) = self.job.as_mut().filter(|j| j.phase == Phase::Countdown) else {
            return vec![];
        };
        let add = minutes * 60_000;
        job.deadline = Some(job.deadline.unwrap_or(now).max(now) + add);
        job.total_ms = Some(job.total_ms.unwrap_or(0) + add);
        job.warned = false;
        job.from_condition = false;
        self.persist(store);
        vec![Event::Unwarn, Event::Changed]
    }

    /// Thực hiện ngay, không chờ.
    pub fn execute_now(&mut self, store: &mut Store) -> Vec<Event> {
        self.take_for_execution(store)
    }

    fn take_for_execution(&mut self, store: &mut Store) -> Vec<Event> {
        if self.busy {
            return vec![];
        }
        let Some(job) = self.job.take() else { return vec![] };
        let dry_run = store.data.settings.dry_run;
        let entry_id = Self::log(store, &job, if dry_run { "dry" } else { "pending" }, None);
        self.busy = true;
        self.persist(store);
        vec![
            Event::Unwarn,
            Event::Execute {
                job,
                dry_run,
                entry_id,
            },
            Event::Changed,
        ]
    }

    /// Ghi kết quả sau khi tầng hệ thống đã thực hiện hành động.
    pub fn finish(&mut self, store: &mut Store, entry_id: &str, result: Result<bool, String>) {
        self.busy = false;
        if let Some(e) = store.data.history.iter_mut().find(|e| e.id == entry_id) {
            match result {
                Ok(true) => e.result = "dry".into(),
                Ok(false) => e.result = "done".into(),
                Err(msg) => {
                    e.result = "error".into();
                    e.note = Some(msg);
                }
            }
        }
        store.save().ok();
    }

    /// Nhịp mỗi giây: đọc cảm biến, cập nhật lần hẹn, kiểm tra lịch lặp.
    pub fn tick(&mut self, store: &mut Store, sensors: &mut dyn SensorSource, now: i64) -> Vec<Event> {
        self.readings = sensors.read();
        let mut events = Vec::new();
        if !self.busy {
            if let Some(phase) = self.job.as_ref().map(|j| j.phase) {
                match phase {
                    Phase::Watching => events.extend(self.watch(store, sensors, now)),
                    Phase::Countdown => events.extend(self.count_down(store, now)),
                }
            }
        }
        events.extend(self.check_schedules(store, now));
        events
    }

    fn count_down(&mut self, store: &mut Store, now: i64) -> Vec<Event> {
        let warn_ms = store.data.settings.warn_minutes as i64 * 60_000;
        let back_at_desk = self.readings.idle.is_some_and(|s| s < BACK_AT_DESK_SECS);
        let Some(job) = self.job.as_mut() else {
            return vec![];
        };

        // Hẹn "khi rảnh": người dùng quay lại thì trở về chờ.
        if job.from_condition && matches!(job.trigger, Trigger::Idle { .. }) && back_at_desk {
            job.phase = Phase::Watching;
            job.deadline = None;
            job.satisfied_since = None;
            job.warned = false;
            job.from_condition = false;
            self.persist(store);
            return vec![Event::Unwarn, Event::Changed];
        }

        let remaining = job.deadline.unwrap_or(now) - now;
        let mut events = Vec::new();
        let should_warn = job.from_condition || (warn_ms > 0 && remaining <= warn_ms);
        if !job.warned && should_warn {
            job.warned = true;
            events.push(Event::Warn(job.clone()));
        }
        if remaining <= 0 {
            events.extend(self.take_for_execution(store));
        }
        events
    }

    fn watch(&mut self, store: &mut Store, sensors: &dyn SensorSource, now: i64) -> Vec<Event> {
        let grace = store.data.settings.grace_seconds.max(MIN_GRACE_SECS) as i64 * 1000;
        let r = &mut self.readings;
        let Some(job) = self.job.as_mut() else {
            return vec![];
        };
        let (ok, need) = match &job.trigger {
            Trigger::Idle { minutes } => (r.idle.is_some_and(|s| s >= minutes * 60), 0),
            Trigger::Battery { percent } => (
                r.battery
                    .as_ref()
                    .is_some_and(|b| !b.charging && (b.percent as f64) <= *percent),
                5_000,
            ),
            Trigger::Net { kbps, minutes } => (r.net.is_some_and(|v| v < *kbps), *minutes as i64 * 60_000),
            Trigger::Cpu { percent, minutes } => {
                (r.cpu.is_some_and(|v| v < *percent), *minutes as i64 * 60_000)
            }
            Trigger::Process { name } => {
                let running = sensors.is_running(name);
                r.process = Some(running);
                (!running, 2_000)
            }
            Trigger::Countdown { .. } | Trigger::At { .. } => (false, 0),
        };
        job.need = need;
        if !ok {
            job.satisfied_since = None;
            return vec![];
        }
        let since = *job.satisfied_since.get_or_insert(now);
        if now - since < need {
            return vec![];
        }
        job.phase = Phase::Countdown;
        job.from_condition = true;
        job.deadline = Some(now + grace);
        job.total_ms = Some(grace);
        job.warned = false;
        self.persist(store);
        vec![Event::Changed]
    }

    fn check_schedules(&mut self, store: &mut Store, now: i64) -> Vec<Event> {
        let lead = store.data.settings.warn_minutes.max(1) as i64 * 60_000 + 2_000;
        let mut events = Vec::new();
        let mut dirty = false;
        for i in 0..store.data.schedules.len() {
            let sc = &store.data.schedules[i];
            if !sc.enabled {
                continue;
            }
            let Some(occ) = time::next_weekly(&sc.time, &sc.days, now - 1000) else {
                continue;
            };
            if occ - now > lead || sc.last_armed == occ {
                continue;
            }
            let (id, action, at) = (sc.id.clone(), sc.action, sc.time.clone());
            store.data.schedules[i].last_armed = occ;
            dirty = true;
            if self
                .job
                .as_ref()
                .is_some_and(|j| j.phase == Phase::Countdown && j.deadline.unwrap_or(i64::MAX) <= occ)
            {
                continue; // đã có hẹn sớm hơn
            }
            if self.job.is_some() {
                events.extend(self.cancel(store, "Bị thay bởi lịch lặp"));
            }
            self.job = Some(Job {
                id: new_id(),
                action,
                trigger: Trigger::At { time: at },
                source: format!("schedule:{id}"),
                started_at: now,
                phase: Phase::Countdown,
                deadline: Some(occ),
                total_ms: Some(occ - now),
                warned: false,
                satisfied_since: None,
                from_condition: false,
                need: 0,
            });
            self.persist(store);
            events.push(Event::Changed);
        }
        if dirty {
            store.save().ok();
        }
        events
    }

    /// Ảnh chụp trạng thái gửi cho giao diện mỗi giây.
    pub fn snapshot(&self, store: &Store, now: i64) -> Snapshot {
        Snapshot {
            job: self.job.as_ref().map(|j| JobView::new(j, now)),
            sensors: self.readings.clone(),
            next: store
                .data
                .schedules
                .iter()
                .map(|s| NextRun {
                    id: s.id.clone(),
                    at: if s.enabled {
                        time::next_weekly(&s.time, &s.days, now)
                    } else {
                        None
                    },
                })
                .collect(),
        }
    }
}

#[cfg(test)]
mod tests;
