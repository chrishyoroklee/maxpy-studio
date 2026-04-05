/**
 * subpatcherSaver.ts
 *
 * Converts a generated .maxpat (designed for M4L with plugin~/plugout~)
 * into a bpatcher-compatible sub-patcher that uses inlet~/outlet~ instead.
 *
 * The wrapper M4L device provides plugin~/plugout~ and routes audio through
 * a bpatcher that loads the generated .maxpat dynamically.
 */

import type { MaxPatJson, BoxJson } from "./maxpatExtractor";

/**
 * Transform a M4L patcher into a sub-patcher compatible with bpatcher.
 *
 * Rules:
 * - plugin~ boxes → inlet~ boxes (stereo: two inlets)
 * - plugout~ boxes → outlet~ boxes (stereo: two outlets)
 * - All other boxes unchanged
 * - All patchlines unchanged (IDs stay the same)
 * - Presentation mode preserved
 */
export function convertToSubpatcher(maxpat: MaxPatJson): MaxPatJson {
  const clone: MaxPatJson = JSON.parse(JSON.stringify(maxpat));
  const boxes = clone.patcher?.boxes;
  if (!boxes) return clone;

  // Track plugin~ boxes to replace with paired inlet~ objects
  // plugin~ has 2 outlets (L, R), so we need 2 inlet~ objects
  // But the IDs must stay consistent for patchlines to resolve.
  //
  // Simpler approach: replace plugin~ box in-place with a single inlet~
  // that has 2 outlets (matching the original plugin~ outlet structure).
  // But inlet~ only has 1 outlet. So we need a different strategy:
  //
  // Strategy: replace plugin~ with a "wrapper" using Max's built-in
  // multi-channel approach — split stereo via pack/unpack doesn't work
  // for signals. Instead: create TWO inlet~ objects with distinct IDs,
  // and rewrite patchlines that referenced plugin~ outlets 0 and 1 to
  // reference the two new inlet~ boxes respectively.

  const newBoxes: Array<{ box: BoxJson }> = [];
  const outletRemap = new Map<string, string[]>(); // old plugin~ id → [leftInletId, rightInletId]
  const inletRemap = new Map<string, string[]>(); // old plugout~ id → [leftOutletId, rightOutletId]
  let nextId = 10000;

  for (const entry of boxes) {
    const box = entry.box;
    const text = box.text ?? box.maxclass ?? "";

    if (text.trim().startsWith("plugin~")) {
      // Replace with two inlet~ boxes (L and R)
      const leftId = `sub-in-L-${nextId++}`;
      const rightId = `sub-in-R-${nextId++}`;
      const rect = box.patching_rect ?? [0, 0, 40, 22];
      newBoxes.push({
        box: {
          ...box,
          id: leftId,
          maxclass: "newobj",
          text: "inlet~",
          numinlets: 0,
          numoutlets: 1,
          outlettype: ["signal"],
          patching_rect: [rect[0], rect[1], 30, 22],
        },
      });
      newBoxes.push({
        box: {
          ...box,
          id: rightId,
          maxclass: "newobj",
          text: "inlet~",
          numinlets: 0,
          numoutlets: 1,
          outlettype: ["signal"],
          patching_rect: [rect[0] + 40, rect[1], 30, 22],
        },
      });
      outletRemap.set(box.id, [leftId, rightId]);
    } else if (text.trim().startsWith("plugout~")) {
      // Replace with two outlet~ boxes (L and R)
      const leftId = `sub-out-L-${nextId++}`;
      const rightId = `sub-out-R-${nextId++}`;
      const rect = box.patching_rect ?? [0, 0, 40, 22];
      newBoxes.push({
        box: {
          ...box,
          id: leftId,
          maxclass: "newobj",
          text: "outlet~",
          numinlets: 1,
          numoutlets: 0,
          outlettype: [],
          patching_rect: [rect[0], rect[1], 34, 22],
        },
      });
      newBoxes.push({
        box: {
          ...box,
          id: rightId,
          maxclass: "newobj",
          text: "outlet~",
          numinlets: 1,
          numoutlets: 0,
          outlettype: [],
          patching_rect: [rect[0] + 40, rect[1], 34, 22],
        },
      });
      inletRemap.set(box.id, [leftId, rightId]);
    } else {
      newBoxes.push(entry);
    }
  }

  clone.patcher.boxes = newBoxes;

  // Rewrite patchlines to route through new inlet~/outlet~ box IDs
  const lines = clone.patcher.lines;
  if (lines) {
    for (const lineEntry of lines) {
      const pl = lineEntry.patchline;
      // Source references a plugin~ outlet → redirect to the matching inlet~ box
      const srcRemap = outletRemap.get(pl.source[0]);
      if (srcRemap) {
        const outletIdx = pl.source[1];
        if (outletIdx === 0 || outletIdx === 1) {
          pl.source = [srcRemap[outletIdx], 0];
        }
      }
      // Destination references a plugout~ inlet → redirect to matching outlet~ box
      const dstRemap = inletRemap.get(pl.destination[0]);
      if (dstRemap) {
        const inletIdx = pl.destination[1];
        if (inletIdx === 0 || inletIdx === 1) {
          pl.destination = [dstRemap[inletIdx], 0];
        }
      }
    }
  }

  return clone;
}

/**
 * Serialize a converted sub-patcher to a compact JSON string
 * suitable for transmitting through jweb's outlet.
 */
export function serializeSubpatcher(maxpat: MaxPatJson): string {
  return JSON.stringify(maxpat);
}
