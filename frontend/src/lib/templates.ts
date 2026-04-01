export interface TemplateMeta {
  name: string;
  label: string;
  description: string;
  type: "audio_effect" | "instrument" | "midi_effect";
}

export const TEMPLATES: TemplateMeta[] = [
  { name: "m4l_chorus", label: "Chorus", description: "Stereo widening with rate & depth", type: "audio_effect" },
  { name: "m4l_tremolo", label: "Tremolo", description: "Amplitude modulation with sync", type: "audio_effect" },
  { name: "m4l_eq", label: "3-Band EQ", description: "Shape lows, mids & highs", type: "audio_effect" },
  { name: "m4l_reverb", label: "Reverb", description: "Room simulation with decay", type: "audio_effect" },
  { name: "m4l_stereo_delay", label: "Stereo Delay", description: "Echo with feedback", type: "audio_effect" },
  { name: "m4l_lofi", label: "Lo-Fi", description: "Bit reduction & aliasing", type: "audio_effect" },
  { name: "m4l_mono_synth", label: "Mono Synth", description: "Subtractive mono synthesizer", type: "instrument" },
  { name: "m4l_hihat", label: "Hi-Hat", description: "Drum synthesis hi-hat", type: "instrument" },
  { name: "m4l_distortion", label: "Distortion", description: "Tube screamer style overdrive", type: "audio_effect" },
  { name: "m4l_bass_synth", label: "Bass Synth", description: "Moog-inspired subtractive bass", type: "instrument" },
  { name: "m4l_compressor", label: "Compressor", description: "SSL-style bus compressor", type: "audio_effect" },
];

/**
 * Fetch a template's Python source code from the bundled static assets.
 */
export async function fetchTemplateCode(name: string): Promise<string> {
  const response = await fetch(`/templates/${name}.py`);
  if (!response.ok) {
    throw new Error(`Template ${name} not found`);
  }
  return response.text();
}
