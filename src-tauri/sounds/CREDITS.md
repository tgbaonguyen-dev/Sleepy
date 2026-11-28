# Sound and image credits

Sleepy's own code is MIT-licensed (see [`LICENSE`](../../LICENSE)). The assets below are
**not** covered by that license; each keeps its original license. Full notices are in
[`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md).

## Ambient sounds and binaural beats

Taken from **Moodist** ([remvze/moodist](https://github.com/remvze/moodist)). Moodist's
*code* is MIT (Copyright (c) 2023 MAZE). According to its README, its sounds come from
third-party providers under the **Pixabay Content License** or **CC0 1.0**. Moodist does
not publish which file uses which license, so each file below is under one of those two.

- Rain and storm: `rain.mp3`, `heavy-rain.mp3`, `rain-tent.mp3`, `rain-window.mp3`,
  `rain-leaves.mp3`, `rain-car.mp3`, `rain-umbrella.mp3`, `thunder.mp3`
- Nature: `wind.mp3`, `howling-wind.mp3`, `waves.mp3`, `river.mp3`, `waterfall.mp3`,
  `droplets.mp3`, `fire.mp3`, `jungle.mp3`
- Night and animals: `crickets.mp3`, `frog.mp3`, `owl.mp3`, `birds.mp3`, `cat.mp3`, `whale.mp3`
- Binaural and places: `binaural-delta.wav`, `binaural-theta.wav`, `binaural-alpha.wav`,
  `fan.mp3`, `wind-chimes.mp3`, `clock.mp3`, `train.mp3`, `airplane.mp3`, `cafe.mp3`,
  `library.mp3`

These files are bundled for use inside Sleepy only. Do not redistribute them on their own.

## Generated noise

Brown, pink and white noise are synthesized at runtime in
[`src-tauri/src/audio/decoder.rs`](../src/audio/decoder.rs) and are part of Sleepy's MIT code.

## Lo-Fi music

23 tracks in `src-tauri/sounds/lofi/` from **Open Lo-Fi**
([btahir/open-lofi](https://github.com/btahir/open-lofi)), released under
**CC0 1.0 Universal** (public domain dedication). No attribution is required; it is given
here as a courtesy. The author states the tracks were generated with Suno.

## Sound card artwork

The images in `ui/img/*.jpg` come from **lofi-music**
([riccardobertolini/lofi-music](https://github.com/riccardobertolini/lofi-music)), a
repository licensed under MIT (Copyright (c) 2023 Riccardo Bertolini). That repository does
not state where the images originally come from or under which license. They are kept for
now and are planned to be replaced with images under a clearly stated license.
