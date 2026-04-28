export type DeviceType = "audio_effect" | "instrument" | "midi_effect";

const MIDI_EFFECT_KEYWORDS = [
  "sequencer", "arpeggiator", "arpeggio", "chord generator",
  "midi effect", "midi processor", "step sequencer", "note sequence",
  "transposer", "midi filter", "midi routing",
];

const INSTRUMENT_KEYWORDS = [
  "synth", "synthesizer", "instrument", "piano", "organ", "bass",
  "drum machine", "sampler", "oscillator", "keys", "strings", "pluck",
  "lead synth", "pad synth", "hihat", "hi-hat", "kick", "snare",
  "drum synth", "bass synth",
];

const AUDIO_EFFECT_KEYWORDS = [
  "reverb", "delay", "echo", "chorus", "flanger", "phaser",
  "distortion", "overdrive", "fuzz", "compressor", "limiter",
  "eq", "equalizer", "filter effect", "tremolo", "vibrato",
  "saturation", "bitcrusher", "lo-fi", "lofi", "waveshaper",
  "gate", "noise gate", "de-esser", "stereo widener", "panner",
  "audio effect", "effect pedal", "fx",
];

export function classifyDeviceType(prompt: string): DeviceType {
  const lower = prompt.toLowerCase();
  if (MIDI_EFFECT_KEYWORDS.some(k => lower.includes(k))) return "midi_effect";
  if (INSTRUMENT_KEYWORDS.some(k => lower.includes(k))) return "instrument";
  if (AUDIO_EFFECT_KEYWORDS.some(k => lower.includes(k))) return "audio_effect";
  return "audio_effect";
}
