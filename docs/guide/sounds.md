# Sounds

Sounds are the voices: warm-white shapes on the canvas. Each type has its own glyph in the palette. Hover a palette item to see its name.

## Event and sustained

| Type | Kind | Character |
|---|---|---|
| **subtractive** | event | Detuned saw/square oscillators through a resonant filter with its own envelope. |
| **fm** | event | Two-operator FM: bells, keys, glass. |
| **pluck** | event | A plucked string (Karplus-Strong). |
| **percussion** | event | A body that blends sine and noise, with a pitch sweep. |
| **pad** | sustained | A slow-swelling unison pad with a breathing filter. |
| **drone** | sustained | Saws over a sine sub, drifting slowly. |
| **additive** | sustained | Stacked partials: organ-like to hollow and shimmering. |
| **noise** | sustained | A focused band of noise: wind, surf, crackle. |

**Event** sounds play a note each time something triggers them. **Sustained** sounds play all the time. A trigger becomes an accent: a swell or a brighter moment. Sustained sounds also follow pitch changes smoothly, so moving one through a pitch map glides between notes.

## Filled or hollow

An event sound inside a generator is **driven**, and it's drawn filled. An event sound outside every generator is **hollow**: it listens for ripples from other sounds and answers them. See [Ripples and retriggers](retrigger.md).

## Size is loudness

Drag the square **▪ size handle** on a selected sound. A size of 48 is 0 dB, and bigger is louder. Size also scales how far its ripples travel.

## Pitch and note

A sound's pitch comes from the [map field](maps.md) it sits in, usually the y axis of an XY field. Everything snaps to the patch's key and scale (set in the bottom bar).

Where no map sets pitch, the sound plays its own **note**. The default is middle C (C4). To change it, select the sound and drag or scroll the **note** chip in its bar. You can also press <kbd>↑</kbd> <kbd>↓</kbd>, or hold <kbd>shift</kbd> to move an octave. The bar tells you when a map is setting the pitch instead.

## Internals

Double-click a sound, double-tap it on touch, or zoom right in on it, to open its **panel**: oscillators, filter and envelopes, depending on the type. Drag the sliders and envelope points. Press <kbd>esc</kbd> or zoom back out to close it.

Map fields can also drive any of these parameters by position. See [param targets](maps.md#targets).
