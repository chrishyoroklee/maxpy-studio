// ---------------------------------------------------------------------------
// TypeScript types for the .maxpat JSON structure
// ---------------------------------------------------------------------------

/** A single box (object) inside a patcher. */
export interface BoxJson {
  id: string;
  maxclass: string;
  text?: string;
  patching_rect?: [number, number, number, number];
  numinlets?: number;
  numoutlets?: number;
  outlettype?: string[];
  /** Nested sub-patcher (for p / poly~ / etc.) */
  patcher?: PatcherJson;
  [key: string]: unknown;
}

/** A single patch cord connecting two objects. */
export interface PatchLineJson {
  source: [string, number];
  destination: [string, number];
  order?: number;
  [key: string]: unknown;
}

/** The top-level patcher dictionary. */
export interface PatcherJson {
  fileversion: number;
  appversion?: Record<string, unknown>;
  rect?: [number, number, number, number];
  boxes: { box: BoxJson }[];
  lines: { patchline: PatchLineJson }[];
  [key: string]: unknown;
}

/** Root of a .maxpat JSON file. */
export interface MaxPatJson {
  patcher: PatcherJson;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class MaxpatExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MaxpatExtractionError";
  }
}

// ---------------------------------------------------------------------------
// Core extraction function
// ---------------------------------------------------------------------------

/**
 * Extract the patcher JSON from .amxd bytes.
 *
 * The .amxd format is a binary wrapper with three chunks:
 *   ampf (device type) | meta (empty) | ptch (patcher JSON + null byte)
 *
 * Each chunk: [4-byte tag][4-byte uint32 LE size][size bytes data]
 */
export function extractMaxpat(amxdBytes: Uint8Array): MaxPatJson {
  if (!amxdBytes || amxdBytes.length === 0) {
    throw new MaxpatExtractionError("Empty or missing .amxd bytes.");
  }

  const view = new DataView(amxdBytes.buffer, amxdBytes.byteOffset, amxdBytes.byteLength);
  const decoder = new TextDecoder("utf-8");
  let offset = 0;

  while (offset + 8 <= amxdBytes.length) {
    // Read 4-byte chunk tag
    const tag = decoder.decode(amxdBytes.slice(offset, offset + 4));
    // Read 4-byte uint32 LE size
    const size = view.getUint32(offset + 4, true);
    offset += 8;

    if (tag === "ptch") {
      if (offset + size > amxdBytes.length) {
        throw new MaxpatExtractionError(
          `ptch chunk size (${size}) exceeds file bounds.`
        );
      }

      // ptch data is null-terminated JSON
      let jsonBytes = amxdBytes.slice(offset, offset + size);
      // Strip trailing null bytes
      while (jsonBytes.length > 0 && jsonBytes[jsonBytes.length - 1] === 0) {
        jsonBytes = jsonBytes.slice(0, -1);
      }

      let jsonString: string;
      try {
        jsonString = decoder.decode(jsonBytes);
      } catch (err) {
        throw new MaxpatExtractionError(
          `Failed to decode ptch chunk as UTF-8: ${err instanceof Error ? err.message : String(err)}`
        );
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonString);
      } catch (err) {
        throw new MaxpatExtractionError(
          `Failed to parse patcher JSON: ${err instanceof Error ? err.message : String(err)}`
        );
      }

      if (
        typeof parsed !== "object" ||
        parsed === null ||
        !("patcher" in parsed)
      ) {
        throw new MaxpatExtractionError(
          "Invalid .maxpat structure: missing top-level 'patcher' key."
        );
      }

      return parsed as MaxPatJson;
    }

    offset += size;
  }

  throw new MaxpatExtractionError("No ptch chunk found in .amxd file.");
}
