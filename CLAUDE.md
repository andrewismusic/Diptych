# Diptych

A browser synth where every parameter has an A value, a B value and a morph curve, and one slider morphs between them.

**Read `DESIGN.md` before changing anything.** It records every decision so far, including many deliberate rules (randomization biases, defaults, level calibrations) that look arbitrary without the history.

## Current state
- Source lives in `src/`; `python3 build.py` inlines it into `dist/diptych.html`, the complete single-file build, and also builds `dist/fm.html` (the standalone FM sketch, source in `src/fm/`) (HTML, CSS, JS, and the DSP engine that is stringified into an AudioWorklet). `python3 build.py --check` fails if `dist/` is stale. The build is plain Python 3 with no dependencies (this machine has no Node).
- Commit `dist/diptych.html` together with the `src/` change that produced it, so the repo always holds a publishable page.
- The architecture is fixed (`DESIGN.md` section 15, 2026-10-17): Wavetable 1, Wavetable 2, Sub, Sampler, one filter, and all seven effects in a fixed order; Level 0 or Mix 0 is off and costs no CPU. The product is aimed at a desktop plugin first, iOS later. A Basic view (tiles with key controls, a section overlay for the rest) and a Full view (2026-10-22). Next: global and side presets, side focus, midpoint capture (section 15, "Next").

## Tests
`npm test` rebuilds and runs the Playwright suite (`tests/`, about 15 s, see DESIGN.md section 11). Run it before every commit. `tests/helpers.js` opens the page with a seeded `Math.random` and installs `window.T`, an offline harness that renders a fresh `MorphEngine` (`T.render`, `T.flat`, `T.patch`, level and click measurements). Known deviations are `test.fail` entries; when a change fixes one, remove its marker. When adding a rule or a migration, add a test.

## Source layout
`src/index.html` is the page template (markup plus an ordered list of `@include` lines). The JS files are concatenated into **one classic `<script>`**, not ES modules: they share one global scope and run in the order the template lists them. Top-level code in a file can only use things defined in earlier files (function declarations hoist across all files). Keep that order in mind when moving code.

- `engine/`: `engine.js` (`MorphEngine`: voices, oscillators, the filter, effects and their idle rule, sequencer playback, rendering), `oscillators.js` (`WtBank`, `OscSub`, `OscSmp`), `fx-tone.js` (Drive, Formant), `fx-time.js` (Modulation, Delay, Reverb), `fx-color.js` (Lo-fi, OTT). These classes are stringified into the AudioWorklet (the list is `ENGINE_CLASSES` in `audio.js`; add new engine classes there), so they may refer to each other but to nothing else on the page.
- `params.js` (the fixed layout `OSC_KIND`/`FX_KIND`, DEFS registry, formatting, normalization, the `oi` index helper), `wavetables.js` (presets), `samples.js` (built-in samples, IndexedDB storage, file decoding), `state.js` (state, loading and migrations, save), `audio.js` (spectra, AudioContext and worklet startup, mobile unlock), `history.js` (undo, bulk updates), `randomize.js` (shaping rules), `main.js` (launch).
- `ui/`: knobs (builds the sections), displays (waves, filter/envelope/OTT pictures), morph slider, locks and links, wavetable editor (per Wavetable and side), section tools (dice, section locks, effect On/Off, Cut/Spill), sampler (sample menus), overlay (Basic / Full views, section overlays), layout (phone vs no-scroll desktop), keyboard.
- `sequencer/`: model (patterns, A/B sequence morph), transport (bottom pane, lanes, Walk/Swap), editor (controls, generators, random), piano-roll.
- `styles/`: CSS in cascade order; `desktop.css` holds the desktop layout (`body.desk`).
- `fm/`: the standalone FM sketch page (its own template, engine and UI).

## Working agreements
- The owner tests mainly on a phone, and the desktop layout is prioritized as a plugin: no scrolling. Check both for every change: phone layout (about 390 px wide, touch) and desktop (`tests/desktop.spec.js` checks 1280x720 to 2560x1200).
- No clicks or zipper noise: smooth anything that changes sound per sample, crossfade toggles.
- Keep effects level-matched to the dry sound, and measure it (see DESIGN.md section 11) rather than assuming.
- Continuous controls display as percentages or real units, not named modes.
- A is blue, B is pink, the morph color passes through purple.
- Keep saved patches loading: parameters are matched by `id`, and changes to defaults or lists need a migration step keyed on the saved `ver`.
- Keep a single-file build target so the synth can still be published as one HTML page.

## Suggested first steps in Claude Code
1. ~~Put `diptych.html` under git as the baseline.~~ Done (first commit).
2. ~~Split it into modules with a build step that outputs the single-file version.~~ Done: the build output matched the original byte for byte apart from banner comments, and rendered identical audio.
3. ~~Turn the checks in DESIGN.md section 11 into an automated test suite.~~ Done: `npm test`. It found the open items listed in DESIGN.md section 12.
4. ~~Then start the slot rebuild.~~ Done, then replaced by the fixed architecture (DESIGN.md section 15).
