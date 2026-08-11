# Audio forensic: "prolonged high pitched machine sound" (defect 2)

**Status: ROOT CAUSE CONFIRMED, empirically, in the real built game.** Not fixed (per brief).

## Verdict

The whine is the **`harp` instrument in the composed score**: a Karplus-Strong
string whose feedback loop has **loop gain > 1**, so every harp note is a
self-oscillator that grows exponentially instead of decaying. Each note becomes
a rising scream concentrated near 3.2 kHz that slams into the master limiter
(held there at constant near-full loudness = "prolonged machine sound"), and
within 2.6–4.6 s the samples overflow to Inf → NaN. The NaN drains into the
song's feedback-delay FX loop, which **recirculates NaN forever**, latching the
entire mix bus (songGain → musicBus → master → limiter) into a permanently
broken state ("the sound is broken"). This fires on a timer, not on input —
it happens on the title screen and in the overworld within ~20–40 s of audio
unlock, every session, because the overworld map song, the title song, and
most floor/boss songs all carry a harp track.

## Root cause, file:line

- **`src/systems/music/instruments.js:91-117` — `harp()`** (the defect):
  - `:99-100` `delay.delayTime = 1/freq` — the KS string loop.
  - `:102` `fb.gain.value = 0.93` — feedback gain.
  - `:103-105` `damp` lowpass at 3200 Hz with **`Q` left at its default**.
    In WebAudio, a lowpass BiquadFilter's `Q` is **in dB**; the default `Q = 1`
    means **+1 dB of resonant peaking** near the cutoff (linear ×1.122).
    Effective loop gain at loop resonances near the cutoff:
    `0.93 × ~1.12 ≈ 1.04–1.06 > 1` → exponential growth, ~15–25 dB/s.
  - `:115-116` self-teardown fires 2.1 s after note start — **after** the voice
    has already grown by 60–200 dB (and for higher notes after it has already
    gone non-finite).
- **`src/systems/music/director.js:77-83` — `buildSongGraph()` FX delay**
  (the latch): `delay.connect(fbGain); fbGain.connect(delay)` is a feedback
  cycle. Loop gain 0.35 is stable for audio, but `NaN × 0.35 = NaN`: once one
  NaN sample from a blown harp note arrives via the track's `fxSend`
  (harp tracks send 0.3–0.55), the cycle recirculates NaN **forever**. The
  harp voice's own teardown cannot clear it. Everything summed downstream
  (songGain `:71-73` → musicBus → master → limiter) multiplies into NaN.
- **Trigger surface** (every song with a harp track):
  `songs/world.js:44` (`ripple` — this is `music/map`, the overworld),
  `songs/overworld.js:179` (`ripple-day`), `songs/title.js:80` (title screen!),
  `songs/floors.js:106,384,435` (floors 2, 8, 9),
  `songs/bosses.js:115,178,703,731` (bosses 1, 2, 8).

## Empirical evidence

Method: real `vite build` (minify off for readable stacks) served on :4173,
driven by headless Playwright Chromium (SwiftShader). Init script monkeypatched
`AudioContext` constructor, all node factories (`createOscillator` /
`createBufferSource` / `createGain` / …) with per-node stack tags, wrapped
`start`/`stop`/`ended` for a live-source census, patched `AudioNode.connect`
to record every graph edge and to interpose an `AnalyserNode` on everything
reaching `ctx.destination` plus a tap analyser on **every created node**, and
patched all `AudioParam` setters to catch non-finite values. Save seeded with
`musicVolume 0.8 / sfxVolume 1` (note: the existing e2e seeds **0/0**, which is
one reason no gate ever heard this). Audio unlocked with a trusted synthetic
click. Drivers in
`/tmp/claude-0/-home-user-Math-Warriors/d38faf89-71c5-5d4a-a22c-d779e7a95a08/scratchpad/audio-forensics{,2,3,4}.mjs`,
reports `report{1,2,3,4}.json` alongside.

1. **The mix goes all-NaN and stays NaN** (run 1/2): master-bus time-domain
   data flips from finite to 4096/4096-NaN and never recovers, sample after
   sample for 60+ s. Per-input bus taps pinpoint the entry: the **musicBus
   input `songGain`** created at `director.js buildSongGraph` (dist
   `index-CuQdjD7l.js:7044`, GainNode#92). All sfx-bus inputs stayed clean.
2. **Movement is irrelevant** (run 3, control: zero input for 60 s): NaN
   appeared anyway between t=36.5 s and t=45.8 s. The NaN node set at that
   moment: the song FX `delay` (dt=0.789 s = 1 beat at 76 bpm) ⇄ `fbGain`
   cycle, songGain, musicBus, master, limiter — plus fresh per-note chains
   born t=36.04/36.43/36.83 each consisting of
   `Delay(dt = 3.82/3.03/2.55 ms = 1/262, 1/330, 1/392 s — C4, E4, G4)` +
   `lowpass f=3200 Q=1` + gains, created from `Object.play ← onEvent ← tick`
   (the scheduler firing harp notes). Zero non-finite `AudioParam` writes and
   zero page errors in every run — the NaN is born **inside** the DSP
   (divergence → Inf → Inf−Inf), which is why no console-error gate can see it.
3. **In-game growth curve** (run 4, 1 Hz sampling): idle mix at −40 dB RMS;
   at t=18.8 s a narrow peak appears at **880 Hz (−29 dB)**, then 659 Hz —
   the map song's harp ripple entering. Master RMS jumps −37.4 → −17.3 dB and
   peak 0.026 → 0.47 within ~1 s (>20 dB/s crescendo into the −6 dB/20:1
   limiter at `audioGraph.js:49-55`, which pins it at constant loudness —
   the "prolonged" part). By t=27.6 s: 16384/16384 NaN, RMS −120 dB, and it
   never returns. (Headless Chrome renders latched NaN as silence; on
   iPadOS/CoreAudio, non-finite samples and the repeated pre-overflow screams
   are what the user hears as the machine sound. Either way the graph is dead.)
4. **Isolated single-voice repro, exact shipped topology**
   (OfflineAudioContext, 12 s renders):

   | voice | per-second peak (s1…s3) | first non-finite sample |
   |---|---|---|
   | shipped, C4 262 Hz | 1.2e5 → 9.8e11 → 6.3e20 | **4.55 s** |
   | shipped, E4 330 Hz | 1.1e6 → 1.4e14 → 1.1e24 | **4.05 s** |
   | shipped, G4 392 Hz | 3.9e6 → 2.3e15 → 9.0e25 | **3.80 s** |
   | shipped, A5 880 Hz | 2.8e11 → 9.1e24 → 3.1e34 | **2.62 s** |
   | control: `fb = 0.5` | 0.41 → 0 (decays) | never |
   | control: `fb = 0.93`, `damp.Q = −6 dB` | 0.32 → 0 (decays) | never |

   Every shipped note diverges; removing **either** the 0.93 feedback **or**
   the filter's default +1 dB peaking makes the identical topology decay.
   Measured growth ≈ ×1.06 per round trip — i.e. effective loop gain 1.06,
   matching `0.93 × ~1.14` (dB-Q peaking plus resonance alignment).

## Suspects examined and cleared

- **Prime suspect: `src/overworld/audio3d.js:453-477` reverb-lite** — CLEARED.
  Topology is a single ring, not two coupled loops: `in → d1 → damp1 → fb1 →
  d2 → damp2 → fb2 → d1`, with `wetOut`/panners as taps outside the loop.
  Round-trip gain = 0.72 × 0.70 = 0.504; worst-case with the two lowpasses'
  default +1 dB peaks (centred at different frequencies, 2400 vs 2000 Hz)
  stays ≈ 0.63 < 1. Empirically: all sfx-bus taps stayed NaN-free all run,
  and `setAmbienceEnabled(false)` changed nothing. **Hardening note:** it has
  the same NaN-latch property as the song delay — any NaN reaching
  `inGain` (sends at `audio3d.js:513-521`) would recirculate forever — but it
  was not the source here.
- **Suspect 2: SFX event spam** — CLEARED. Total sources started over a 92 s
  run including 60 s of continuous walking + jumps: 484 (~5–6/s). Spammiest
  creation site was a music-score oscillator (78 creations); footsteps are
  distance-paced (`index.js:1837-1846`, STRIDE_M 0.98) behind a 75 ms audio-
  clock throttle (`synthAudio.js:292-305`). No per-frame machine-gunning.
- **Suspect 3: stuck loops / whistling Q** — CLEARED. Live-source census flat
  at 36–37 while walking (music voices + the portal `hum` emitters
  98/147/392 Hz, within `VOICE_BUDGET.loops = 10` by design); >20 s survivors
  are exactly those hums and their 0.29 Hz LFOs. Glide wind never engaged
  (`_wind` guard, `synthAudio.js:328-415` is idempotent with real teardown).
  All bed/sfx filter Qs ≤ 5.5 on bandpass (Q is bandwidth-Q there, no gain).

## Why every prior gate missed it

The blowup emits **no exception, no console error, no bad AudioParam value**
(all runs: `badParams = []`, `pageErrors = []`) — it is pure sample-domain
divergence. The e2e save seeds `musicVolume: 0, sfxVolume: 0`, so even a
listening gate would have heard nothing, and `npm test` runs in Node with no
WebAudio. Only rendering/inspecting actual samples (analyser taps, offline
renders) exposes it.

## Notes for the fix crew (do not treat as applied)

- Stability criterion for the harp loop: `fb × 10^(QdB/20) < 1`. With the
  default lowpass Q of +1 dB, `fb` must be < 0.89; alternatively set
  `damp.Q` ≤ −1 dB (kills the resonant peak) and/or drop `fb` to ~0.85 for the
  same decay feel. Verify with the offline render in
  `audio-forensics4.mjs` (`renderHarp`): per-second peaks must be monotonically
  decreasing and `firstNonFinite: null` for C4/E4/G4/A5.
- Independently, both feedback delays (`director.js:83`, `audio3d.js:465-466`)
  latch NaN permanently; a divergence guard (periodic sanity check, or a
  WaveShaper clamp in the loop) would turn any future runaway from
  "audio dead until reload" into a transient.
- Regression gate: seed non-zero volumes, tap the destination with an
  AnalyserNode, drive 90 s, assert (a) zero NaN in time-domain data and
  (b) master peak < 1 sustained — this exact harness is in the scratchpad
  drivers and catches the defect in under a minute.
