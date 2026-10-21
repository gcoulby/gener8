# Mixing, capture and sharing

## The mixer

Click **mixer ▴** in the bar. Every sound gets a fader with **M** (mute) and **S** (solo). Every bus FX (delay, chorus, reverb, shimmer) gets a return fader, and there's a master. Meters are live.

- Drag a fader or scroll over it. Double-click a fader to reset it to 0 dB.
- Click a sound's name to select it on the canvas.

Levels, mutes and solos are saved in the patch, so they're part of captures and links. **vol** in the bar is the master level as well: drag it or scroll over it.

## Tempo, key and seed

In the right half of the bar:

| | |
|---|---|
| **bpm** | Click it in time to tap the tempo (or press <kbd>t</kbd>). Scroll to change it by one. |
| **root** | Scroll to change the key's root note. |
| **scale** | Click or scroll to change scale. |
| **seed** | The seed behind every random choice in the patch. Click for a new one; scroll to step. |

## The timeline: going back

The strip above the bar holds the last five minutes of what you did. Drag along it to hear and see the patch as it was. Let go to **branch** from that moment, or press <kbd>esc</kbd> to cancel. Nothing is lost by experimenting.

## Capture

Press <kbd>c</kbd> or **● capture** to save the last 30 seconds as a WAV, plus a JSON file with the patch, seed and every edit. That JSON re-renders the same WAV bit for bit:

```sh
npm run render-capture capture.json capture.wav
```

## Render

Capture records what you just heard. To get a longer take, press <kbd>shift</kbd>+<kbd>C</kbd> or **render…** and type a length of up to an hour: `5` (minutes), `90s`, `1:30` or `1:00:00`. The current patch is rendered from a fresh start, exactly as it would sound if you reloaded and pressed play, but faster than real time and in the background, so you can keep playing. While it runs, the bar shows its progress. Click it again to cancel. When it finishes, you get a WAV and a JSON file with the patch and seed. An hour is about 1.4 GB of 32-bit float audio, and a typical patch takes a few minutes to render it.

The same render from the command line:

```sh
npm run render patch.json 3600 out.wav
```

## Saving, opening and new

| | |
|---|---|
| **save** (<kbd>⌘S</kbd>) | Download the patch as JSON. |
| **open** (<kbd>⌘O</kbd>) | Load a patch file. You can also drop one on the canvas. |
| **new** | Start an empty stage (keeps the tempo, key and seed). |
| **random** (<kbd>r</kbd>) | A new patch from a random seed. |
| **seed…** | Type a seed: a number, or any text. |
| **examples ▾** | The bundled demos. |

Your patch is also saved in the browser as you go. Replacing an edited patch asks you to press again to confirm.

## Sharing

**share** copies a link with the whole patch inside it. Nothing is uploaded: the patch lives in the part of the link after `#`, which browsers never send to a server.

- An unedited random patch shares as a short **seed link**.
- Anything else shares as a **patch link** of about 1 to 2 thousand characters.

Opening a link loads the patch but never starts audio on its own. The patch you had before is kept in the browser. Links can hold up to 24 sounds, 12 fields and 8 map fields.

You can link to these docs too: add `#docs/maps` (or any page name) to the app's address.
