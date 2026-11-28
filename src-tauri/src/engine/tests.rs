use super::*;
use crate::sensors::Battery;

/// Cảm biến giả, chỉnh tay từng giá trị.
#[derive(Default)]
struct Fake {
    r: Readings,
    running: Vec<String>,
    battery: Option<Battery>,
}

impl SensorSource for Fake {
    fn read(&mut self) -> Readings {
        self.r.clone()
    }
    fn is_running(&self, name: &str) -> bool {
        self.running.iter().any(|n| n == name)
    }
    fn battery(&self) -> Option<Battery> {
        self.battery.clone()
    }
    fn process_names(&self) -> Vec<String> {
        self.running.clone()
    }
}

fn setup() -> (Engine, Store, Fake) {
    let mut store = Store::in_memory();
    store.data.schedules.clear();
    store.data.settings.warn_minutes = 1;
    store.data.settings.grace_seconds = 30;
    (Engine::restore(&mut store, 0), store, Fake::default())
}

fn has_execute(ev: &[Event]) -> bool {
    ev.iter().any(|e| matches!(e, Event::Execute { .. }))
}

#[test]
fn rejects_zero_countdown() {
    let (mut e, mut s, f) = setup();
    let err = e
        .start(
            &mut s,
            Action::Shutdown,
            Trigger::Countdown { seconds: 0 },
            "manual",
            0,
            &f,
        )
        .unwrap_err();
    assert_eq!(err, "Thời gian phải lớn hơn 0");
}

#[test]
fn countdown_warns_then_executes() {
    let (mut e, mut s, mut f) = setup();
    let t0 = 1_000_000;
    e.start(
        &mut s,
        Action::Shutdown,
        Trigger::Countdown { seconds: 120 },
        "manual",
        t0,
        &f,
    )
    .unwrap();
    assert!(e.tick(&mut s, &mut f, t0 + 10_000).is_empty(), "chưa tới lúc báo");
    let ev = e.tick(&mut s, &mut f, t0 + 61_000);
    assert!(matches!(ev.as_slice(), [Event::Warn(_)]), "báo trước 1 phút");
    assert!(e.tick(&mut s, &mut f, t0 + 62_000).is_empty(), "chỉ báo một lần");
    let ev = e.tick(&mut s, &mut f, t0 + 120_000);
    assert!(has_execute(&ev));
    assert!(e.job().is_none());
    assert_eq!(s.data.history[0].result, "pending");
}

#[test]
fn finish_records_result() {
    let (mut e, mut s, mut f) = setup();
    e.start(
        &mut s,
        Action::Lock,
        Trigger::Countdown { seconds: 1 },
        "manual",
        0,
        &f,
    )
    .unwrap();
    let ev = e.tick(&mut s, &mut f, 1_000);
    let Some(Event::Execute { entry_id, .. }) = ev.iter().find(|x| matches!(x, Event::Execute { .. })) else {
        panic!("phải thực hiện")
    };
    e.finish(&mut s, entry_id, Err("không có quyền".into()));
    assert_eq!(s.data.history[0].result, "error");
    assert_eq!(s.data.history[0].note.as_deref(), Some("không có quyền"));
}

#[test]
fn dry_run_is_marked() {
    let (mut e, mut s, mut f) = setup();
    s.data.settings.dry_run = true;
    e.start(
        &mut s,
        Action::Shutdown,
        Trigger::Countdown { seconds: 1 },
        "manual",
        0,
        &f,
    )
    .unwrap();
    let ev = e.tick(&mut s, &mut f, 2_000);
    assert!(ev
        .iter()
        .any(|x| matches!(x, Event::Execute { dry_run: true, .. })));
    assert_eq!(s.data.history[0].result, "dry");
}

#[test]
fn postpone_extends_and_rearms_warning() {
    let (mut e, mut s, mut f) = setup();
    e.start(
        &mut s,
        Action::Shutdown,
        Trigger::Countdown { seconds: 60 },
        "manual",
        0,
        &f,
    )
    .unwrap();
    assert!(matches!(
        e.tick(&mut s, &mut f, 1_000).as_slice(),
        [Event::Warn(_)]
    ));
    e.postpone(&mut s, 15, 2_000);
    let j = e.job().unwrap();
    assert_eq!(j.deadline, Some(60_000 + 15 * 60_000));
    assert!(!j.warned);
}

#[test]
fn cancel_logs_reason() {
    let (mut e, mut s, f) = setup();
    e.start(
        &mut s,
        Action::Reboot,
        Trigger::Countdown { seconds: 60 },
        "manual",
        0,
        &f,
    )
    .unwrap();
    let ev = e.cancel(&mut s, "Đã huỷ");
    assert_eq!(ev, vec![Event::Unwarn, Event::Changed]);
    assert_eq!(s.data.history[0].result, "cancel");
    assert!(e.job().is_none() && s.data.job.is_none());
}

#[test]
fn replacing_a_job_logs_the_old_one() {
    let (mut e, mut s, f) = setup();
    e.start(
        &mut s,
        Action::Reboot,
        Trigger::Countdown { seconds: 60 },
        "manual",
        0,
        &f,
    )
    .unwrap();
    e.start(
        &mut s,
        Action::Lock,
        Trigger::Countdown { seconds: 60 },
        "manual",
        0,
        &f,
    )
    .unwrap();
    assert_eq!(s.data.history[0].note.as_deref(), Some("Bị thay bằng hẹn mới"));
    assert_eq!(e.job().unwrap().action, Action::Lock);
}

#[test]
fn net_condition_needs_to_hold_then_counts_down() {
    let (mut e, mut s, mut f) = setup();
    e.start(
        &mut s,
        Action::Shutdown,
        Trigger::Net {
            kbps: 50.0,
            minutes: 1,
        },
        "manual",
        0,
        &f,
    )
    .unwrap();
    f.r.net = Some(500.0);
    e.tick(&mut s, &mut f, 1_000);
    assert_eq!(e.job().unwrap().phase, Phase::Watching);
    f.r.net = Some(10.0);
    e.tick(&mut s, &mut f, 2_000);
    e.tick(&mut s, &mut f, 30_000);
    f.r.net = Some(400.0);
    e.tick(&mut s, &mut f, 40_000);
    assert_eq!(
        e.job().unwrap().satisfied_since,
        None,
        "mạng chạy lại thì đếm lại"
    );
    f.r.net = Some(10.0);
    e.tick(&mut s, &mut f, 50_000);
    e.tick(&mut s, &mut f, 110_000);
    let j = e.job().unwrap();
    assert_eq!(j.phase, Phase::Countdown);
    assert!(j.from_condition);
    assert_eq!(j.deadline, Some(110_000 + 30_000));
    let ev = e.tick(&mut s, &mut f, 111_000);
    assert!(
        matches!(ev.as_slice(), [Event::Warn(_)]),
        "báo ngay khi điều kiện thoả"
    );
}

#[test]
fn idle_returns_to_watching_when_user_comes_back() {
    let (mut e, mut s, mut f) = setup();
    e.start(
        &mut s,
        Action::Lock,
        Trigger::Idle { minutes: 10 },
        "manual",
        0,
        &f,
    )
    .unwrap();
    f.r.idle = Some(600);
    e.tick(&mut s, &mut f, 1_000);
    assert_eq!(e.job().unwrap().phase, Phase::Countdown);
    f.r.idle = Some(1);
    let ev = e.tick(&mut s, &mut f, 5_000);
    assert!(ev.contains(&Event::Unwarn));
    assert_eq!(e.job().unwrap().phase, Phase::Watching);
}

#[test]
fn process_condition() {
    let (mut e, mut s, mut f) = setup();
    let err = e.start(
        &mut s,
        Action::Shutdown,
        Trigger::Process { name: "obs".into() },
        "manual",
        0,
        &f,
    );
    assert_eq!(err.unwrap_err(), "Tiến trình \"obs\" không hoạt động");
    f.running.push("obs".into());
    e.start(
        &mut s,
        Action::Shutdown,
        Trigger::Process { name: "obs".into() },
        "manual",
        0,
        &f,
    )
    .unwrap();
    e.tick(&mut s, &mut f, 1_000);
    assert_eq!(e.job().unwrap().phase, Phase::Watching);
    f.running.clear();
    e.tick(&mut s, &mut f, 2_000);
    e.tick(&mut s, &mut f, 4_500);
    assert_eq!(e.job().unwrap().phase, Phase::Countdown);
}

#[test]
fn battery_requires_a_battery() {
    let (mut e, mut s, f) = setup();
    let err = e.start(
        &mut s,
        Action::Hibernate,
        Trigger::Battery { percent: 15.0 },
        "manual",
        0,
        &f,
    );
    assert_eq!(err.unwrap_err(), "Máy này không có pin");
}

#[test]
fn schedule_arms_once() {
    let (mut e, mut s, mut f) = setup();
    let now = time::now_ms();
    let in_a_minute = crate::domain::format::hhmm(now + 61_000);
    s.data.schedules.push(crate::store::Schedule {
        id: "s1".into(),
        time: in_a_minute.clone(),
        days: (0..7).collect(),
        action: Action::Suspend,
        enabled: true,
        last_armed: 0,
    });
    e.tick(&mut s, &mut f, now);
    let j = e.job().expect("lịch phải được lên");
    assert_eq!(j.source, "schedule:s1");
    assert_eq!(j.trigger, Trigger::At { time: in_a_minute });
    e.cancel(&mut s, "Đã huỷ");
    e.tick(&mut s, &mut f, now + 1_000);
    assert!(e.job().is_none(), "huỷ rồi thì không lên lại lần đó");
}

#[test]
fn restore_drops_expired_and_resets_conditions() {
    let mut s = Store::in_memory();
    let (mut e, f) = (
        Engine::restore(&mut s, 0),
        Fake {
            battery: None,
            ..Default::default()
        },
    );
    e.start(
        &mut s,
        Action::Shutdown,
        Trigger::Countdown { seconds: 10 },
        "manual",
        0,
        &f,
    )
    .unwrap();
    let e2 = Engine::restore(&mut s, 60_000);
    assert!(e2.job().is_none(), "hết hạn thì bỏ");

    let mut e = Engine::restore(&mut s, 0);
    e.start(
        &mut s,
        Action::Shutdown,
        Trigger::Cpu {
            percent: 10.0,
            minutes: 1,
        },
        "manual",
        0,
        &f,
    )
    .unwrap();
    let e3 = Engine::restore(&mut s, 5_000);
    assert_eq!(e3.job().unwrap().phase, Phase::Watching);
}
