import type { DeviceType } from "./deviceClassifier";

const ALLOWED_IMPORTS = /^(?:import maxpylang|from maxpylang[\s.].*|import maxpylang\s+as\s+\w+|import json|from amxd\s+import.*|import struct|import numpy|from numpy.*)$/;

const DANGEROUS_PATTERNS = [
  /\beval\s*\(/,
  /\bexec\s*\(/,
  /\bcompile\s*\(/,
  /\bgetattr\s*\(/,
  /\b__import__\b/,
  /\b__builtins__\b/,
  /\bglobals\s*\(/,
  /\blocals\s*\(/,
];

export class ExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionError";
  }
}

// Closing ~~~ must not be followed by a word char (so ~~~description
// can't accidentally terminate a ~~~summary block and vice versa).
const CLOSING_FENCE = /~~~(?!\w)/.source;

export function extractDescription(llmResponse: string): string | undefined {
  const re = new RegExp(`~~~description\\s*\\n([\\s\\S]*?)${CLOSING_FENCE}`);
  const match = re.exec(llmResponse);
  return match ? match[1].trim() : undefined;
}

export function extractSummary(llmResponse: string): string | undefined {
  const re = new RegExp(`~~~summary\\s*\\n([\\s\\S]*?)${CLOSING_FENCE}`);
  const match = re.exec(llmResponse);
  return match ? match[1].trim() : undefined;
}

export function extractCode(llmResponse: string, deviceType?: DeviceType): string {
  const pattern = /```python\s*\n([\s\S]*?)```/g;
  const matches: string[] = [];
  let match;
  while ((match = pattern.exec(llmResponse)) !== null) {
    matches.push(match[1]);
  }

  if (matches.length === 0) {
    throw new ExtractionError(
      "No Python code block found in the response. Expected ```python ... ``` fence."
    );
  }

  const code = matches.reduce((a, b) => (a.length >= b.length ? a : b)).trim();

  validate(code, deviceType);
  return code;
}

function validate(code: string, deviceType?: DeviceType): void {
  for (const line of code.split("\n")) {
    const stripped = line.trim();
    if (stripped.startsWith("import ") || stripped.startsWith("from ")) {
      const importStmt = stripped.split("#")[0].trim();
      if (!ALLOWED_IMPORTS.test(importStmt)) {
        throw new ExtractionError(
          `Forbidden import: ${importStmt}. Only maxpylang, json, amxd, struct, and numpy imports are allowed.`
        );
      }
    }
  }

  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(code)) {
      throw new ExtractionError(
        `Generated code contains forbidden pattern: ${pattern.source}`
      );
    }
  }

  if (!code.includes("maxpylang")) {
    throw new ExtractionError("Generated code does not import maxpylang.");
  }

  if (!code.includes("MaxPatch")) {
    throw new ExtractionError("Generated code does not create a MaxPatch.");
  }

  if (deviceType === "midi_effect") {
    if (!code.includes("noteout") && !code.includes("midiout")) {
      throw new ExtractionError(
        "MIDI effect code must use noteout or midiout for output, not plugout~."
      );
    }
  } else if (deviceType === "instrument" || deviceType === "audio_effect") {
    if (!code.includes("plugout~")) {
      throw new ExtractionError(
        `${deviceType === "instrument" ? "Instrument" : "Audio effect"} code must use plugout~ for output.`
      );
    }
  } else {
    if (!code.includes("plugout~") && !code.includes("midiout") && !code.includes("noteout")) {
      throw new ExtractionError("Generated code has no M4L output (plugout~, midiout, or noteout).");
    }
  }

  if (!code.includes(".save(") && !code.includes("save_amxd")) {
    throw new ExtractionError("Generated code does not save the patch.");
  }

  // Validate patch method calls — catch hallucinated methods like patch.disconnect()
  const VALID_PATCH_METHODS = new Set([
    'set_position', 'place', 'place_obj', 'connect', 'save',
    'get_json', 'replace', 'delete', 'check', 'reorder', 'inspect',
  ]);

  const methodCalls = [...code.matchAll(/\bpatch\.(\w+)\s*\(/g)];
  for (const match of methodCalls) {
    if (!VALID_PATCH_METHODS.has(match[1])) {
      throw new ExtractionError(
        `Generated code calls patch.${match[1]}() which does not exist on MaxPatch. ` +
        `Valid methods: ${[...VALID_PATCH_METHODS].join(', ')}`
      );
    }
  }
}
