# Diptych: design document

Diptych is a browser synthesizer built around one idea: **every sound has two complete settings, A and B, and a single morph slider moves between them.** It is not two instruments side by side. It is one instrument whose every parameter holds two values plus a curve describing how it travels between them.

This document records every decision made while building the current version (built from `src/` into `dist/diptych.html`), so development can continue in Claude Code without losing anything. Where a decision came from a specific request, the reason is noted, because many "odd" rules are deliberate.

The owner tests mostly on a phone. Mobile behavior is a first-class concern.

---

## 1. Principles the owner cares about

- **Morphing is the point.** Anything that can morph should. Things that cannot truly morph (engine types, effect types) are shared by both sides, and A/B morph everything inside them.
- **No clicks, zipper noise or jumps.** Every setting that changes sound is smoothed per sample where stepping would be audible. Toggles crossfade (about 15 ms). Delay times, filter sweeps and tap gains glide.
- **Levels stay steady.** Turning an effect up should change its character, not the volume. Effects are level-compensated and this is measured, not assumed.
- **Randomization should surprise but stay usable.** The main randomize buttons follow shaping rules (Section 9). The section dice deliberately ignore most of those rules for more extreme results.
- **Continuous controls read as percentages**, not named modes (filter Mode is "25%", not "LP/BP").
- **Visual language:** A is vibrant blue, B is hot pink, and the morph passes through purple (OKLCH interpolation). Knob fills, the slider thumb, the live wave, the live filter/envelope lines and the "Now" sequence lane all take the current morph color.
- **Design originality.** The knob concept (A/B handles on the ring, curve in the center, live dot) was inspired by a commercial plugin, but the owner asked for it; the implementation and look are our own. Do not copy other products' visual designs.

---

## 2. Architecture (current build)

Published as a single self-contained HTML file (a Claude artifact). The source is split into files under `src/` and `build.py` inlines them back into `dist/diptych.html` (see CLAUDE.md for the layout).

- **DSP engine:** one JavaScript class, `MorphEngine`, containing all audio code and the maths shared with the UI (`denorm`, `bend`, `fft`, `analyze`, `interp`, `frameAt`, `synth`, `seqEval`, and so on).
- **Audio thread:** the class source is stringified and loaded into an **AudioWorklet** via a Blob URL (falls back to a `data:` URL, then to a main-thread `ScriptProcessorNode` "compatibility mode"). The page's content-security policy is why modules can't be loaded from files.
- **Messages** from UI to engine: `state` (A, B, C arrays and morph), `param`, `curve`, `morph`, `table`, `blend`, `on`, `off`, `panic`, `mono`, `seq`, `seqPlay`, `bpm`, `walk`, `dlmode`, `bypass`.
- **Reports** from engine to UI: a queue (`reports`) drained every render block: `pos` (sequencer playhead) and `ott` (band levels and gains).
- **Rendering:** 16-sample sub-blocks. Each sub-block: resolve parameters, run the sequencer, rebuild wavetables if needed, render voices, run the effects chain. A final `tanh` soft clip protects the output.
- **Audio unlock (mobile):** every `pointerdown`, `pointerup`, `touchstart`, `touchend`, `mousedown`, `click` and `keydown` tries to create/resume the AudioContext, and plays a one-sample silent buffer. `navigator.audioSession.type = 'playback'` lets iPhones play with the ringer switch on silent. The top-right button shows "Tap to start audio" whenever the context isn't running.
- **CPU:** measured at roughly 10 to 17% of one desktop core with 8 notes and effects on.

### Suggested structure for Claude Code
Split into modules (engine core, voices, effects, sequencer, UI knobs, editors, randomization, persistence), keeping a build step that bundles the engine into a single string for the AudioWorklet (or use a real worklet module file when hosted outside the artifact sandbox). Keep a single-file build target so it can still be published as an artifact.

Status: the UI side is split by feature. The engine is still one `MorphEngine` class in `src/engine/engine.js` (the worklet stringifies that one class, and `fx()` is a single 350-line method), so splitting voices and effects into separate units is left for the slot rebuild, where the FX slots need each effect as its own unit anyway.

---

## 3. The morph system

- Every parameter is stored **normalized (0 to 1)** in `state.A[i]` and `state.B[i]`, plus a curve `state.C[i]` from -1 to 1.
- Parameters are defined once in a registry, `DEFS`, with `id`, `label`, `group`, `min`, `max`, `curve` (`lin`, `log`, `int`, `pow2`), defaults `a` and `b`, and optional `single` ('A' or 'B': belongs to one side only, never morphs).
- **Resolved value** = `lerp(A, B, bend(morph, C))`, where `bend(m, c) = m ^ (6 ^ -c)`. Positive c moves early, negative moves late. Because values are normalized, log parameters (cutoff, times) morph evenly by ear.
- **Stepped parameters** (`int`: Octave, delay Time) interpolate then round, so they walk through every value between A and B. A `snap` option (flip at 50%) exists for things that truly can't step.
- The engine resolves every 16 samples and smooths continuous values (coefficient 0.08 per block). Stepped values change immediately.

### Knobs
- One knob per parameter. Ring: 270° sweep. **Blue handle = A value, pink handle = B value.** Drag a handle (relative vertical/horizontal drag). Double-tap resets.
- **Stacked handles:** grabbing on the lower (counter-clockwise) side takes A, the upper side takes B. At the very start of the ring take B; at the very end take A.
- **Center:** drag to set the morph curve; a tiny graph shows it (a staircase for stepped parameters), with a dot at the current morph position.
- **Live dot** on the ring shows the value you hear. The filled arc between the handles is a single solid color: the current morph color.
- Readouts: current value large; A and B values below in their colors.
- Keyboard: each handle and the center are focusable sliders (arrows, Shift for big steps, Home/End, Delete resets).

### Lock and link (two icons under every knob)
- **Padlock:** randomize skips this parameter.
- **Chain (link):** A and B share one value; the knob shows one dark handle and the whole knob drags it; no curve. Linking snaps both sides to the value currently heard. **Unlinking restores each side's previous value** (stored in `state.linkMem`), so you can audition linked vs unlinked.
- Position A and Position B have only a padlock (they are single-side by nature).
- Defaults: **locked** Level, Pan, Pattern, OTT Depth, OTT Output. **Linked** Octave, Fine tune, OTT Depth, OTT Output.

### Section headings
Every section heading has: **blue dice** (randomize side A of this section), **pink dice** (side B), **plain dice** (both sides, including linked knobs), a **section padlock**, and on effects an **On/Off** bypass switch.
- Section locks sit on top of individual locks; unlocking a section restores each knob's own lock state.
- Section dice use **raw** randomization (Section 9).
- Effect On/Off bypasses for both sides without touching settings (15 ms crossfade); the section's knobs dim.

---

## 4. Wavetables and the oscillator

- **Each side has its own wavetable**: up to 16 keyframes of 2048 samples. **Position A** reads table A, **Position B** reads table B. Positions never morph (they are for modulation later).
- **Wave** (morphing knob, default A 0% to B 100%) sets how much of B's shape is heard; its curve shapes the sweep. The morph strictly interpolates between the two *current* shapes.
- **Blend:** the "full" hybrid. Direct crossfade of the complex spectra, then each harmonic's magnitude restored to the interpolated magnitude (gain capped at 3×, so true cancellations still dip). Earlier "pure spectral" phase interpolation caused jumps and was replaced; the Spectral/Direct toggle was removed.
- **Band-limiting:** frames are analyzed into 512 harmonics. The engine synthesizes 10 mipmap levels (level k keeps harmonics up to 512 >> k), rebuilt at most every 512 samples with a crossfade.
- **Wavetable editor** (full screen, bottom panel stays visible so you can play while drawing): preset tables (Basic shapes, Pulse width, Harmonic stack, Sync sweep, Vowel formants, Sine), load file (single-cycle, or multi-frame files of 2048-sample frames), frames strip (add/delete), tools Draw / Line / Harmonics (first 32 partials, frame always normalized), Smooth, Normalize, Invert, Reset to sine.
- **Unison** is one knob (0 to 100%): center voice always plays; three detuned pairs fade in one after another; detune spread grows with the amount (up to ±50 cents); stereo spread; power-normalized.
- **Glide**, **Octave** (stepped, linked by default), **Fine tune** (linked by default).
- **Vibrato:** Vibrato (depth up to 1 semitone), Fade in, Vib rate, **Rate fade** (in Hz, ±10: the rate starts that far off) and **Rate settle** (time for the rate to settle, its own control).
- **Voices:** 8, oldest stolen. **Mono/Poly** toggle (on both the keyboard and sequencer bars; label shows the current mode). Mono is last-note priority with legato fallback to held keys. Unison and the modulation effect are unaffected.

## 5. Filter and envelopes

- **Filter:** TPT state-variable filter. **Mode** morphs continuously: 0% low-pass, 50% band-pass, 100% high-pass. Cutoff 30 Hz to 18 kHz, Resonance, **Env amount** (±5 octaves), **Key track** (around middle C).
- **Filter envelope** and **Amp envelope:** ADSR each (linear attack, exponential decay/release). Every stage morphs.
- Visualizers: filter response and both envelopes show A (thin blue), B (thin pink) and the current shape (thick, morph color). Envelope graphs share one time scale with a fixed-length sustain section.

---

## 6. Effects (current fixed chain)

Order: Drive, Formant filter, Modulation, Delay, Reverb, Lo-fi, OTT. Every unit always runs; Mix at 0% means off; each has an On/Off bypass. All are level-matched to the dry signal (verified by measurement).

- **Drive:** 4× oversampled (33-tap linear-phase filter; the dry path is delayed 8 samples to match). Calibrated to the synth's nominal level so it warms up from low settings. Gain `0.5 × 32^drive`, loudness compensation `1 / tanh(g) / (1 + 3.5 × drive^1.5)`. **Shape:** warm asymmetric tanh (even harmonics) → firmer rounded knee → sine wavefold. A high cut deepens with drive; DC blocker.
- **Formant filter:** three band-pass resonances per channel; **Vowel** sweeps A-E-I-O-U; **Shift** ±12 semitones; Resonance; Mix. Makeup gain scales with Q.
- **Modulation:** **Type** 0% chorus → 50% flanger → 100% phaser. Chorus to flanger is a true transformation of one modulated delay line (3 taps, longer delay → 1 tap, short delay with feedback; outer tap fades first, then middle, like unison in reverse). Flanger to phaser crossfades with a parallel 6-stage all-pass phaser. Every internal setting is smoothed per sample (block-rate stepping caused zipper noise and phaser crackles). Phaser feedback is soft-limited. Full Mix = equal dry and wet.
- **Delay:** tempo-synced **Time** (12 divisions: 1/32, 1/16T, 1/16, 1/8T, 1/16D, 1/8, 1/4T, 1/8D, 1/4, 1/4D, 1/2, 1/2D). **All 12 divisions run in parallel**, each with its own feedback. **Time changes: Cut / Spill** switch: Cut feeds every division and crossfades (about 12 ms) to the selected one's output; Spill feeds only the selected division and hears all of them, so old tails ring out. **Tone** is a tilt: below 50% darkens (low-pass down to 400 Hz), above 50% thins (high-pass up to 2 kHz), applied to the echoes and every repeat. Ping-pong, Feedback (soft-limited), Mix.
- **Reverb:** 4 all-pass diffusers into an 8-line feedback delay network (Householder mixing). Size (line lengths glide), Decay, Damping, Mix.
- **Lo-fi:** Wow (slow, drifting, up to 8 ms), Flutter (7.3 and 11.9 Hz, up to 0.8 ms; both rates wander), **Character** (tape-style asymmetric drive that also creates intermodulation, a 100 Hz bump and a high rolloff down to about 3.6 kHz, level-compensated), **Dropouts** (dips to 15 to 50% for 40 to 290 ms, dulled, never silent), **Codec** (512-point STFT MP3-style damage: spectral holes with flickering "birdies", band-limiting, coarse levels; amount curve front-loaded; about 11 ms latency only while engaged), **Noise** (0% dark hiss → 35% bright hiss → 60% crackle, crackle density growing steadily from sparse to 2× at 100%), **Noise mix** (even loudness steps across the knob). Hiss sits below crackle in level.
- **OTT:** three bands (Low split 40 to 500 Hz, High split 600 Hz to 10 kHz) that always sum back to the input. Each band is pulled toward a target level: downward (ratio 10) and upward (ratio 3, capped, gated below about -80 dB). Depth scales it 1.5× (with makeup), total gain capped at +24 dB. Gain drops are instant, rises ease in, and the audio runs **1.5 ms behind the detector** so notes after a gap don't spike. **Level matching** (300 ms average, ±12 dB) keeps overall loudness steady across Depth. Upward and Downward are fixed at 100% and hidden. Band gains ±12 dB, Time, Output. **Visualizer:** split points, band gain settings as static fills (nearly empty at -12 dB, full at +12 dB) and live input level as outlines. Measured: at default Depth 13% peak change under 0.5 dB; at full depth about +5 dB peaks with steady average level.

---

## 7. The sequencer

Bottom panel switch **Keys / Seq** (sliding panes; the launch view is Seq; tapping Seq starts playback). Sequencer mode: transport (Mono/Poly, Play/Stop icon button that breathes between about 70% and 145% brightness while playing, tempo knob 50 to 200 bpm), the **Pattern** knob (locked by default, A 0% to B 100%), a **Walk / Swap** switch right beside it, three mini lanes (A, Now, B) with playhead, and **Edit sequences**.

### Pattern model
- A pattern is always **n16 sixteenth-note steps** long (1 to 32, default 16).
- **Rate** lays notes over that grid: 1/4, 1/4 dotted, 1/8, 1/8 dotted, 1/16, **Mixed**. A dotted-8th pattern of 16 steps has notes at 0, 3, 6, 9, 12 and 15 sixteenths; the last is cut short at the end. Mixed gives every note slot its own length (pool leaning short: 1/16, 1/8, 1/8 dotted, 1/4, 1/4 dotted). Triplet, 1/32 and dotted 1/16 were removed deliberately.
- `s.steps` holds one entry per note slot: `on`, `note` (MIDI), `len` (in slots), `vel`, `dur` (Mixed only). Changing rate or step count rebuilds slots, keeping whichever note was sounding at each new slot's start.
- **Scale is shared by both sides** (root and type, in a "Both sides" box at the top of the editor). Changing it snaps notes into the scale. Scales: Major, Natural minor, Dorian, Phrygian, Lydian, Mixolydian, Harmonic minor, Major pentatonic, Minor pentatonic, Blues, Whole tone, Chromatic.
- **Monophonic sequences:** notes never overlap; a note is cut where the next one starts. Poly mode only lets release tails overlap.
- **Density** (per side, default 100%): notes are taken in order from a start point (`rot`) and ranked by the golden-ratio sequence (`k × 0.618 + dseed`, wrapped). Thinning is evenly spread but never periodic, so it doesn't strip whole pitches from arpeggios; the same notes return as density rises. `rot` moves with **Shift** (←/→ rotate one slot), so shifting keeps the same notes active. Thinned notes show as outlines in the piano roll.

### A/B sequence morph (deterministic)
- Both patterns sit on a shared tick grid (48 ticks per quarter). Both are the same length now (n16 is per side but the loop is the least common multiple if they differ).
- Where both sides start a note at the same tick, it morphs: **Walk** blends pitch through the scale notes in between (quantized to the morphing scale); **Swap** jumps from A's note to B's at a fixed switch point. Velocity and length blend.
- Where only one side starts a note, it drops in or out at a **fixed switch point**. Switch points are spread through the loop in bit-reversed order (ordered dithering), so every Pattern value always gives exactly the same sequence, with no randomness at playback.
- Verified: at exactly 100% the live sequence matches B note for note (400 random checks).

### Editor (full screen, bottom panel visible)
- Top "Both sides" box: Scale.
- Side A / Side B tabs, then a box bordered in that side's color: Rate, Steps (sixteenths), Density, Shift, Generator (Arp or Riff) with its controls and Generate, and Random buttons: Notes, Velocity, Rate, Generator, All.
- **Arp:** chords Triad, Seventh, Sus, Random 2, Random 3, Random 4 (pick that many scale notes at generate time); orders Up, Down, Up-down, Down-up, Converge, Random; 1 to 3 octaves.
- **Riff:** styles **Motif** (motif, repeat, varied, answered over four cells), **Pedal** (repeated low root with jumps above), **Cells** (3+3+2 style groupings, each group starting a new note); Range 1 to 2 octaves; **Syncopation** pushes onsets off the beat. 95% of riffs start on the very first beat.
- Generated notes above E5 drop an octave. If Octave is above 0 on either side, generated patterns stay within 2 octaves.
- Piano roll: rows limited to the scale; sixteenth grid with beats and bars; tap empty cell to add (drag to paint), tap note to remove, drag sideways to change length. Velocity lane below. Clear, Copy to other side.

---

## 8. Layout and interaction

- Header (scrolls away): title, audio button, Copy A to B / Copy B to A / Swap. **Copy covers the sound only**; sequences and the Pattern knob stay. Swap exchanges everything including sequences.
- Randomize bar: **Randomize sound: A / Linked / All / B** and **Randomize sequence: A / Both / B**, plus **Undo** (30 levels; covers randomize, copy, swap, reset, link toggles, sequence edits).
- Wavetables section (cards for A, the live blend, B; Position A / Wave / Position B knobs underneath), then Oscillator, Filter, Filter envelope, Amp envelope, Output, effects.
- **Four knobs per row maximum**; visualizers match that width.
- **Bottom panel (always visible, sticky):** morph slider (thumb filled with the morph color), then Keys/Seq bar, then the keyboard or sequencer pane (both panes the same height).
- Keyboard: one octave plus a note, octave shift, Latch, Mono/Poly; computer keys A to K, Z/X octave; space plays/stops in sequencer mode.
- Font: Barlow Semi Condensed. Light and dark themes with violet-tinted neutrals.

---

## 9. Randomization rules

### Main buttons (shaped)
- Values come from per-parameter functions (`RND`), in musically useful ranges.
- **15% rule:** a side's new value lands at least 15% of the knob's throw away from the other side's, so morphs are dramatic. Exempt: Noise mix, OTT band gains, Formant/Modulation/Delay/Reverb mixes, Wow, Flutter, Codec, Dropouts (their chance of landing at zero matters more).
- **Effect mixes:** Formant mix is 0 in 66% of generations; Modulation, Delay and Reverb mixes are 0 in 40%. Delay mix mostly 0 to 35%, rarely above 50%. Reverb mix mostly 0 to 35%. Across Formant, Modulation, Delay and Reverb: at most two above 50%, at most one above 90%.
- **Other effects:** full range (Drive, shapes, rates, times, sizes). Delay Cut/Spill is randomized 50/50 by Randomize all and the Delay dice.
- **Lo-fi:** Wow, Flutter and Codec at minimum in 66% of generations; Dropouts in 90%; otherwise leaning low (squared). Character leans low. Noise mix mostly 0 to 15%, never above 35%.
- **OTT:** band gains within ±3 dB with a mix of boosts and cuts on each side; Low split 40 to 500 Hz, High split 600 Hz to 10 kHz.
- **Oscillator:** Octave 0 about 70% of the time (else ±1); Fine 0 about 70%; Unison off 40%; **Glide 0 in 50% of generations, under 100 ms in 95%**; Vibrato depth within ±30 cents about 85% of the time; Rate fade 0 half the time.
- **Filter/envelopes:** cutoff 150 Hz to 12 kHz; resonance leans low; Mode pure low-pass half the time; Env amount usually positive; attacks lean short; amp sustain 20% or more.
- **Sine guard:** if a side's wave is nearly a pure sine, its cutoff moves to the open end (above about 1 kHz for low-pass modes, below about 280 Hz for high-pass modes) so it can't go silent.
- Wave and Pattern usually sit at their ends; each side's wavetable is replaced by a random built-in table unless the Wavetables section is locked.
- **Randomize linked:** only unlocked linked knobs, one new value shared by both sides.

### Section dice (raw)
Anywhere in each knob's full range, no shaping rules, locks still respected. Exception in the Lo-fi section: Noise mix, Codec and Dropouts stay under 30% about 80% of the time; Wow and Flutter under 40%.

### Sequences
- Main-page sequence dice and launch: new rate, new generator settings (Arp or Riff), rhythm variation, velocity, and density leaning high (never below 30%). "Both" also picks a new shared scale.
- Editor Random: Notes (melody in scale), Velocity (fully random 5 to 100%), Rate, Generator, All (rate, generator, rhythm, velocity, density 30% or more).

### Launch
Every launch: Randomize all, new sequences (16 steps), tempo 85 to 135 bpm. **Undo restores the previous session's patch.**

---

## 10. Persistence

- `localStorage` key `diptych-v3`, with `ver` (currently 8) and `ids` (parameters are matched by name, so patches survive new knobs). Migrations run by version: e.g. v4 linked Octave/Fine, v5 locked Pattern, v6 linked OTT Depth/Output, v7/v8 OTT lock changes; sequences carry their own flags (`v2`, `v3`, `v4`) for rate-list changes.
- Wavetables are stored as base64 int16 frames.
- Stored: A, B, C, morph, locks, section locks, links, link memory, tables, sequences, tempo, Walk/Swap, Cut/Spill, effect on/off, mono.

---

## 11. Testing approach used so far

- Headless Chromium (Playwright). Real audio checked by patching `AudioNode.prototype.connect` to tap an AnalyserNode before the destination, then measuring RMS after pressing keys or starting the sequencer.
- Offline engine tests: instantiate `MorphEngine` in the page, render blocks, measure RMS/peak per effect setting, check for NaN, measure CPU time per second of audio, count sample-to-sample jumps while sweeping (to catch clicks).
- Statistical tests for randomization rules (hundreds of runs) and determinism tests for the sequence morph.
- These should become a proper test suite in the new project.

---

## 12. Known issues and open items

- iPhone audio reliability can't be verified outside a real device; the unlock logic in Section 2 is the current best effort.
- OTT at 100% Depth still raises peaks about 5 dB (average level steady). Possible next step: match loudness on peaks as well.
- Drive's oversampling fixed harshness; no oversampling elsewhere (FM will need attention).
- The design is mobile-first; the bottom panel takes about a third of a phone screen. A collapse handle was suggested but not built.

---

## 13. Next build: assignable slots (approved)

### Oscillator slots
- **4 oscillator slots.** Each chooses an **engine**: **Wavetable**, **FM**, **Physical**, **Sampler**, or **Sub**.
- The engine type is shared by both sides (engines can't truly morph into each other); A and B morph everything within the engine.
- Every slot: **Level** (default 80%, **linked and locked** by default, still morphable when unlinked), Pan, **Filter** routing (blend between filter 1 and filter 2) and a **Bypass** amount (route around the filters). Everything morphs.
- **Wavetable:** as today (own tables A/B, Position A/B, Wave), plus Pitch (±24 semitones, stepped), Fine, Unison.
- **FM:** 3 to 4 operators. Ratios as stepped knobs with fine detune beside them; index, feedback, per-operator envelopes; index scaled down on high notes to limit aliasing (consider oversampling).
- **Physical:** a **String ↔ Body** blend instead of a mode switch: 0% pure plucked/bowed string (waveguide), 100% pure struck resonator (modal bank: bell, marimba, metal), in between the string excites the resonator like a body. Excitation, damping, brightness, position, stiffness, decay.
- **Sampler:** one sample per side, loaded from files, crossfaded by a **Sample** knob like Wave; Start (scans through the sample), root note/pitch tracking, Level, One-shot / Loop.
- **Sub:** tracks slot 1's pitch. Octave (-1 / -2, stepped), Shape (sine → triangle → square, continuous), Level, Filter (through ↔ bypass the filter, to keep lows solid), Drive.
- An **Additive** engine was discussed as a possible later engine: its value over wavetables is per-partial decay and inharmonic (stretched/shifted) partials; CPU needs a partial limit tied to polyphony.

### Filters and amp
- **Shared**, like Serum, Vital and Pigments: oscillators mix, run through **two filters** and **one amp envelope**. Per-slot routing picks filter 1, filter 2, both (blend) or around them. Per-slot envelopes come later via the mod matrix.

### FX slots
- **4 FX slots.** Each chooses a type: Drive, Formant, Modulation, Delay, Reverb, Lo-fi, **OTT (an ordinary effect, not fixed)**. Slots run in slot order, so the user sets the order.
- Each slot remembers its settings for every type, so switching back loses nothing.
- Default patch: OTT in the last slot.
- Section tools (three dice, section lock, On/Off) apply per slot.

### After the slots
1. **Morph sources** per parameter: the chain icon cycles **Main / Linked / Own**. Own = the parameter morphs on its own; the live dot becomes a draggable handle along the arc between A and B (larger touch area).
2. **Section sliders:** a toggle beside a section heading reveals a slim slider under it; that section's Main-source parameters follow it. Precedence: Own, then section slider, then main slider. Each parameter's curve applies to whichever slider drives it.
3. **Mod matrix:** LFOs, extra envelopes and sequencer parameter lanes as sources; any knob, Own position or section slider as a destination.
4. Presets and sharing; hardware MIDI input.

---

## 14. Parameter reference (as of this version)

Generated from the code. Values shown with their display formatting.

#### Wavetables

| Knob | id | Range | Curve | Default A | Default B | Notes |
|---|---|---|---|---|---|---|
| Position A | `posA` | 0 to 1 | lin | 67% | 67% | belongs to side A only, never morphs |
| Wave | `wave` | 0 to 1 | lin | All A | All B |  |
| Position B | `posB` | 0 to 1 | lin | 30% | 30% | belongs to side B only, never morphs |

#### Oscillator

| Knob | id | Range | Curve | Default A | Default B | Notes |
|---|---|---|---|---|---|---|
| Octave | `octave` | -2 to 2 | int | 0 | 0 | linked by default |
| Fine tune | `fine` | -100 to 100 | lin | 0 ct | 0 ct | linked by default |
| Unison | `unison` | 0 to 1 | lin | Off | 35% |  |
| Glide | `glide` | 0 to 2 | pow2 | Off | Off |  |
| Vibrato | `vdepth` | 0 to 1 | pow2 | Off | Off |  |
| Fade in | `vfade` | 0 to 5 | pow2 | 600 ms | 600 ms |  |
| Vib rate | `vrate` | 0.5 to 12 | log | 5.5 Hz | 5.5 Hz |  |
| Rate fade | `vrfade` | -10 to 10 | lin | Steady | Steady |  |
| Rate settle | `vrtime` | 0 to 5 | pow2 | 1.00 s | 1.00 s |  |

#### Filter

| Knob | id | Range | Curve | Default A | Default B | Notes |
|---|---|---|---|---|---|---|
| Cutoff | `cutoff` | 30 to 18000 | log | 700 Hz | 2.50 kHz |  |
| Resonance | `reso` | 0 to 1 | lin | 25% | 45% |  |
| Mode | `mode` | 0 to 1 | lin | 0% | 25% |  |
| Env amount | `envamt` | -1 to 1 | lin | +50% | +25% |  |
| Key track | `keytrack` | 0 to 1 | lin | 50% | 50% |  |

#### Filter envelope

| Knob | id | Range | Curve | Default A | Default B | Notes |
|---|---|---|---|---|---|---|
| Attack | `fatk` | 0.001 to 10 | log | 3 ms | 400 ms |  |
| Decay | `fdec` | 0.005 to 10 | log | 350 ms | 1.20 s |  |
| Sustain | `fsus` | 0 to 1 | lin | 15% | 40% |  |
| Release | `frel` | 0.005 to 10 | log | 300 ms | 1.50 s |  |

#### Amp envelope

| Knob | id | Range | Curve | Default A | Default B | Notes |
|---|---|---|---|---|---|---|
| Attack | `aatk` | 0.001 to 10 | log | 3 ms | 250 ms |  |
| Decay | `adec` | 0.005 to 10 | log | 600 ms | 1.00 s |  |
| Sustain | `asus` | 0 to 1 | lin | 70% | 85% |  |
| Release | `arel` | 0.005 to 10 | log | 300 ms | 1.60 s |  |

#### Output

| Knob | id | Range | Curve | Default A | Default B | Notes |
|---|---|---|---|---|---|---|
| Level | `level` | 0 to 1 | lin | 80% | 80% | locked by default |
| Pan | `pan` | -1 to 1 | lin | Center | Center | locked by default |

#### Drive

| Knob | id | Range | Curve | Default A | Default B | Notes |
|---|---|---|---|---|---|---|
| Drive | `drive` | 0 to 1 | lin | 0% | 0% |  |
| Shape | `dshape` | 0 to 1 | lin | 0% | 0% |  |
| Mix | `dmix` | 0 to 1 | lin | 0% | 0% |  |

#### Formant filter

| Knob | id | Range | Curve | Default A | Default B | Notes |
|---|---|---|---|---|---|---|
| Vowel | `fvowel` | 0 to 1 | lin | A | U |  |
| Shift | `fshift` | -12 to 12 | lin | 0.0 st | 0.0 st |  |
| Resonance | `freso` | 0 to 1 | lin | 50% | 50% |  |
| Mix | `fmix` | 0 to 1 | lin | 0% | 0% |  |

#### Modulation

| Knob | id | Range | Curve | Default A | Default B | Notes |
|---|---|---|---|---|---|---|
| Type | `mtype` | 0 to 1 | lin | 0% | 0% |  |
| Rate | `mrate` | 0.02 to 10 | log | 0.40 Hz | 0.40 Hz |  |
| Depth | `mdepth` | 0 to 1 | lin | 50% | 50% |  |
| Feedback | `mfb` | 0 to 1 | lin | 30% | 30% |  |
| Mix | `mmix` | 0 to 1 | lin | 0% | 0% |  |

#### Delay

| Knob | id | Range | Curve | Default A | Default B | Notes |
|---|---|---|---|---|---|---|
| Time | `dltime` | 0 to 11 | int | 1/8 D | 1/8 D |  |
| Feedback | `dlfb` | 0 to 0.95 | lin | 40% | 40% |  |
| Ping-pong | `dlpp` | 0 to 1 | lin | 60% | 60% |  |
| Tone | `dltone` | 0 to 1 | lin | Flat | Flat |  |
| Mix | `dlmix` | 0 to 1 | lin | 0% | 30% |  |

#### Reverb

| Knob | id | Range | Curve | Default A | Default B | Notes |
|---|---|---|---|---|---|---|
| Size | `rvsize` | 0 to 1 | lin | 50% | 70% |  |
| Decay | `rvdecay` | 0.2 to 20 | log | 1.5 s | 3.0 s |  |
| Damping | `rvdamp` | 0 to 1 | lin | 50% | 40% |  |
| Mix | `rvmix` | 0 to 1 | lin | 12% | 30% |  |

#### Lo-fi

| Knob | id | Range | Curve | Default A | Default B | Notes |
|---|---|---|---|---|---|---|
| Wow | `lwow` | 0 to 1 | lin | 0% | 0% |  |
| Flutter | `lflut` | 0 to 1 | lin | 0% | 0% |  |
| Character | `lchar` | 0 to 1 | lin | 0% | 0% |  |
| Noise | `lnoise` | 0 to 1 | lin | Dark hiss | Dark hiss |  |
| Noise mix | `lnmix` | 0 to 1 | lin | 0% | 0% |  |
| Dropouts | `ldrop` | 0 to 1 | lin | 0% | 0% |  |
| Codec | `lcodec` | 0 to 1 | lin | 0% | 0% |  |

#### OTT

| Knob | id | Range | Curve | Default A | Default B | Notes |
|---|---|---|---|---|---|---|
| Depth | `ottdepth` | 0 to 1 | lin | 13% | 13% | locked by default; linked by default |
| Time | `otttime` | 0.1 to 4 | log | 1.00× | 1.00× |  |
| Low split | `ottlo` | 40 to 500 | log | 120 Hz | 120 Hz |  |
| High split | `otthi` | 600 to 10000 | log | 2.5 kHz | 2.5 kHz |  |
| Low gain | `ottgl` | -12 to 12 | lin | 0.0 dB | 0.0 dB |  |
| Mid gain | `ottgm` | -12 to 12 | lin | 0.0 dB | 0.0 dB |  |
| High gain | `ottgh` | -12 to 12 | lin | 0.0 dB | 0.0 dB |  |
| Output | `ottout` | -12 to 12 | lin | 0.0 dB | 0.0 dB | locked by default; linked by default |

#### Sequencer

| Knob | id | Range | Curve | Default A | Default B | Notes |
|---|---|---|---|---|---|---|
| Pattern | `pattern` | 0 to 1 | lin | All A | All B | locked by default |