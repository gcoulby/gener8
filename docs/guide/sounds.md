# Sounds

Sounds are the voices: warm-white shapes on the canvas. Each type has its own glyph in the palette. Hover a palette item to see its name.

## Event and sustained

| Type | Kind | Character |
|---|---|---|
| ![subtractive](icons/sound-subtractive.svg) **subtractive** | event | Detuned saw/square oscillators through a resonant filter with its own envelope. |
| ![fm](icons/sound-fm.svg) **fm** | event | Two-operator FM: bells, keys, glass. |
| ![pluck](icons/sound-pluck.svg) **pluck** | event | A plucked string (Karplus-Strong). |
| ![percussion](icons/sound-percussion.svg) **percussion** | event | A body that blends sine and noise, with a pitch sweep. |
| ![macro](icons/sound-macro.svg) **macro** | event | Eight synthesis models behind the same three controls, after Mutable Instruments Plaits. See [Macro](#macro). |
| ![bass](icons/sound-bass.svg) **bass** | event | A monophonic bass: saw to square plus a sub, a resonant filter with its own envelope, and glide between notes. |
| ![pad](icons/sound-pad.svg) **pad** | sustained | A slow-swelling unison pad with a breathing filter. |
| ![drone](icons/sound-drone.svg) **drone** | sustained | Saws over a sine sub, drifting slowly. |
| ![additive](icons/sound-additive.svg) **additive** | sustained | Stacked partials: organ-like to hollow and shimmering. |
| ![noise](icons/sound-noise.svg) **noise** | sustained | A focused band of noise: wind, surf, crackle. |

**Event** sounds play a note each time something triggers them. **Sustained** sounds play all the time. A trigger becomes an accent: a swell or a brighter moment. Sustained sounds also follow pitch changes smoothly, so moving one through a pitch map glides between notes.

## Macro

The octagon. One sound, eight **models**, chosen with the **model** slider in its panel. Every model has the same three controls: **harmonics**, **timbre** and **morph**. They mean something different in each, and the panel lists what they do for the chosen model. Because the names stay the same, an XY field can map position to any of them (see [param targets](maps.md#targets)), so moving a sound morphs whatever model it's on.

| Model | Harmonics | Timbre | Morph |
|---|---|---|---|
| ![vowel](icons/macro-vowel.svg) **vowel** | vocal tract size | vowel: u, o, a, e, i | breath |
| ![chords](icons/macro-chords.svg) **chords** | chord: triad, 7th, 9th, stacked 4ths, always in key | open voicing | saw → square → sine |
| ![swarm](icons/macro-swarm.svg) **swarm** | detune | brightness | octave scatter |
| ![fold](icons/macro-fold.svg) **fold** | symmetry | fold drive | sine → triangle in |
| ![grain](icons/macro-grain.svg) **grain** | formant | second formant | roughness |
| ![particle](icons/macro-particle.svg) **particle** | resonator spread | density | resonance |
| ![modal](icons/macro-modal.svg) **modal** | material: string → bar → bell | brightness | damping of the upper partials |
| ![string](icons/macro-string.svg) **string** | how long the highs ring | pluck brightness | bow |

The mark inside the octagon shows which model a sound is on. Every note goes through a **low-pass gate**, as in Plaits: **decay** is how long it rings, and **colour** is how much it also darkens as it fades (0 only fades, 1 closes like a vactrol).

## Bass

The dome. A **bass** has a single voice, so a new note doesn't stack on the last one: it slides there over the **glide** time. The oscillator blends **saw → square** with a **sub** sine an octave down, then a resonant lowpass whose **env amount** and **env decay** give each note its pluck, and a little **drive**.

## Filled or hollow

An event sound inside a generator is **driven**, and it's drawn filled. An event sound outside every generator is **hollow**: it listens for ripples from other sounds and answers them. See [Ripples and retriggers](retrigger.md).

## Size is loudness

Drag the square **▪ size handle** on a selected sound. A size of 48 is 0 dB, and bigger is louder. Size also scales how far its ripples travel.

## Pitch and note

A sound's pitch comes from the [map field](maps.md) it sits in, usually the y axis of an XY field. Everything snaps to the patch's key and scale (set in the bottom bar).

Where no map sets pitch, the sound plays its own **note**. The default is middle C (C4). To change it, select the sound and drag or scroll the **note** chip in its bar. You can also press <kbd>↑</kbd> <kbd>↓</kbd>, or hold <kbd>shift</kbd> to move an octave. The bar tells you when a map is setting the pitch instead.

## Internals

Double-click a sound, double-tap it on touch (in [select mode](touch.md#pan-and-select-modes) on a phone), or zoom right in on it, to open its **panel**: oscillators, filter and envelopes, depending on the type. Drag the sliders and envelope points. Press <kbd>esc</kbd> or zoom back out to close it.

Map fields can also drive any of these parameters by position. See [param targets](maps.md#targets).
