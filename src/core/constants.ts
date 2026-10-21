// Fixed engine constants. See DESIGN.md §1, §2, §5.

export const SR = 48000;
export const BLOCK = 128;
export const PPQ = 960;

// Ripples
export const RIPPLE_SPEED = 240; // world units per beat
export const MAX_CHAIN = 4;
export const REFRACTORY_BEATS = 0.25;
export const MAX_RIPPLES = 64;
export const RIPPLE_REACH = 6; // × emitter diameter

// Voices
export const VOICE_BUDGET = 96;

// Mappings
export const STAGE_HALF = 800; // x → pan
export const UNITY_SIZE = 48; // diameter at 0 dB
export const UNITS_PER_SEMITONE = 10; // y → pitch
export const Y0_MIDI = 60;
export const MIDI_MIN = 24;
export const MIDI_MAX = 96;

// History and capture
export const HISTORY_SECONDS = 300;
export const SNAPSHOT_SECONDS = 10;
export const CAPTURE_SECONDS = 30;
/** Longest offline render (a fresh start of the current patch); 1 h of float WAV ≈ 1.4 GB. */
export const RENDER_MAX_SECONDS = 3600;
