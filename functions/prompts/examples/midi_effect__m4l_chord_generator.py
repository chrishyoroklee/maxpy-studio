"""
Max for Live Chord Generator (MIDI Effect)
=============================================
Generates chords from single MIDI notes.

  Mode  — chord type: Major (0), Minor (1), 7th (2), Maj7 (3)
  Spread — voice spread in semitones for top notes (0–12)

Signal flow:
  notein (single MIDI note from Ableton)
    → stripnote (filter note-offs for chord building)
      → root note → noteout
      → root + 4 (major third) or root + 3 (minor third) → noteout
      → root + 7 (perfect fifth) → noteout
      → root + 11 or root + 10 (optional 7th) → noteout

  Note-offs are handled separately: original pitch is sent
  to noteout with velocity 0 to stop all generated voices.

Usage in Ableton Live:
  1. Drag the .amxd onto a MIDI track (before an instrument)
  2. Play single notes — chords are generated automatically
  3. Use Mode dial to select chord type
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
        "bgcolor": [0.10, 0.10, 0.16, 1.0],
        "mode": 0, "rounded": 0, "background": 1,
    }
}, 600, 100)

header = place_raw({
    "box": {
        "maxclass": "panel", "text": "panel",
        "numinlets": 1, "numoutlets": 0, "outlettype": [],
        "patching_rect": [600.0, 90.0, 200.0, 24.0],
        "presentation": 1, "presentation_rect": [0.0, 0.0, 200.0, 24.0],
        "bgcolor": [0.70, 0.40, 0.15, 1.0],
        "mode": 0, "rounded": 0, "background": 1,
    }
}, 600, 90)

title = place_raw({
    "box": {
        "maxclass": "comment", "text": "CHORD GENERATOR",
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

# stripnote: only passes note-ons (velocity > 0)
# outlet 0 = pitch, outlet 1 = velocity (non-zero only)
patch.set_position(30, 105)
stripnote = patch.place("stripnote")[0]

patch.connect(
    [notein_obj.outs[0], stripnote.ins[0]],
    [notein_obj.outs[1], stripnote.ins[1]],
)

# ============================================================
# CHORD INTERVALS (coll stores chord types)
# ============================================================

patch.set_position(30, 155)
patch.place("comment === CHORD INTERVALS ===")[0]

# coll stores chord interval sets indexed by mode number:
#   0 = Major:  0 4 7
#   1 = Minor:  0 3 7
#   2 = Dom7:   0 4 7 10
#   3 = Maj7:   0 4 7 11
# We populate it with messages at load time.
patch.set_position(30, 190)
coll_obj = patch.place("coll chord_intervals")[0]

# Loadbang → populate coll with chord definitions
patch.set_position(250, 155)
loadbang = patch.place("loadbang")[0]

patch.set_position(250, 190)
msg_major = place_raw({
    "box": {
        "maxclass": "message", "text": "store 0 0 4 7, store 1 0 3 7, store 2 0 4 7 10, store 3 0 4 7 11",
        "numinlets": 2, "numoutlets": 1, "outlettype": [""],
        "patching_rect": [250.0, 190.0, 340.0, 22.0],
    }
}, 250, 190)

patch.connect(
    [loadbang.outs[0], msg_major.ins[0]],
    [msg_major.outs[0], coll_obj.ins[0]],
)

# ============================================================
# MODE CONTROL (dial selects chord type)
# ============================================================

DIAL_COLORS = {
    "activedialcolor": [0.70, 0.40, 0.15, 1.0],
    "dialcolor": [0.25, 0.15, 0.08, 1.0],
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


dial_mode = make_dial("Mode", "mode", 50, 0.0, 3.0, 0.0)

# Mode dial → coll lookup: retrieve the intervals for the selected chord type
# When mode changes, send the index to coll to retrieve intervals
patch.set_position(30, 245)
int_mode = patch.place("int")[0]

patch.connect(
    [dial_mode.outs[0], int_mode.ins[1]],   # store mode value
)

# ============================================================
# CHORD GENERATION (pitch + intervals → noteout)
# ============================================================

patch.set_position(30, 290)
patch.place("comment === CHORD GENERATION ===")[0]

# When a note-on arrives:
# 1. trigger sends: bang to int_mode (recall mode) → coll → get intervals
# 2. Store the root pitch
# 3. For each interval in the list, add to root and send to noteout

patch.set_position(30, 325)
trigger_obj = patch.place("trigger b i")[0]

patch.connect([stripnote.outs[0], trigger_obj.ins[0]])

# Right outlet (i) stores the root pitch
patch.set_position(180, 325)
int_root = patch.place("int")[0]

patch.connect([trigger_obj.outs[1], int_root.ins[1]])

# Left outlet (b) triggers mode recall → coll lookup
patch.connect(
    [trigger_obj.outs[0], int_mode.ins[0]],
    [int_mode.outs[0], coll_obj.ins[0]],
)

# coll outputs the interval list → iter (output one interval at a time)
patch.set_position(30, 375)
iter_obj = patch.place("iter")[0]

patch.connect([coll_obj.outs[0], iter_obj.ins[0]])

# Each interval + root pitch → add → clip → noteout
patch.set_position(30, 415)
add_interval = patch.place("+ 0")[0]

patch.set_position(30, 455)
clip_note = patch.place("clip 0 127")[0]

patch.connect(
    [iter_obj.outs[0], add_interval.ins[0]],  # interval → add left
    [int_root.outs[0], add_interval.ins[1]],  # root pitch → add right (stored)
    [add_interval.outs[0], clip_note.ins[0]],
)

# ============================================================
# MIDI OUTPUT (noteout via place_raw)
# ============================================================

patch.set_position(30, 510)
patch.place("comment === MIDI OUTPUT ===")[0]

noteout = place_raw({
    "box": {
        "maxclass": "newobj", "numinlets": 3, "numoutlets": 0,
        "outlettype": [],
        "patching_rect": [30.0, 550.0, 55.0, 22.0],
        "text": "noteout",
    }
}, 30, 550)

# Velocity from stripnote for note-ons
patch.connect(
    [clip_note.outs[0], noteout.ins[0]],      # chord pitch → noteout
    [stripnote.outs[1], noteout.ins[1]],       # velocity → noteout
)

# ============================================================
# NOTE-OFF HANDLING
# ============================================================

# When a note-off comes (velocity 0), we need to send note-offs for all
# chord voices. Use the same coll lookup mechanism but with velocity 0.
# Detect note-off: select 0 on velocity
patch.set_position(300, 65)
sel_noteoff = patch.place("select 0")[0]

patch.connect([notein_obj.outs[1], sel_noteoff.ins[0]])

# On note-off, store pitch and trigger chord interval lookup
patch.set_position(300, 105)
int_off_pitch = patch.place("int")[0]

patch.set_position(300, 145)
trigger_off = patch.place("trigger b i")[0]

patch.connect(
    [notein_obj.outs[0], int_off_pitch.ins[1]],   # always store pitch
    [sel_noteoff.outs[0], int_off_pitch.ins[0]],   # note-off triggers output
    [int_off_pitch.outs[0], trigger_off.ins[0]],
)

# Recall mode and look up intervals
patch.set_position(300, 190)
int_mode_off = patch.place("int")[0]

patch.connect(
    [dial_mode.outs[0], int_mode_off.ins[1]],       # store mode
    [trigger_off.outs[0], int_mode_off.ins[0]],      # bang triggers mode recall
)

# Use a second coll reference (same name = same data)
patch.set_position(300, 230)
coll_off = patch.place("coll chord_intervals")[0]

patch.connect([int_mode_off.outs[0], coll_off.ins[0]])

# iter → add root → clip → noteout (with velocity 0)
patch.set_position(300, 270)
iter_off = patch.place("iter")[0]

patch.set_position(300, 310)
add_off = patch.place("+ 0")[0]

patch.set_position(300, 350)
clip_off = patch.place("clip 0 127")[0]

# Store off-pitch in right inlet via trigger's right outlet
patch.set_position(450, 310)
int_off_root = patch.place("int")[0]

patch.connect(
    [trigger_off.outs[1], int_off_root.ins[1]],  # store root pitch
    [trigger_off.outs[0], int_off_root.ins[0]],  # bang outputs it for each iter
)

patch.connect(
    [coll_off.outs[0], iter_off.ins[0]],
    [iter_off.outs[0], add_off.ins[0]],
    [int_off_root.outs[0], add_off.ins[1]],
    [add_off.outs[0], clip_off.ins[0]],
)

# Note-off noteout: same noteout object, pitch from clip_off, velocity 0
patch.set_position(300, 390)
vel_zero = place_raw({
    "box": {
        "maxclass": "message", "text": "0",
        "numinlets": 2, "numoutlets": 1, "outlettype": [""],
        "patching_rect": [400.0, 390.0, 20.0, 22.0],
    }
}, 400, 390)

# Use a second noteout for note-offs to avoid timing conflicts
noteout_off = place_raw({
    "box": {
        "maxclass": "newobj", "numinlets": 3, "numoutlets": 0,
        "outlettype": [],
        "patching_rect": [300.0, 430.0, 55.0, 22.0],
        "text": "noteout",
    }
}, 300, 430)

patch.connect(
    [clip_off.outs[0], noteout_off.ins[0]],
    [clip_off.outs[0], vel_zero.ins[0]],       # trigger velocity 0 message
    [vel_zero.outs[0], noteout_off.ins[1]],
)

# ============================================================
# SAVE
# ============================================================

patcher_json = patch.get_json()
patcher_json["patcher"]["openinpresentation"] = 1

with open("examples/m4l_chord_generator.maxpat", "w") as f:
    json.dump(patcher_json, f, indent=2)
print("Saved: examples/m4l_chord_generator.maxpat")

from amxd import save_amxd
save_amxd(patcher_json, "examples/m4l_chord_generator.amxd", device_type="midi_effect")
print("Saved: examples/m4l_chord_generator.amxd")

print(f"Total objects: {patch.num_objs}")
