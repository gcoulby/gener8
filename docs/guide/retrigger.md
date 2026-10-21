# Ripples and retriggers

Every note an event sound plays sends out a **retrigger**: a ripple ring by default. Hollow sounds it reaches answer, delayed by the distance, so layout alone gives you call and response. Retriggers travel at a tempo-synced 240 canvas units per beat, so the same layout keeps the same rhythm at any tempo.

## Who answers

- **Hollow** event sounds (outside every generator) listen and answer.
- **Sustained** sounds listen too. A retrigger gives them an accent.
- **Driven** sounds (inside a generator) don't listen. They only send.

Answers send out retriggers of their own, up to a chain four deep. Each sound also ignores retriggers for a quarter of a beat after answering one, which keeps feedback under control.

## The retrigger row

Select an event sound and its bar has a **retrigger** row:

| Control | |
|---|---|
| **◎ ripple** | An expanding ring that reaches every listener in range. |
| **→ point** | One trace fired at an **angle**: 0° is up, 90° is right. It hits listeners it passes through. |
| **⋔ multi** | **count** traces fanned across **spread** degrees around the angle. 360° spaces them evenly all the way round. |
| **reach** | How far it travels, as a multiple of the sound's size. The default is ×6, and 0 turns retriggers off. |
| **fall-off** | How much strength it loses on the way. 100% fades to nothing at the reach; 0% hits as hard far away as next door. |
| **⊣ stop on impact** | The ring, or each trace, stops at the first listener it reaches. |

## The ● handle

A selected event sound has a **● handle** out from its centre. Its **direction** is the angle and its **distance** is the reach, so one drag aims and sizes the retrigger. Hovering shows the ring or traces at full reach. Drag it onto the sound itself to turn retriggers off.

If a [map field](maps.md#targets) sets reach, angle, spread or fall-off where the sound sits, the handle's tag tells you what the map is setting.

## Ideas

- **Chains.** Line up hollow sounds with **point** and **stop on impact**: each one passes the note to the next, like dominoes.
- **Echo rings.** A driven sound in the middle of a circle of hollow sounds, with **ripple** and fall-off 0%. Every hit makes the circle answer at once.
- **Less ripple noise.** If everything answers everything, lower the reach, turn on stop on impact, or [spread the patch out](maps.md#recipes).
