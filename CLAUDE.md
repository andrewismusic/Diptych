# Diptych

A browser synth where every parameter has an A value, a B value and a morph curve, and one slider morphs between them.

**Read `DESIGN.md` before changing anything.** It records every decision so far, including many deliberate rules (randomization biases, defaults, level calibrations) that look arbitrary without the history.

## Current state
- Source lives in `src/`; `python3 build.py` inlines it into `dist/diptych.html`, the complete single-file build (HTML, CSS, JS, and the DSP engine that is stringified into an AudioWorklet). `python3 build.py --check` fails if `dist/` is stale. The build is plain Python 3 with no dependencies (this machine has no Node).
- Commit `dist/diptych.html` together with the `src/` change that produced it, so the repo always holds a publishable page.
- Next task: the assignable-slot rebuild described in `DESIGN.md` section 13 (4 oscillator slots with Wavetable / FM / Physical / Sampler / Sub engines, two shared filters, 4 FX slots with OTT as an ordinary effect).

## Source layout
`src/index.html` is the page template (markup plus an ordered list of `@include` lines). The JS files are concatenated into **one classic `<script>`**, not ES modules: they share one global scope and run in the order the template lists them. Top-level code in a file can only use things defined in earlier files (function declarations hoist across all files). Keep that order in mind when moving code.

- `engine/engine.js`: `MorphEngine`, all DSP (voices, sequencer playback, effects, rendering). Its source is stringified into the AudioWorklet, so it must not reference anything outside the class.
- `params.js` (DEFS registry, formatting, normalization), `wavetables.js` (presets), `state.js` (state, loading and migrations, save), `audio.js` (spectra, AudioContext and worklet startup, mobile unlock), `history.js` (undo, bulk updates), `randomize.js` (shaping rules), `main.js` (launch).
- `ui/`: knobs, displays (waves, filter/envelope/OTT pictures), morph slider, locks and links, wavetable editor, section tools (dice, section locks, effect switches, Cut/Spill), keyboard.
- `sequencer/`: model (patterns, A/B sequence morph), transport (bottom pane, lanes, Walk/Swap), editor (controls, generators, random), piano-roll.
- `styles/`: CSS in cascade order.

## Working agreements
- The owner tests mainly on a phone. Check mobile layout (about 390 px wide) and touch interaction for every change.
- No clicks or zipper noise: smooth anything that changes sound per sample, crossfade toggles.
- Keep effects level-matched to the dry sound, and measure it (see DESIGN.md section 11) rather than assuming.
- Continuous controls display as percentages or real units, not named modes.
- A is blue, B is pink, the morph color passes through purple.
- Keep saved patches loading: parameters are matched by `id`, and changes to defaults or lists need a migration step keyed on the saved `ver`.
- Keep a single-file build target so the synth can still be published as one HTML page.

## Suggested first steps in Claude Code
1. ~~Put `diptych.html` under git as the baseline.~~ Done (first commit).
2. ~~Split it into modules with a build step that outputs the single-file version.~~ Done: the build output matched the original byte for byte apart from banner comments, and rendered identical audio.
3. Turn the checks in DESIGN.md section 11 into an automated test suite (Playwright + headless Chromium).
4. Then start the slot rebuild.
