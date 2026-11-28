# Third-party notices

Sleepy's source code is licensed under the MIT License (see [`LICENSE`](LICENSE)).
The app bundles the third-party assets listed below. They are not covered by Sleepy's
license and remain under their own terms. A per-file list is in
[`src-tauri/sounds/CREDITS.md`](src-tauri/sounds/CREDITS.md).

Rust and JavaScript dependencies are pulled in at build time under their own licenses
(see `src-tauri/Cargo.lock` and `package-lock.json`).

---

## Moodist: ambient sounds and binaural beats

- Source: https://github.com/remvze/moodist
- Files: the ambient and binaural files in `src-tauri/sounds/` (everything except `lofi/` and `CREDITS.md`)
- Sound licenses: according to Moodist's README, its sounds are under the
  **Pixabay Content License** (https://pixabay.com/service/license-summary/) or
  **CC0 1.0** (https://creativecommons.org/publicdomain/zero/1.0/). The Pixabay Content
  License allows free use, including commercial use, without attribution, but does not
  allow distributing the content on a standalone basis. These files are bundled for use
  inside Sleepy only.
- Moodist's code license, included because the files were taken from that repository:

```
MIT License

Copyright (c) 2023 MAZE

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Open Lo-Fi: music

- Source: https://github.com/btahir/open-lofi
- Files: `src-tauri/sounds/lofi/*.mp3` (23 tracks)
- License: **CC0 1.0 Universal** (https://creativecommons.org/publicdomain/zero/1.0/).
  No attribution required.

## lofi-music: sound card artwork

- Source: https://github.com/riccardobertolini/lofi-music
- Files: `ui/img/*.jpg`
- The repository is MIT-licensed (notice below). It does not state the original source or
  license of its images, so their provenance is unverified. They are planned to be replaced.

```
MIT License

Copyright (c) 2023 Riccardo Bertolini

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Be Vietnam Pro: font

- Source: https://github.com/bettergui/BeVietnamPro
- Files: `ui/fonts/be-vietnam-pro/`
- License: **SIL Open Font License 1.1**, Copyright 2021 The Be Vietnam Pro Project Authors.
  The full license text ships with the font at
  [`ui/fonts/be-vietnam-pro/LICENSE`](ui/fonts/be-vietnam-pro/LICENSE).
