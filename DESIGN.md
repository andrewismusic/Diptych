# Diptych: design document

Diptych is a browser synthesizer built around one idea: **every sound has two complete settings, A and B, and a single morph slider moves between them.** It is not two instruments side by side. It is one instrument whose every parameter holds two values plus a curve describing how it travels between them.

This document records every decision made while building the current version (built from `src/` into `dist/diptych.html`), so development can continue in Claude Code without losing anything. Where a decision came from a specific request, the reason is noted, because many "odd" rules are deliberate.

The owner tests mostly on a phone. Mobile behavior is a first-class concern.

---

## 1. Principles the owner cares about

- **Morphing is the point.** Anything that can morph should. Since 2026-10-17 the architecture is fixed (Section 15), so nothing about the sound is shared between the sides except the morph curves: any A can morph into any B.
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
- **Messages** from UI to engine: `state` (A, B, C arrays and morph), `param`, `curve`, `morph`, `table` (slot, side), `sample` (slot, side), `smpLoop`, `blend`, `on`, `off`, `panic`, `mono`, `seq`, `seqPlay`, `bpm`, `walk`, `dlmode`, `bypass` (effect index). The engine reads each slot's engine or effect from the parameter list it is built with.
- **Engine classes** (all stringified into the worklet): `MorphEngine` (voices, slots, the filter, render), `WtBank` (one per Wavetable slot), `OscSub`, `OscSmp` (sample reading, looping), and one class per effect (`FxDrive`, `FxFormant`, `FxModulation`, `FxDelay`, `FxReverb`, `FxLofi`, `FxOtt`), each with `process(L, R, p, len, v, P)`. The list lives in `ENGINE_CLASSES` in `audio.js`.
- **Reports** from engine to UI: a queue (`reports`) drained every render block: `pos` (sequencer playhead) and `ott` (band levels and gains).
- **Rendering:** 16-sample sub-blocks. Each sub-block: resolve every parameter, run the sequencer, rebuild wavetables if needed, render voices (oscillators -> through or around the filter -> amp envelope -> master Level and Pan), run the seven effects in order. A final `tanh` soft clip protects the output. Oscillator gains and routing are ramped per sample within each sub-block. **Silent parts cost nothing:** an oscillator at Level 0 is skipped (a silent Wavetable doesn't rebuild either), and an effect at rest at the current morph position goes idle (Section 6).
- **Audio unlock (mobile):** every `pointerdown`, `pointerup`, `touchstart`, `touchend`, `mousedown`, `click` and `keydown` tries to create/resume the AudioContext, and plays a one-sample silent buffer. `navigator.audioSession.type = 'playback'` lets iPhones play with the ringer switch on silent. The top-right button shows "Tap to start audio" whenever the context isn't running.
- **CPU:** measured at roughly 10 to 17% of one desktop core with 8 notes and effects on (fixed chain); 12.7% with 8 notes, four oscillators (three Wavetables at full Unison and a Sub) and four effects in the slot build; 12 to 14% with 8 notes, all four oscillators and all seven effects in the fixed architecture. One Wavetable with every effect at rest renders about 5 times faster than everything on.

### Suggested structure for Claude Code
Split into modules (engine core, voices, effects, sequencer, UI knobs, editors, randomization, persistence), keeping a build step that bundles the engine into a single string for the AudioWorklet (or use a real worklet module file when hosted outside the artifact sandbox). Keep a single-file build target so it can still be published as an artifact.

Status: done. The UI side is split by feature, and since the slot build the engine is split too: core, oscillators and one class per effect (see Section 2).

---

## 3. The morph system

- Every parameter is stored **normalized (0 to 1)** in `state.A[i]` and `state.B[i]`, plus a curve `state.C[i]` from -1 to 1.
- Parameters are defined once in a registry, `DEFS`, with `id`, `label`, `group`, `min`, `max`, `curve` (`lin`, `log`, `int`, `pow2`), defaults `a` and `b`, and optional `single` ('A' or 'B': belongs to one side only, never morphs).
- **Resolved value** = `lerp(A, B, bend(morph, C))`, where `bend(m, c) = m ^ (6 ^ -c)`. Positive c moves early, negative moves late. Because values are normalized, log parameters (cutoff, times) morph evenly by ear.
- **Stepped parameters** (`int`: Octave, delay Time) interpolate then round, so they walk through every value between A and B. A `snap` option (flip at 50%) exists for things that truly can't step.
- The engine resolves every 16 samples and smooths continuous values (coefficient 0.08 per block). Stepped values change immediately. The output gain (Level, Pan) is additionally interpolated per sample within each 16-sample block.

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
- Defaults (fixed architecture): **locked** master Level and Pan, Pattern, both Waves, Sample, OTT Output. **Linked** both Wavetables' Pitch and Fine, the Sampler's Pitch and Fine, OTT Output. Oscillator Levels and OTT Depth are free, because they decide what each side hears.

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
- **One filter** (decided 2026-10-03, reversing the two-filter plan): the Filter section holds Cutoff, Resonance, Mode, Env amount, Key track and the filter envelope's Attack, Decay, Sustain, Release, with the response and envelope pictures together. Each oscillator slot's Bypass sends that much of it around the filter. The filter envelope's picture sits with its own knobs, apart from the response picture (2026-10-03).

---

## 6. Effects

Order (fixed again since 2026-10-17, confirmed by the owner with Lo-fi right before OTT): Drive, Formant filter, Modulation, Delay, Reverb, Lo-fi, OTT. Each has an On/Off bypass for auditioning, never morphed or randomized. All are level-matched to the dry signal (verified by measurement).
- **At rest = off, and idle.** Each effect lists the settings that make it silent (`REST` on its class): Drive, Formant, Modulation, Delay, Reverb at Mix 0; Lo-fi with Wow, Flutter, Character, Noise mix, Dropouts and Codec all 0; OTT with Depth, the three band gains and Output at 0. When those hold **at the current morph position**, the effect fades to dry over 15 ms and goes idle (no CPU) and is replaced by a fresh instance, so turning it up later brings back no stale echoes. Waking, it runs unheard for 25 ms to fill its buffers (Drive and Lo-fi delay the sound slightly, and a fresh delay line is empty: fading in at once clicked in testing), then fades in. Rest is judged at the current position rather than on both sides because Drive and Lo-fi aren't perfectly transparent at 0 (a few samples of latency, gentle saturation): judged on both sides, turning an effect on for B changed the sound at full A, which the test suite caught.

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
- **Randomize row** in the always-visible bottom panel, labelled in text (2026-10-03): **Sound A / Link / All / B**, **Sequence A / Both / B** ("Seq" on phones), and **Undo** (30 levels; covers randomize, copy, swap, reset, link toggles, slot types, samples, sequence edits). On desktop it shares a line with the morph slider and the Keys/Seq bar.
- Sections (no folding, by decision 2026-10-03: fixed positions make navigation easier): **Wavetable 1, Wavetable 2, Sub, Sampler** (every oscillator shows wave cards for A, what you hear, and B; a side where the oscillator is at Level 0 shows its card dimmed; on a Wavetable the A and B cards open the editor; on the Sampler their labels are the sample menus and the middle card holds One-shot / Loop; then the engine's knobs, then Level, Pan and Bypass), Voice (Glide, vibrato), Filter (response with its knobs, and the envelope picture with the envelope knobs, as two blocks), Amp envelope, Output, then the seven effects **Drive, Formant, Modulation, Delay, Reverb, Lo-fi, OTT** (On/Off in each heading).
- The value line under each oscillator and effect knob is always two lines tall, so changing values never moves anything below.
- **Phones (narrow or portrait windows):** four knobs per row maximum, sections stacked, the page scrolls, the bottom panel stays in view.
- **Desktop (wide landscape windows, prioritized for plugin-like ergonomics, 2026-10-03): no scrolling at all.** The page is laid out at a fixed 1440 x 900 design and scaled to the window (CSS zoom): the four oscillators across the top; Voice, Filter (its two blocks side by side), Amp envelope and Output in the middle; the seven effects in one row below, each as wide as two rows of its knobs need (three knobs to a row, four for Lo-fi and OTT; Drive a little narrower so Modulation's heading fits); the bottom panel last, with compact knobs, A/B values on one line, and oscillator knobs flowing six to a row. Tested at 1280x720 to 2560x1200.
- **Bottom panel (always visible, sticky):** morph slider (thumb filled with the morph color), then Keys/Seq bar, then the keyboard or sequencer pane (both panes the same height).
- Keyboard: one octave plus a note, octave shift, Latch, Mono/Poly; computer keys A to K, Z/X octave; space plays/stops in sequencer mode.
- Font: Barlow Semi Condensed. Light and dark themes with violet-tinted neutrals.

---

## 9. Randomization rules

### Main buttons (shaped)
- Values come from per-parameter functions (`RND`), in musically useful ranges.
- **15% rule:** a side's new value lands at least 15% of the knob's throw away from the other side's, so morphs are dramatic. Exempt: Noise mix, OTT band gains, Formant/Modulation/Delay/Reverb mixes, Wow, Flutter, Codec, Dropouts, Glide, Unison, Vibrato depth, Rate fade, filter Mode (their chance of landing at zero, or low, matters more; both sides at 0 is fine). The last five were added after the test suite showed the rule was re-rolling away their stated odds. Oscillator Pan, Bypass, Sub Octave, Sampler Start and Key track are exempt too, and since the fixed architecture also oscillator Level, Drive mix, OTT Depth and Lo-fi Character (they decide whether something is heard on a side).
- **What each side hears (fixed architecture, 2026-10-17).** Every oscillator and effect is always present, so the old engine-picking odds became per-side "is it heard" odds. Oscillators: Level is 0 unless it comes up heard (then 50 to 90%): Wavetable 1 85%, Wavetable 2 40%, Sub 30%, Sampler 40%; if every free Level comes up 0, one comes on by the same odds, so a side is never silent. Effects are off (at rest) on a side: Drive 60%, Formant 80%, Modulation 65%, Delay 55%, Reverb 50%, OTT 50% (Depth 0, and then its band gains are flat so it's truly off), Lo-fi 70% (every amount 0). A side hears about 2.7 effects on average.
- **Effect mixes:** Delay mix, when on, mostly up to 35%, rarely above 50%. Reverb mix mostly up to 35%. Across Formant, Modulation, Delay and Reverb: at most two above 50%, at most one above 90%.
- **Other effects:** full range (Drive, shapes, rates, times, sizes). Delay Cut/Spill is randomized 50/50 by Randomize all and the Delay dice.
- **Lo-fi:** Wow, Flutter and Codec at minimum in 66% of generations; Dropouts in 90%; otherwise leaning low (squared). Character leans low. Noise mix mostly 0 to 15%, never above 35%.
- **OTT:** Depth, when on, 5 to 60% leaning low; band gains within ±3 dB with a mix of boosts and cuts on each side; Low split 40 to 500 Hz, High split 600 Hz to 10 kHz.
- **Oscillator:** Octave 0 about 70% of the time (else ±1); Fine 0 about 70%; Unison off 40%; **Glide 0 in 50% of generations, under 100 ms in 95%**; Vibrato depth within ±30 cents about 85% of the time; Rate fade 0 half the time.
- **Filter/envelopes:** cutoff 150 Hz to 12 kHz; resonance leans low; Mode pure low-pass half the time; Env amount usually positive; attacks lean short; amp sustain 20% or more.
- **Sine guard:** if a side's wave (a Wavetable heard on that side) is nearly a pure sine, the filter it feeds leaves the band-pass zone (Mode 35 to 65% becomes a low-pass mode, 0 to 30%) and its cutoff moves to the open end (above about 1 kHz for low-pass modes, below about 280 Hz for high-pass modes) so it can't go silent. The band-pass case was added after the test suite found a near-silent launch patch.
- **Loudness guard:** after the shaped randomize, each side's harmonics (middle C plus each slot's Pitch) are run through its routing and both filters at the filter envelope's peak and at sustain (only oscillators heard on that side count). If less than 1% of the power (-20 dB) gets through at both, that side's filters are re-rolled (up to 10 times), then the filter opens as a low-pass as a last resort. Added after the test suite found near-silent launch patches (a band-pass pushed far above a low note by Env amount; about 1 in 75 patches before).
- Pattern usually sits at its ends (A 0 to 40%, B 60 to 100%, at the exact end 60% of the time). **Wave is locked at full range (A 0%, B 100%) by default** so each end of the morph hears only its own wavetable, and randomizing one side can never change the sound at the other end. With Wave unlocked the old rule applies (same as Pattern), and an A Wave above 0% means full A plays part of table B, so randomizing B changes it; that is correct behavior, just not the default; each side's wavetable is replaced by a random built-in table unless the Wavetables section is locked.
- **Randomize linked:** only unlocked linked knobs, one new value shared by both sides.

### Section dice (raw)
Anywhere in each knob's full range, no shaping rules, locks still respected. Exception in the Lo-fi section: Noise mix, Codec and Dropouts stay under 30% about 80% of the time; Wow and Flutter under 40%.

### Sequences
- Main-page sequence dice and launch: new rate, new generator settings (Arp or Riff), rhythm variation, velocity, and density leaning high (never below 30%). "Both" also picks a new shared scale. **Every random pattern holds at least 5 notes** (a slow rate that can't fit 5 into one bar gets two bars, then density and rests give way), and **nine times in ten it keeps a note on the downbeat** (2026-10-03).
- **Copy a sequence** to the other side with **A→B** / **B→A** in the sequencer pane (2026-10-03); the header's Copy buttons still cover the sound only.
- Editor Random: Notes (melody in scale), Velocity (fully random 5 to 100%), Rate, Generator, All (rate, generator, rhythm, velocity, density 30% or more).

### Launch
Every launch: Randomize all, new sequences (16 steps), tempo 85 to 135 bpm. **Undo restores the previous session's patch.**

---

## 10. Persistence

- `localStorage` key `diptych-v5` (fixed architecture, `ver` 1; earlier patches are ignored by decision, 2026-10-17). Before that, `diptych-v4` (slot build), with `ver` (last 4) and `ids` (parameters are matched by id, so patches survive new knobs). ver 2 went back to one filter (`f1.*` ids become plain, Filter 2 and the slots' filter blend are dropped); ver 3 removed FM (saved FM slots load as Off); ver 4 added the Sampler (Sample locked, Pitch and Fine linked). Patches from the fixed-chain version (`diptych-v3`) are ignored by decision. Sequences carry their own flags (`v2`, `v3`, `v4`) for rate-list changes.
- **Samples:** loaded files live in IndexedDB (database `diptych`, store `samples`), keyed by an id; the patch saves only a reference per side ({ name } for a built-in, { name, id } for a file). Old files are not cleaned up yet.
- Wavetables are stored as base64 int16 frames.
- Stored: A, B, C, morph, locks, section locks, links, link memory, tables per Wavetable, sample references and Loop, sequences, tempo, Walk/Swap, Cut/Spill, effect On/Off, mono.

---

## 11. Testing

`npm test` builds the page and runs the Playwright suite in `tests/` against `dist/diptych.html` in headless Chromium (about 15 s). `Math.random` is seeded in every test, so results are repeatable, including the statistical ones.

- `smoke`: the page loads with no errors; real audio comes out of the AudioWorklet from the sequencer and the computer keyboard (measured by patching `AudioNode.prototype.connect` to tap an AnalyserNode before the destination); at phone width (390 px, touch) there's no sideways scroll, the bottom panel and morph slider stay on screen, rows hold at most four knobs, tapping the slider moves the morph, and both editors open and close.
- `levels`: every effect against the fully bypassed sound, with a sustained chord, a dark and a bright patch, tolerance ±1.5 dB. `LEVELS_REPORT=1 npm test -- levels` prints every measurement.
- `engine`: no NaN and no output above full scale across random patches with morph sweeps; CPU under 50% of real time with 8 notes, every oscillator and every effect (12 to 14% measured); silent oscillators and resting effects cost under half (about a fifth measured), every resting effect is idle, and an effect turned back up brings no stale tail; no clicks when effect switches toggle, effects go idle or wake, or the morph jumps (a pure sine's largest sample-to-sample step is the reference).
- `randomize`: the section 9 rules over 400 seeded runs (including what each side hears); locks respected; randomizing one side never changes the rendered sound at the other end; section dice stay inside their section; a locked oscillator keeps its tables or samples; Randomize never touches the On/Off switches; Randomize linked only moves linked knobs.
- `sequencer`: at 0% and 100% the evaluated sequence is exactly A or B (400 random pattern pairs, Walk and Swap); switch points are rebuilt identically; the engine plays B note for note at 100% with no overlapping notes.
- `persistence`: Undo after a relaunch restores the previous session exactly; locked values survive a relaunch; parameters are matched by id; v8 patches migrate; a corrupt save falls back to defaults.

Known deviations are marked as expected failures (`test.fail`) with the measured values in the test. If one gets fixed, its test reports "expected to fail but passed"; remove the marker then.

---

## 12. Known issues and open items

- iPhone audio reliability can't be verified outside a real device; the unlock logic in Section 2 is the current best effort.
- OTT at 100% Depth still raises peaks about 5 dB (average level steady). Possible next step: match loudness on peaks as well.
- Drive's oversampling fixed harshness; no oversampling elsewhere (FM will need attention).
- The design is mobile-first; the bottom panel takes about a third of a phone screen. A collapse handle was suggested but not built.
- **Found by the test suite (2026-09-30), open for decision.** Each has an expected-failure test:
  - Level matching, at full or high settings: Formant at full mix +3 to +7 dB; Modulation at full mix -2.6 dB (chorus), about -5 dB (flanger), -3 dB (phaser); Reverb at 100% mix with Size 0% +4 dB and at 30 to 50% mix down to -2.8 dB; Delay at full mix without ping-pong +2.1 dB; Drive 100% -2 to -3 dB (-4.4 to -5.4 dB with Shape 100%), Drive 75% with Shape 100% -1.5 to -2.5 dB. Everything else is within 1.5 dB.
  - ~~Zipper steps on Level and Pan~~ Fixed: the output gain now glides per sample across each 16-sample sub-block (a morph jump measured 1.7x a sine's steepest step for Level and 3.2x for Pan before, 1.0x or less after). Other settings (filter cutoff, envelope times, effect amounts) still resolve every 16 samples; they have not been click-tested yet.
  - ~~The 15% rule conflicted with rules that depend on landing at 0~~ (Glide, Unison, Vibrato, Rate fade, Mode). Fixed: those five are now exempt.

---

## 13. Assignable slots (built 2026-09-30 to 10-03, replaced by the fixed architecture in Section 15)

### Oscillator slots
- **4 oscillator slots.** Each chooses an **engine**: **Wavetable**, **FM**, **Physical**, **Sampler**, or **Sub**.
- The engine type is shared by both sides (engines can't truly morph into each other); A and B morph everything within the engine.
- Every slot: **Level** (default 80%, **linked and locked** by default, still morphable when unlinked), Pan, and a **Bypass** amount (route around the filter). Everything morphs. (The planned filter 1 / filter 2 blend went away with the second filter.)
- **Wavetable:** as today (own tables A/B, Position A/B, Wave), plus Pitch (±24 semitones, stepped), Fine, Unison.
- **FM: removed from Diptych on 2026-10-03** (by the owner: too many parameters, and switching ratios and algorithms is too steppy for a morph synth). It lives on as a standalone sketch for exploring an FM product: `dist/fm.html` (source in `src/fm/`): eight algorithm diagrams, four operator columns (Ratio, Level, Decay with the time-dependent shape), Feedback, Brightness, Pitch, amp envelope, presets, Randomize, live scope and keyboard.
- **Physical:** a **String ↔ Body** blend instead of a mode switch: 0% pure plucked/bowed string (waveguide), 100% pure struck resonator (modal bank: bell, marimba, metal), in between the string excites the resonator like a body. Excitation, damping, brightness, position, stiffness, decay.
- **Sampler** (built 2026-10-03): a sample per side, crossfaded by **Sample** (locked at full range by default, like Wave); **Start** (where playback begins, read when a note starts); **Pitch** and **Fine** (linked by default); **Key track** (100% chromatic, 0% fixed pitch, for drums); **One-shot / Loop** per slot (a loop runs from the Start point to the end and crossfades over its last 1024 samples; a one-shot fades over its last 64). Samples are assumed to be at middle C. Restarting a sounding note crossfades over 5 ms. Six **built-in samples** are generated in code (Plucked string, Bell, Mallet, Vocal ah, Breath pad, Drum), so nothing is downloaded; built-in and loaded samples are level-matched by their loudest 50 ms (to a full-level sawtooth's RMS). Loaded files are mono, up to 20 s, at 44.1 kHz.
- **Sub:** tracks slot 1's pitch. Octave (-1 / -2, stepped), Shape (sine → triangle → square, continuous), Level, Filter (through ↔ bypass the filter, to keep lows solid), Drive.
- An **Additive** engine was discussed as a possible later engine: its value over wavetables is per-partial decay and inharmonic (stretched/shifted) partials; CPU needs a partial limit tied to polyphony.

### Filters and amp
- **Shared**: oscillators mix, run through **one filter** (the second filter was removed on 2026-10-03) and **one amp envelope**. Per-slot Bypass sends part of a slot around the filter. Per-slot envelopes come later via the mod matrix.

### FX slots
- **4 FX slots.** Each chooses a type: Drive, Formant, Modulation, Delay, Reverb, Lo-fi, **OTT (an ordinary effect, not fixed)**. Slots run in slot order, so the user sets the order.
- Each slot remembers its settings for every type, so switching back loses nothing.
- Default patch: OTT in the last slot.
- Section tools (three dice, section lock, On/Off) apply per slot.

### Build plan and decisions (2026-09-30)
Decided with the owner:
- **Old patches start fresh.** The slot build uses a new storage key (`diptych-v4`, `ver` 1) and ignores `diptych-v3`.
- **Oscillator slots have an Off type.** Default patch: slot 1 Wavetable, slots 2 to 4 Off. An Off slot costs no CPU.
- **Every slot is its own collapsible section** (Osc 1 to 4, FX 1 to 4). Folding is remembered.

Phases, each tested and committed on its own:
1. **Slot framework:** oscillator slots with Off / Wavetable / Sub; FX slots holding any of today's seven effects; new save format; tests updated. (Built with two filters, then reduced to one.)
2. Sampler (built). 3. Physical engine. (FM was built, then moved to its own page.)

Phase 1 design:
- **Parameter ids.** Global parameters keep their plain ids (`glide`, `aatk`, `level`, `pattern`). Filters are `f1.cutoff`, `f2.reso` and so on. Slot parameters are `o1.<key>` and `x1.<key>`, where the key is the parameter's own name (`o1.wave`, `o2.soct`, `x3.dlmix`). Keys are unique within a slot, so formats, randomize rules and exemptions are looked up by key.
- **Every slot remembers the settings of every type** (all types' parameters exist and are saved), for oscillators as well as effects. Only the current type's parameters are resolved by the engine, shown, or randomized.
- **Oscillator slot:** Level (default 80%, linked and locked; 80% is unity), Pan, Bypass (amount that goes around the filter). Everything morphs.
- **Wavetable:** each Wavetable slot has its own tables A and B, and Position A, Wave (locked at full range by default), Position B, Pitch (-24 to +24 semitones, stepped, linked by default), Fine (linked by default), Unison.
- **Sub:** follows slot 1's pitch (its Pitch and Fine when slot 1 is a Wavetable or FM). Octave (-1 or -2, stepped), Shape (sine to triangle to square, continuous, band-limited square), Drive. Its Level and filter bypass are the slot's own Level and Bypass.
- **Voice section** (global): Glide and the vibrato controls. The old global Octave and Fine tune are replaced by each engine's Pitch and Fine.
- **Filter:** one TPT state-variable filter per voice (see Section 5).
- **FX slots:** each holds one of Drive, Formant filter, Modulation, Delay, Reverb, Lo-fi, OTT, running in slot order, each with its own On/Off. Default: Drive, Delay, Reverb, OTT. Delay Cut/Spill is per slot.
- **Switching a type never clicks:** an oscillator slot fades out over about 8 ms, switches, and fades back in; an FX slot fades linearly to dry over 15 ms, switches, and glides back in (a 4 ms fade measured a slight click in testing). Switching an FX type builds the new effect on the audio thread, which allocates memory (Delay is the largest); watch for dropouts on slow phones.
- **Randomize** (updated by the owner 2026-10-03): types are shared by both sides, so they change with **Randomize all** (and launch) and with a slot's **both-sides dice**, never with a side's own buttons or dice (that would change the other end). A locked section keeps its type. **Never more than one Sub.** Randomize all: slot 1 is never Off (Wavetable 60%, Sampler 25%, Sub 15%); slot 2 is Sub 30%, Wavetable 20%, Sampler 10%, Off 40%; slots 3 and 4 are Wavetable 15%, Sampler 10%, otherwise Off. A slot's dice picks any engine but Off at even odds (any effect not used in another slot). The FX slots get four different effects from all seven, kept in chain order, so OTT is optional. Sampler: each side gets a random built-in sample (unless the section is locked); Start at 0 60% of the time; Key track full 85% of the time; Loop on 80% of the time when either side plays a sustained sample, 15% otherwise. Slot Bypass is 0 80% of the time; Sub Octave is -1 60% of the time. Exempt from the 15% rule: slot Pan, Bypass, Sub Octave, Sampler Start and Key track.

**Phase 1 status (2026-09-30): built.** A single Wavetable slot through Filter 1, and every effect in an FX slot, match the fixed-chain engine to within float rounding (checked sample by sample). Found and fixed while building: the loudness guard (Section 9).

### After the slots
1. **Morph sources** per parameter: the chain icon cycles **Main / Linked / Own**. Own = the parameter morphs on its own; the live dot becomes a draggable handle along the arc between A and B (larger touch area).
2. **Section sliders:** a toggle beside a section heading reveals a slim slider under it; that section's Main-source parameters follow it. Precedence: Own, then section slider, then main slider. Each parameter's curve applies to whichever slider drives it.
3. **Mod matrix:** LFOs, extra envelopes and sequencer parameter lanes as sources; any knob, Own position or section slider as a destination.
4. Presets and sharing; hardware MIDI input.

---

## 14. Parameter reference (fixed-chain version)

Generated from the fixed-chain code, kept for the ranges, curves and defaults, which carried over unchanged. In the slot build the same parameters live in slots: oscillator knobs are `o1.<key>` to `o4.<key>` (the old Octave and Fine tune became each Wavetable's Pitch, -24 to +24 semitones, and Fine), filter knobs are `f1.<key>` and `f2.<key>`, effect knobs are `x1.<key>` to `x4.<key>`; see `src/params.js` for the full list, including the new slot and Sub parameters.

#### Wavetables

| Knob | id | Range | Curve | Default A | Default B | Notes |
|---|---|---|---|---|---|---|
| Position A | `posA` | 0 to 1 | lin | 67% | 67% | belongs to side A only, never morphs |
| Wave | `wave` | 0 to 1 | lin | All A | All B | locked by default |
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

---

## 15. Fixed architecture and dual presets (decided 2026-10-17)

The owner reversed the assignable slots so that **any patch can morph into any other**: with the same oscillators and effects in every patch, a preset can be loaded into A and another into B and they morph into each other. The product is aimed at being a **desktop plugin first** (dense controls, heavy DSP), with an **iOS version** (AUv3 plus a standalone app) later from the same codebase: the engine shared, iOS a second layout. The browser build stays the design lab until the architecture settles, then the engine is ported to C++ (JUCE or iPlug2; both can show this web interface as the plugin's UI), with the test suite's measurements as the reference.

### Built (2026-10-17)
- **Oscillators fixed:** Wavetable 1, Wavetable 2, Sub (follows Wavetable 1's pitch), Sampler. No engine pickers, no Off: Level 0 is off, and costs nothing. Default patch: Wavetable 1 heard, the others at Level 0.
- **Effects fixed:** all seven in the order of Section 6. Mix 0 (or the effect's other rest settings) is off, and idle. No effect pickers, no reordering (the owner accepted losing order changes).
- **On/Off** stays as a bypass for auditioning, never morphed or randomized. **Loop / One-shot** and **Delay Cut / Spill** stay (one setting each, shared by both sides for now).
- **Randomize** no longer picks types; it decides what each side hears (Section 9).
- **Ids:** oscillators keep `o1.` to `o4.` (o1 and o2 the Wavetables, o3 the Sub, o4 the Sampler); effect parameters use their plain keys (`dlmix`, `ottdepth`), since each effect appears once.
- **Old patches** are dropped (new storage key), by the owner's decision.
- **Desktop:** the seven effects share one row (Section 8).

### Next, agreed with the owner
1. **Global presets** hold everything: both sides, both sequences, curves, locks and links, exactly as saved. Loading one replaces everything.
2. **Side presets:** one bank, and either side can load any of them. A side preset holds that side's values, wavetables and sample; never curves, locks, links or sequences. Loading one into B changes only B.
3. **Sequences** belong to global presets (if you made something good, you save the whole thing). The full state, sequences included, must be saved with the DAW project even when the user saves no preset.
4. **Side focus:** a switch A | Morph | B. In A or B each knob shows and edits only that side, in that side's color; the morph snaps to that side and the slider greys out (so there is no hidden blend to forget about); leaving focus brings back the morph exactly as it was. Curves are edited in Morph. Loading a side preset does **not** switch focus: the first thing to explore is how the new preset morphs with the other side.
5. **Capture the midpoint:** what you hear at the current morph can be sent to A, sent to B, or saved as a side preset (curves included). Wavetables: the blend at that point becomes a new table. Samples: the louder of the two at that point (A's at 50/50). Sequences: Send to A/B also captures the sequence heard at that point; Save as a side preset ignores sequences.
6. **Simpler screen:** compact tiles with each section's two to four key controls at fixed sizes and positions, and a tap on a section title opens its full controls in an overlay on top (like the wavetable editor), so nothing else moves (the earlier folding moved too much). A Basic/Advanced toggle may come later, but each view keeps fixed positions.
7. Samples carried inside presets (a common problem for sampling plugins) need a plan before presets move between devices.
