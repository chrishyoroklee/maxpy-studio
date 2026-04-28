"""
Max for Live Note Transposer (MIDI Effect)
============================================
A MIDI note transposer with semitone offset control.

  Transpose — semitone offset (-24 to +24)
  Velocity  — optional velocity override (0 = pass-through)

Signal flow:
  notein (MIDI notes from Ableton)
    → pitch + transpose offset (via + object)
      → clip 0 127 (keep in valid MIDI range)
        → noteout (MIDI note output to Ableton)
  velocity passes through unchanged unless overridden.

Usage in Ableton Live:
  1. Drag the .amxd onto a MIDI track (before an instrument)
  2. Set Transpose dial to shift notes up or down by semitones
  3. Incoming MIDI notes are shifted and forwarded to the instrument
"""

import json
import maxpylang as mp
from maxpylang.maxobject import MaxObject

patch = mp.MaxPatch()


def place_raw(obj_dict, x, y):
    obj = MaxObject(obj_dict, from_dict=True)
    patch.set_position(x, y)
    patch.place_obj(obj, position=[float(x), float(y)])
    return obj


# ============================================================
# PRESENTATION BACKGROUND
# ============================================================

panel = place_raw({
    "box": {
        "maxclass": "panel", "text": "panel",
        "numinlets": 1, "numoutlets": 0, "outlettype": [],
        "patching_rect": [600.0, 100.0, 200.0, 120.0],
        "presentation": 1, "presentation_rect": [0.0, 0.0, 200.0, 120.0],
        "bgcolor": [0.10, 0.14, 0.22, 1.0],
        "mode": 0, "rounded": 0, "background": 1,
    }
}, 600, 100)

header = place_raw({
    "box": {
        "maxclass": "panel", "text": "panel",
        "numinlets": 1, "numoutlets": 0, "outlettype": [],
        "patching_rect": [600.0, 90.0, 200.0, 24.0],
        "presentation": 1, "presentation_rect": [0.0, 0.0, 200.0, 24.0],
        "bgcolor": [0.20, 0.55, 0.45, 1.0],
        "mode": 0, "rounded": 0, "background": 1,
    }
}, 600, 90)

title = place_raw({
    "box": {
        "maxclass": "comment", "text": "NOTE TRANSPOSER",
        "numinlets": 1, "numoutlets": 0, "outlettype": [],
        "patching_rect": [600.0, 70.0, 160.0, 20.0],
        "presentation": 1, "presentation_rect": [12.0, 4.0, 160.0, 18.0],
        "fontsize": 12.0, "fontface": 1,
        "textcolor": [1.0, 1.0, 1.0, 1.0],
    }
}, 600, 70)

# ============================================================
# MIDI INPUT (notein)
# ============================================================

patch.set_position(30, 30)
patch.place("comment === MIDI INPUT ===")[0]

notein_obj = place_raw({
    "box": {
        "maxclass": "newobj", "numinlets": 1, "numoutlets": 3,
        "outlettype": ["int", "int", "int"],
        "patching_rect": [30.0, 65.0, 41.0, 22.0],
        "text": "notein",
    }
}, 30, 65)

# ============================================================
# TRANSPOSE CONTROL
# ============================================================

DIAL_COLORS = {
    "activedialcolor": [0.20, 0.55, 0.45, 1.0],
    "dialcolor": [0.12, 0.20, 0.18, 1.0],
    "activeneedlecolor": [1.0, 1.0, 1.0, 1.0],
    "needlecolor": [0.9, 0.9, 0.9, 1.0],
    "textcolor": [1.0, 1.0, 1.0, 1.0],
}


def make_dial(name, varname, px, min_v, max_v, init, unitstyle=1, exponent=1.0):
    return place_raw({
        "box": {
            "maxclass": "live.dial", "varname": varname,
            "text": "live.dial",
            "numinlets": 1, "numoutlets": 2, "outlettype": ["", "float"],
            "patching_rect": [430.0 + (px - 15), 230.0, 44.0, 48.0],
            "presentation": 1,
            "presentation_rect": [float(px), 40.0, 50.0, 56.0],
            "parameter_enable": 1, **DIAL_COLORS,
            "saved_attribute_attributes": {
                "valueof": {
                    "parameter_longname": name, "parameter_shortname": name[:5],
                    "parameter_type": 0,
                    "parameter_mmin": min_v, "parameter_mmax": max_v,
                    "parameter_initial_enable": 1, "parameter_initial": [init],
                    "parameter_unitstyle": unitstyle, "parameter_exponent": exponent,
                }
            }
        }
    }, int(430 + (px - 15)), 230)


dial_transpose = make_dial("Transpose", "transpose", 75, -24.0, 24.0, 0.0)

# ============================================================
# PITCH TRANSPOSITION
# ============================================================

patch.set_position(30, 130)
patch.place("comment === TRANSPOSE ===")[0]

# Add transpose offset to pitch
patch.set_position(30, 165)
add_obj = patch.place("+ 0")[0]

# Clip to valid MIDI range 0-127
patch.set_position(30, 205)
clip_obj = patch.place("clip 0 127")[0]

patch.connect(
    [notein_obj.outs[0], add_obj.ins[0]],        # pitch → add left inlet
    [dial_transpose.outs[0], add_obj.ins[1]],     # transpose offset → add right inlet
    [add_obj.outs[0], clip_obj.ins[0]],           # sum → clip
)

# ============================================================
# MIDI OUTPUT (noteout via place_raw)
# ============================================================

patch.set_position(30, 270)
patch.place("comment === MIDI OUTPUT ===")[0]

noteout = place_raw({
    "box": {
        "maxclass": "newobj", "numinlets": 3, "numoutlets": 0,
        "outlettype": [],
        "patching_rect": [30.0, 310.0, 55.0, 22.0],
        "text": "noteout",
    }
}, 30, 310)

patch.connect(
    [clip_obj.outs[0], noteout.ins[0]],          # transposed pitch → noteout
    [notein_obj.outs[1], noteout.ins[1]],         # velocity pass-through → noteout
)

# ============================================================
# SAVE
# ============================================================

patcher_json = patch.get_json()
patcher_json["patcher"]["openinpresentation"] = 1

with open("examples/m4l_note_transposer.maxpat", "w") as f:
    json.dump(patcher_json, f, indent=2)
print("Saved: examples/m4l_note_transposer.maxpat")

from amxd import save_amxd
save_amxd(patcher_json, "examples/m4l_note_transposer.amxd", device_type="midi_effect")
print("Saved: examples/m4l_note_transposer.amxd")

print(f"Total objects: {patch.num_objs}")
