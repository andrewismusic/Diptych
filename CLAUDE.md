# Diptych

A browser synth where every parameter has an A value, a B value and a morph curve, and one slider morphs between them.

**Read `DESIGN.md` before changing anything.** It records every decision so far, including many deliberate rules (randomization biases, defaults, level calibrations) that look arbitrary without the history.

## Current state
- `diptych.html` is the complete working build: one self-contained file (HTML, CSS, JS, and the DSP engine that is stringified into an AudioWorklet).
- Next task: the assignable-slot rebuild described in `DESIGN.md` section 13 (4 oscillator slots with Wavetable / FM / Physical / Sampler / Sub engines, two shared filters, 4 FX slots with OTT as an ordinary effect).

## Working agreements
- The owner tests mainly on a phone. Check mobile layout (about 390 px wide) and touch interaction for every change.
- No clicks or zipper noise: smooth anything that changes sound per sample, crossfade toggles.
- Keep effects level-matched to the dry sound, and measure it (see DESIGN.md section 11) rather than assuming.
- Continuous controls display as percentages or real units, not named modes.
- A is blue, B is pink, the morph color passes through purple.
- Keep saved patches loading: parameters are matched by `id`, and changes to defaults or lists need a migration step keyed on the saved `ver`.
- Keep a single-file build target so the synth can still be published as one HTML page.

## Suggested first steps in Claude Code
1. Put `diptych.html` under git as the baseline.
2. Split it into modules (engine, voices, effects, sequencer, UI, randomization, persistence) with a small build step that outputs the single-file version, and confirm the output behaves identically.
3. Turn the checks in DESIGN.md section 11 into an automated test suite (Playwright + headless Chromium).
4. Then start the slot rebuild.
