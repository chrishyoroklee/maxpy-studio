import type { MaxPatJson, BoxJson, PatchLineJson } from "./maxpatExtractor";

export type ValidationSeverity = "error" | "warning" | "info";

export interface ValidationIssue {
  severity: ValidationSeverity;
  code: string;
  message: string;
  objectId?: string;
}

export interface ValidationResult {
  issues: ValidationIssue[];
  passed: boolean; // true if no errors (warnings OK)
}

/** Control-only objects that should not receive signal connections. */
const CONTROL_ONLY_OBJECTS = new Set([
  "select", "counter", "toggle", "button", "number",
  "message", "print", "route", "gate", "switch",
  "pack", "unpack", "trigger",
]);

function boxText(box: BoxJson): string {
  return box.text ?? box.maxclass ?? "";
}

function boxName(box: BoxJson): string {
  return boxText(box).split(/\s+/)[0];
}

export function validatePatch(maxpat: MaxPatJson): ValidationResult {
  const issues: ValidationIssue[] = [];
  const patcher = maxpat.patcher;
  const boxes = patcher.boxes ?? [];
  const lines = patcher.lines ?? [];

  // Build box lookup by id
  const boxMap = new Map<string, BoxJson>();
  for (const wrapper of boxes) {
    const box = wrapper.box;
    if (box?.id) {
      boxMap.set(box.id, box);
    }
  }

  // --- Errors ---

  // 1. EMPTY_PATCH
  if (boxes.length === 0) {
    issues.push({
      severity: "error",
      code: "EMPTY_PATCH",
      message: "Patch contains no objects.",
    });
    return { issues, passed: false };
  }

  // 2. NO_OUTPUT
  const hasPlugout = [...boxMap.values()].some((b) => boxText(b).includes("plugout~"));
  const hasMidiout = [...boxMap.values()].some((b) => boxText(b).includes("midiout"));
  if (!hasPlugout && !hasMidiout) {
    issues.push({
      severity: "error",
      code: "NO_OUTPUT",
      message: "No output object found (plugout~ or midiout).",
    });
  }

  // Iterate patchlines once for connection checks
  const destinationIds = new Set<string>();

  for (const wrapper of lines) {
    const pl: PatchLineJson = wrapper.patchline;
    const srcId = pl.source[0];
    const srcOutlet = pl.source[1];
    const dstId = pl.destination[0];
    const dstInlet = pl.destination[1];

    const srcBox = boxMap.get(srcId);
    const dstBox = boxMap.get(dstId);

    // 3. DANGLING_CONNECTION
    if (!srcBox) {
      issues.push({
        severity: "error",
        code: "DANGLING_CONNECTION",
        message: `Patchline references nonexistent source object "${srcId}".`,
        objectId: srcId,
      });
    }
    if (!dstBox) {
      issues.push({
        severity: "error",
        code: "DANGLING_CONNECTION",
        message: `Patchline references nonexistent destination object "${dstId}".`,
        objectId: dstId,
      });
    }

    // 4. OUT_OF_BOUNDS
    if (srcBox) {
      const numoutlets = srcBox.numoutlets ?? 0;
      if (srcOutlet >= numoutlets) {
        issues.push({
          severity: "error",
          code: "OUT_OF_BOUNDS",
          message: `Source "${boxName(srcBox)}" outlet ${srcOutlet} out of bounds (has ${numoutlets} outlets).`,
          objectId: srcId,
        });
      }
    }
    if (dstBox) {
      const numinlets = dstBox.numinlets ?? 0;
      if (dstInlet >= numinlets) {
        issues.push({
          severity: "error",
          code: "OUT_OF_BOUNDS",
          message: `Destination "${boxName(dstBox)}" inlet ${dstInlet} out of bounds (has ${numinlets} inlets).`,
          objectId: dstId,
        });
      }
    }

    // Track destination ids for DISCONNECTED_OUTPUT check
    if (dstBox) {
      destinationIds.add(dstId);
    }

    // 7. SIGNAL_CONTROL_MISMATCH
    if (srcBox && dstBox) {
      const outletTypes = srcBox.outlettype ?? [];
      if (srcOutlet < outletTypes.length && outletTypes[srcOutlet] === "signal") {
        const dstName = boxName(dstBox);
        if (CONTROL_ONLY_OBJECTS.has(dstName)) {
          issues.push({
            severity: "warning",
            code: "SIGNAL_CONTROL_MISMATCH",
            message: `Signal outlet of "${boxName(srcBox)}" connected to control-only object "${dstName}".`,
            objectId: dstId,
          });
        }
      }
    }
  }

  // --- Warnings ---

  // 5. NO_CLIP_BEFORE_OUTPUT
  if (hasPlugout) {
    const hasClip = [...boxMap.values()].some((b) => boxText(b).startsWith("clip~"));
    if (!hasClip) {
      issues.push({
        severity: "warning",
        code: "NO_CLIP_BEFORE_OUTPUT",
        message: "No clip~ found before plugout~ -- consider adding clip~ -1. 1. for speaker safety.",
      });
    }
  }

  // 6. DISCONNECTED_OUTPUT
  for (const box of boxMap.values()) {
    const text = boxText(box);
    if (text.includes("plugout~") && !destinationIds.has(box.id)) {
      issues.push({
        severity: "warning",
        code: "DISCONNECTED_OUTPUT",
        message: "plugout~ is not connected as a destination of any patchline.",
        objectId: box.id,
      });
    }
  }

  // --- Info ---

  // 8. NO_PRESENTATION_MODE
  if ((patcher as Record<string, unknown>).openinpresentation !== 1) {
    issues.push({
      severity: "info",
      code: "NO_PRESENTATION_MODE",
      message: "Presentation mode is not enabled (openinpresentation != 1).",
    });
  }

  // 9. NO_AUDIO_INPUT
  if (hasPlugout) {
    const hasPlugin = [...boxMap.values()].some((b) => boxText(b).includes("plugin~"));
    const hasNotein = [...boxMap.values()].some((b) => boxText(b).includes("notein"));
    if (!hasPlugin && !hasNotein) {
      issues.push({
        severity: "info",
        code: "NO_AUDIO_INPUT",
        message: "Has plugout~ but no audio input (plugin~) or MIDI input (notein).",
      });
    }
  }

  const hasErrors = issues.some((i) => i.severity === "error");
  return { issues, passed: !hasErrors };
}
