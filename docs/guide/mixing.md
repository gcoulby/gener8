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

To fade in and out, add `fade` after the length: `10m fade` fades over 3 seconds at each end. Set the time with `fade:10s`, or set each end on its own with `in:` and `out:`, e.g. `1:00:00 in:2s out:30s`. A fade length on its own is in seconds. The fades are smooth S-curves, starting and ending in silence. The entry remembers what you last typed.

The same render from the command line, with the same fades, matches the in-app one bit for bit:

```sh
npm run render patch.json 3600 out.wav
npm run render patch.json 3600 out.wav -- --fade 2,30   # 2 s in, 30 s out
```

## Video

To get a video, for YouTube say, press <kbd>shift</kbd>+<kbd>V</kbd> or **video…**. Type a length as for a render, optionally followed by a frame rate, a size and [fades](#render): `5` is five minutes at 1080p and 30 fps, `90s 60fps fade` is 90 seconds at 60 fps fading in and out, and `1:00:00 4k out:30s` is an hour in 4K with a 30-second fade out. The picture fades from and to black along with the sound. The sizes are `720p`, `1080p`, `1440p` and `4k`, all 16:9. 30 fps suits the slow motion of most patches and halves the render time and file size compared with 60 fps.

The video shows the whole window, not only the canvas: the palette, minimap, bar and timeline, plus anything open, such as the mixer or a selected object's bar. It frames the patch as your window does now, widened or narrowed to 16:9. As with a render, the patch plays from a fresh start, faster than real time and in the background. The sound comes from the same render as the picture, so the two stay in step. Everything is drawn [lit](shortcuts.md), at full brightness, because there's no cursor in the video.

Every video carries the GENER8 logo in its usual top-left spot. With a fade, the logo starts large in the middle of the dark screen, like a title card, and glides up into place as the patch fades in. At the end it comes back to the middle as the patch fades out.

### Shorts

Add `short` for a portrait video to post as a YouTube Short, an Instagram Reel or a TikTok: 1080 × 1920, a minute long unless you type a length, so `short` alone or `short 30s fade`. A short shows just the elements: sounds, fields, ripples and the generators' moving parts. It leaves out the palette, bar, minimap, panels, labels and the map fields underneath. It frames everything your window shows, fitted into the portrait frame, so zoom and pan to frame the patch first. The logo sits at the top centre.

In Chrome and Edge, you choose where to save the MP4 first, and it's written straight to disk as it renders. In other browsers it downloads when it's done. You also get a JSON file with the patch and seed. Expect roughly 3.5 GB for an hour at 1080p and 30 fps. The video is H.264 with AAC audio, falling back to other codecs where the browser can't encode those. The audio is compressed, so it isn't bit-identical to a WAV render. Use **render…** when you want the exact audio.

## Saving, opening and new

| | |
|---|---|
| **save** (<kbd>⌘S</kbd>) | Download the patch as JSON. |
| **open** (<kbd>⌘O</kbd>) | Load a patch file. You can also drop one on the canvas. |
| **new** | Start an empty stage (keeps the tempo, key and seed). |
| **random** (<kbd>r</kbd>) | A new patch from a random seed. |
| **seed…** | Type a seed: a number, or any text. |
| **examples ▾** | The bundled demos, framed in the window as they load. |

Your patch is also saved in the browser as you go. Replacing an edited patch asks you to press again to confirm.

## Sharing

**share** copies a link with the whole patch inside it. Nothing is uploaded: the patch lives in the part of the link after `#`, which browsers never send to a server.

- An unedited random patch shares as a short **seed link**.
- Anything else shares as a **patch link** of about 1 to 2 thousand characters.

Opening a link loads the patch but never starts audio on its own. The patch you had before is kept in the browser. Links can hold up to 24 sounds, 12 fields and 8 map fields.

You can link to these docs too: add `#docs/maps` (or any page name) to the app's address.
