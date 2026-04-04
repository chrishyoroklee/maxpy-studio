import { unzipSync } from "fflate";

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
 * Extract the .maxpat JSON from a .amxd Uint8Array.
 *
 * An .amxd file is a zip archive containing (at least) one `.maxpat` file.
 * This function unzips the archive, locates the first `.maxpat` entry,
 * parses it as JSON, and returns the typed result.
 */
export function extractMaxpat(amxdBytes: Uint8Array): MaxPatJson {
  if (!amxdBytes || amxdBytes.length === 0) {
    throw new MaxpatExtractionError("Empty or missing .amxd bytes.");
  }

  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(amxdBytes);
  } catch (err) {
    throw new MaxpatExtractionError(
      `Failed to unzip .amxd file: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const maxpatPath = Object.keys(entries).find((name) =>
    name.endsWith(".maxpat")
  );

  if (!maxpatPath) {
    const fileList = Object.keys(entries).join(", ");
    throw new MaxpatExtractionError(
      `No .maxpat file found inside .amxd archive. Files found: ${fileList || "(none)"}`
    );
  }

  const maxpatBytes = entries[maxpatPath];
  let jsonString: string;
  try {
    jsonString = new TextDecoder("utf-8").decode(maxpatBytes);
  } catch (err) {
    throw new MaxpatExtractionError(
      `Failed to decode .maxpat file as UTF-8: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (err) {
    throw new MaxpatExtractionError(
      `Failed to parse .maxpat JSON: ${err instanceof Error ? err.message : String(err)}`
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
