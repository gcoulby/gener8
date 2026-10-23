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
| ![wavetable](icons/sound-wavetable.svg) **wavetable** | event | Scans through a table of waveforms. See [Wavetable](#wavetable). |
| ![organ](icons/sound-organ.svg) **organ** | event | A tonewheel organ: drawbars, key click, percussion and a rotary speaker. |
| ![chip](icons/sound-chip.svg) **chip** | event | An 8-bit game console voice: pulses, a stepped triangle or noise, with a fast arpeggio. |
| ![pipe](icons/sound-pipe.svg) **pipe** | event | A breathy flute or pan pipe, with a puff of air at the start of each note. |
| ![bowed](icons/sound-bowed.svg) **bowed** | event | A bowed string, modelled: bow pressure and position change how it grips and sings. |
| ![shepard](icons/sound-shepard.svg) **shepard** | sustained | A tone that seems to rise (or fall) forever. |
| ![bowl](icons/sound-bowl.svg) **bowl** | sustained | A singing bowl: beating, bell-like partials. Triggers strike it. |
| ![cloud](icons/sound-cloud.svg) **cloud** | sustained | A granular haze of short tones scattered over the sound's chord. |

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

## Wavetable

The heptagon. A **wavetable** sound reads one of four tables of eight waveforms: **analog** (sine to triangle to saw to square), **vocal** (a formant sweeping from "oo" to "ee"), **organ** (drawbars switching in) and **glass** (sparse, bright partials). **position** picks where in the table it plays, and **env → position** lets each note's envelope scan through it, so notes change colour as they sound. **warp** bends the waveform for extra harmonics. Every table is band-limited, so high notes stay clean.

## Organ, chip and pipe

**organ** picks a drawbar **registration** (flute, jazz, gospel, full, reed, bright). Its jazz and gospel settings include the 16' drawbar, so it sounds an octave down. **percussion** adds a decaying 2nd or 3rd harmonic to each note, and the **rotor** sets the speed and depth of the spinning speaker.

**chip** has five **waves**: two narrow pulses, a square, the console's 4-bit triangle and its noise channel. Its volume moves in 16 steps, as on the hardware. An **arpeggio** cycles fast through an octave, a major or minor triad or a power chord, faking a chord on one voice.

**pipe** blends a soft, nearly pure tone with **breath** noise tuned around it. **overblow** pushes it up onto the octave and twelfth, as blowing harder does.

## Bowed

The almond. A modelled string: the bow grips the string and lets it slip, over and over. More **bow pressure** sounds scratchier, and **bow position** moves the bow towards the bridge for a thinner tone. A held note keeps sounding as long as the note lasts, so it pairs well with [hold](fields.md#transformers-teal-dashed).

## Shepard, bowl and cloud

**shepard** stacks octaves that slide up together under a fixed window, each fading in at the bottom and out at the top: the endless staircase. Set its **speed** and whether it rises or falls. **fifth** layers a fifth over every octave.

**bowl** is a singing bowl. **rub** keeps it singing, **beating** sets how fast its paired partials wobble, and each trigger strikes it, ringing out over the **strike decay**.

**cloud** sprays short grains over the sound's chord (root, 5th, 9th, 10th). **density** is grains per second, **grain size** their length, and **spray** how far they scatter in octaves and time. Triggers thicken it for a moment.

## Glide

The [glide](fields.md#transformers-teal-dashed) transformer slides notes in from the previous one. Subtractive, FM, wavetable, organ, chip, pipe and bowed follow it. Bass slides at its own **glide** time. The other sounds ignore it.

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
