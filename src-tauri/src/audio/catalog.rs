//! Danh mục kênh âm thanh nền, danh sách nhạc lo-fi và các bộ mix mẫu.

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChannelKind {
    LoopFile(&'static str),
    BrownNoise,
    PinkNoise,
    WhiteNoise,
    LofiRadio,
}

#[derive(Debug, Clone, Copy)]
pub struct ChannelSpec {
    pub id: &'static str,
    pub name: &'static str,
    pub desc: &'static str,
    pub category: &'static str,
    pub art: &'static str,
    pub mix: f32,
    pub kind: ChannelKind,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LofiTrackSpec {
    pub id: &'static str,
    pub title: &'static str,
    pub artist: &'static str,
    pub file: &'static str,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PresetMixSpec {
    pub id: &'static str,
    pub name: &'static str,
    pub accent: &'static str,
    pub channels: &'static [(&'static str, f32)],
}

const fn ch(
    id: &'static str,
    name: &'static str,
    desc: &'static str,
    category: &'static str,
    art: &'static str,
    mix: f32,
    kind: ChannelKind,
) -> ChannelSpec {
    ChannelSpec {
        id,
        name,
        desc,
        category,
        art,
        mix,
        kind,
    }
}

pub const CHANNEL_SPECS: &[ChannelSpec] = &[
    // Mưa & Bão (8)
    ch(
        "rain",
        "Mưa nhẹ",
        "Hạt mưa rơi đều bên hiên",
        "rain",
        "rain",
        0.95,
        ChannelKind::LoopFile("rain.mp3"),
    ),
    ch(
        "heavy-rain",
        "Mưa rào",
        "Cơn mưa lớn rào rạt",
        "rain",
        "rain",
        0.90,
        ChannelKind::LoopFile("heavy-rain.mp3"),
    ),
    ch(
        "rain-tent",
        "Mưa trên lều",
        "Mưa gõ nhẹ lên mái vải",
        "rain",
        "rain-tent",
        0.95,
        ChannelKind::LoopFile("rain-tent.mp3"),
    ),
    ch(
        "rain-window",
        "Mưa cửa sổ",
        "Giọt mưa lăn trên kính",
        "rain",
        "rain-tent",
        0.90,
        ChannelKind::LoopFile("rain-window.mp3"),
    ),
    ch(
        "rain-leaves",
        "Mưa trên lá",
        "Mưa rơi xuyên tán cây",
        "rain",
        "crickets",
        0.90,
        ChannelKind::LoopFile("rain-leaves.mp3"),
    ),
    ch(
        "rain-car",
        "Mưa nóc xe",
        "Ngồi trong xe nghe mưa",
        "rain",
        "rain-tent",
        0.90,
        ChannelKind::LoopFile("rain-car.mp3"),
    ),
    ch(
        "rain-umbrella",
        "Mưa trên ô",
        "Tiếng mưa gõ nhịp trên dù",
        "rain",
        "rain",
        0.90,
        ChannelKind::LoopFile("rain-umbrella.mp3"),
    ),
    ch(
        "thunder",
        "Mưa giông",
        "Sấm rền từ xa qua màn mưa",
        "rain",
        "thunder",
        0.85,
        ChannelKind::LoopFile("thunder.mp3"),
    ),
    // Thiên nhiên (8)
    ch(
        "wind",
        "Gió qua cây",
        "Gió lùa qua tán lá rừng",
        "nature",
        "wind",
        0.80,
        ChannelKind::LoopFile("wind.mp3"),
    ),
    ch(
        "howling-wind",
        "Gió bão rít",
        "Gió đêm thổi mạnh ngoài hiên",
        "nature",
        "mountain",
        0.75,
        ChannelKind::LoopFile("howling-wind.mp3"),
    ),
    ch(
        "waves",
        "Sóng biển",
        "Sóng vỗ bờ cát chậm rãi",
        "nature",
        "waves",
        0.95,
        ChannelKind::LoopFile("waves.mp3"),
    ),
    ch(
        "river",
        "Suối chảy",
        "Dòng suối mát qua khe đá",
        "nature",
        "river",
        0.85,
        ChannelKind::LoopFile("river.mp3"),
    ),
    ch(
        "waterfall",
        "Thác nước",
        "Tiếng thác đổ êm ả từ xa",
        "nature",
        "mountain",
        0.80,
        ChannelKind::LoopFile("waterfall.mp3"),
    ),
    ch(
        "droplets",
        "Giọt nước",
        "Giọt sương rơi tí tách",
        "nature",
        "river",
        0.85,
        ChannelKind::LoopFile("droplets.mp3"),
    ),
    ch(
        "fire",
        "Lửa trại",
        "Củi cháy tí tách ấm áp",
        "nature",
        "fire",
        0.90,
        ChannelKind::LoopFile("fire.mp3"),
    ),
    ch(
        "jungle",
        "Rừng rậm",
        "Âm thanh đại ngàn xanh mát",
        "nature",
        "crickets",
        0.80,
        ChannelKind::LoopFile("jungle.mp3"),
    ),
    // Đêm & Sinh vật (6)
    ch(
        "crickets",
        "Dế kêu",
        "Đêm hè tĩnh mịch ngoài vườn",
        "animals",
        "crickets",
        0.75,
        ChannelKind::LoopFile("crickets.mp3"),
    ),
    ch(
        "frog",
        "Tiếng ếch đêm",
        "Ao làng sau cơn mưa",
        "animals",
        "river",
        0.75,
        ChannelKind::LoopFile("frog.mp3"),
    ),
    ch(
        "owl",
        "Chim cú đêm",
        "Tiếng cú vọng giữa rừng khuya",
        "animals",
        "crickets",
        0.70,
        ChannelKind::LoopFile("owl.mp3"),
    ),
    ch(
        "birds",
        "Chim rừng",
        "Tiếng chim hót buổi sớm",
        "animals",
        "wind",
        0.75,
        ChannelKind::LoopFile("birds.mp3"),
    ),
    ch(
        "cat",
        "Mèo rừ",
        "Tiếng mèo kêu rừ rừ êm tai",
        "animals",
        "cat",
        0.85,
        ChannelKind::LoopFile("cat.mp3"),
    ),
    ch(
        "whale",
        "Cá voi",
        "Tiếng ngân sâu dưới đại dương",
        "animals",
        "waves",
        0.75,
        ChannelKind::LoopFile("whale.mp3"),
    ),
    // Tiếng ồn & Sóng não (7)
    ch(
        "brown",
        "Tiếng ồn nâu",
        "Âm trầm ấm che tạp âm",
        "noise",
        "brown",
        0.85,
        ChannelKind::BrownNoise,
    ),
    ch(
        "pink",
        "Tiếng ồn hồng",
        "Cân bằng êm dịu cho giấc ngủ",
        "noise",
        "pink",
        0.75,
        ChannelKind::PinkNoise,
    ),
    ch(
        "white",
        "Tiếng ồn trắng",
        "Âm đều ổn định giúp tập trung",
        "noise",
        "pink",
        0.60,
        ChannelKind::WhiteNoise,
    ),
    ch(
        "binaural",
        "Sóng Delta",
        "Tần số 0.5–4 Hz ngủ sâu",
        "noise",
        "binaural",
        0.65,
        ChannelKind::LoopFile("binaural-delta.wav"),
    ),
    ch(
        "binaural-theta",
        "Sóng Theta",
        "Tần số 4–8 Hz thiền & mơ",
        "noise",
        "binaural",
        0.65,
        ChannelKind::LoopFile("binaural-theta.wav"),
    ),
    ch(
        "binaural-alpha",
        "Sóng Alpha",
        "Tần số 8–12 Hz thư giãn",
        "noise",
        "binaural",
        0.65,
        ChannelKind::LoopFile("binaural-alpha.wav"),
    ),
    ch(
        "fan",
        "Quạt trần",
        "Tiếng quạt quay đều quen thuộc",
        "noise",
        "brown",
        0.80,
        ChannelKind::LoopFile("fan.mp3"),
    ),
    // Không gian & Lo-Fi (7)
    ch(
        "lofi",
        "Nhạc Lo-Fi",
        "23 bản lo-fi CC0 êm dịu",
        "places",
        "lofi",
        0.90,
        ChannelKind::LofiRadio,
    ),
    ch(
        "train",
        "Tàu hoả",
        "Nhịp đường ray đều đặn",
        "places",
        "subway",
        0.85,
        ChannelKind::LoopFile("train.mp3"),
    ),
    ch(
        "airplane",
        "Khoang máy bay",
        "Âm ù đều trên tầng mây",
        "places",
        "mountain",
        0.80,
        ChannelKind::LoopFile("airplane.mp3"),
    ),
    ch(
        "cafe",
        "Quán cà phê",
        "Không gian quán nhỏ ấm cúng",
        "places",
        "lofi",
        0.80,
        ChannelKind::LoopFile("cafe.mp3"),
    ),
    ch(
        "library",
        "Thư viện",
        "Lật trang sách yên tĩnh",
        "places",
        "brown",
        0.80,
        ChannelKind::LoopFile("library.mp3"),
    ),
    ch(
        "wind-chimes",
        "Chuông gió",
        "Tiếng chuông nhẹ trong gió",
        "places",
        "binaural",
        0.75,
        ChannelKind::LoopFile("wind-chimes.mp3"),
    ),
    ch(
        "clock",
        "Đồng hồ",
        "Nhịp tích tắc chậm rãi",
        "places",
        "brown",
        0.70,
        ChannelKind::LoopFile("clock.mp3"),
    ),
];

const fn lofi(id: &'static str, title: &'static str, file: &'static str) -> LofiTrackSpec {
    LofiTrackSpec {
        id,
        title,
        artist: "Open Lo-Fi",
        file,
    }
}

pub const LOFI_TRACKS: &[LofiTrackSpec] = &[
    lofi("2-am-debug-loop", "2 AM Debug Loop", "lofi/2-am-debug-loop.mp3"),
    lofi(
        "a-taste-of-spring",
        "A Taste of Spring",
        "lofi/a-taste-of-spring.mp3",
    ),
    lofi(
        "after-school-rain",
        "After School Rain",
        "lofi/after-school-rain.mp3",
    ),
    lofi("amber-sidewalks", "Amber Sidewalks", "lofi/amber-sidewalks.mp3"),
    lofi(
        "autumn-on-the-window-glass",
        "Autumn on the Window Glass",
        "lofi/autumn-on-the-window-glass.mp3",
    ),
    lofi(
        "brushstrokes-and-rain",
        "Brushstrokes and Rain",
        "lofi/brushstrokes-and-rain.mp3",
    ),
    lofi(
        "chapter-by-lamplight",
        "Chapter By Lamplight",
        "lofi/chapter-by-lamplight.mp3",
    ),
    lofi(
        "coffee-ring-notebook",
        "Coffee Ring Notebook",
        "lofi/coffee-ring-notebook.mp3",
    ),
    lofi(
        "cursor-after-midnight",
        "Cursor After Midnight",
        "lofi/cursor-after-midnight.mp3",
    ),
    lofi("dog-eared-pages", "Dog Eared Pages", "lofi/dog-eared-pages.mp3"),
    lofi(
        "embers-after-midnight",
        "Embers After Midnight",
        "lofi/embers-after-midnight.mp3",
    ),
    lofi(
        "exhale-the-morning",
        "Exhale the Morning",
        "lofi/exhale-the-morning.mp3",
    ),
    lofi(
        "fallen-leaves-loop",
        "Fallen Leaves Loop",
        "lofi/fallen-leaves-loop.mp3",
    ),
    lofi("fireplace-loop", "Fireplace Loop", "lofi/fireplace-loop.mp3"),
    lofi(
        "first-coffee-thoughts",
        "First Coffee Thoughts",
        "lofi/first-coffee-thoughts.mp3",
    ),
    lofi(
        "mist-over-green-fields",
        "Mist Over Green Fields",
        "lofi/mist-over-green-fields.mp3",
    ),
    lofi("morning-pages", "Morning Pages", "lofi/morning-pages.mp3"),
    lofi(
        "petals-after-rain",
        "Petals After Rain",
        "lofi/petals-after-rain.mp3",
    ),
    lofi(
        "petals-in-the-breeze",
        "Petals in the Breeze",
        "lofi/petals-in-the-breeze.mp3",
    ),
    lofi(
        "snow-on-the-needle",
        "Snow on the Needle",
        "lofi/snow-on-the-needle.mp3",
    ),
    lofi(
        "starlight-in-the-sand",
        "Starlight in the Sand",
        "lofi/starlight-in-the-sand.mp3",
    ),
    lofi("terminal-rain", "Terminal Rain", "lofi/terminal-rain.mp3"),
    lofi(
        "winter-turntable",
        "Winter Turntable",
        "lofi/winter-turntable.mp3",
    ),
];

pub const PRESET_MIXES: &[PresetMixSpec] = &[
    PresetMixSpec {
        id: "rainy-night",
        name: "Đêm mưa rào",
        accent: "#7ba3e3",
        channels: &[("rain", 0.8), ("thunder", 0.45), ("brown", 0.35)],
    },
    PresetMixSpec {
        id: "summer-crickets",
        name: "Rừng đêm & Dế",
        accent: "#6ec99b",
        channels: &[("crickets", 0.7), ("wind", 0.5), ("river", 0.45)],
    },
    PresetMixSpec {
        id: "cozy-lofi",
        name: "Lo-Fi lò sưởi",
        accent: "#e3a76b",
        channels: &[("lofi", 0.75), ("fire", 0.55), ("rain-tent", 0.4)],
    },
    PresetMixSpec {
        id: "deep-sleep",
        name: "Ngủ sâu Delta",
        accent: "#a98ee3",
        channels: &[("binaural", 0.55), ("pink", 0.45), ("waves", 0.6)],
    },
];

pub fn find_channel(id: &str) -> Option<&'static ChannelSpec> {
    CHANNEL_SPECS.iter().find(|spec| spec.id == id)
}

pub fn find_preset_mix(id: &str) -> Option<&'static PresetMixSpec> {
    PRESET_MIXES.iter().find(|preset| preset.id == id)
}
