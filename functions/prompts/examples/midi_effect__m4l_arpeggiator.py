"""
Max for Live Arpeggiator (MIDI Effect)
========================================
An arpeggiator that cycles through held notes at a configurable rate.

  Rate — arpeggio speed in BPM (40–300)

Signal flow:
  notein (MIDI notes from Ableton)
    → note-on:  stripnote → trigger b i → message "store $1 $1" → coll
    → note-off:  select 0 → int (recall pitch) → trigger b i → message "remove $1" → coll
    → after each store/remove: message "length" → coll → outlet 3 → note count

  metro (tempo-driven clock)
    → trigger b b
      → right b: message "100" → noteout velocity (fires first)
      → left b:  counter → % count → + 1 → message "nth $1" → coll
                  → coll outlet 0 (pitch) → noteout

  coll stores held notes with pitch as both key and value.
  "nth N" retrieves the Nth item (1-indexed). When coll is empty,
  nth returns nothing, so no notes play.

Usage in Ableton Live:
  1. Drag the .amxd onto a MIDI track (before an instrument)
  2. Hold one or more notes on a MIDI keyboard
  3. Adjust Rate to change arpeggio speed
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
        "patching_rect": [600.0, 100.0, 240.0, 120.0],
        "presentation": 1, "presentation_rect": [0.0, 0.0, 240.0, 120.0],
        "bgcolor": [0.14, 0.08, 0.18, 1.0],
        "mode": 0, "rounded": 0, "background": 1,
    }
}, 600, 100)

header = place_raw({
    "box": {
        "maxclass": "panel", "text": "panel",
        "numinlets": 1, "numoutlets": 0, "outlettype": [],
        "patching_rect": [600.0, 90.0, 240.0, 24.0],
        "presentation": 1, "presentation_rect": [0.0, 0.0, 240.0, 24.0],
        "bgcolor": [0.60, 0.25, 0.55, 1.0],
        "mode": 0, "rounded": 0, "background": 1,
    }
}, 600, 90)

title = place_raw({
    "box": {
        "maxclass": "comment", "text": "ARPEGGIATOR",
        "numinlets": 1, "numoutlets": 0, "outlettype": [],
        "patching_rect": [600.0, 70.0, 140.0, 20.0],
        "presentation": 1, "presentation_rect": [12.0, 4.0, 140.0, 18.0],
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
# NOTE STORAGE (coll — pitch as both key and value)
# ============================================================

patch.set_position(30, 110)
patch.place("comment === NOTE STORAGE (coll) ===")[0]

# stripnote: passes only note-ons (velocity > 0)
patch.set_position(30, 145)
stripnote = patch.place("stripnote")[0]

patch.connect(
    [notein_obj.outs[0], stripnote.ins[0]],
    [notein_obj.outs[1], stripnote.ins[1]],
)

# coll stores held notes: key=pitch, value=pitch
# "store <pitch> <pitch>" to add, "remove <pitch>" to delete
# "nth N" (1-indexed) to retrieve by position, "length" to get count
patch.set_position(30, 265)
coll_obj = patch.place("coll arp_notes")[0]

# --- Note-on path ---
# stripnote pitch → trigger b i
#   right (i): pitch → message "store $1 $1" → coll (store fires first)
#   left  (b): bang  → message "length" → coll → outlet 3 → count
patch.set_position(30, 185)
trig_on = patch.place("trigger b i")[0]

patch.connect([stripnote.outs[0], trig_on.ins[0]])

patch.set_position(140, 185)
msg_store = place_raw({
    "box": {
        "maxclass": "message", "text": "store $1 $1",
        "numinlets": 2, "numoutlets": 1, "outlettype": [""],
        "patching_rect": [140.0, 185.0, 80.0, 22.0],
    }
}, 140, 185)

patch.connect(
    [trig_on.outs[1], msg_store.ins[0]],      # i outlet → store message
    [msg_store.outs[0], coll_obj.ins[0]],      # store → coll
)

# Shared "length" message (used by both note-on and note-off paths)
patch.set_position(30, 225)
msg_length = place_raw({
    "box": {
        "maxclass": "message", "text": "length",
        "numinlets": 2, "numoutlets": 1, "outlettype": [""],
        "patching_rect": [30.0, 225.0, 46.0, 22.0],
    }
}, 30, 225)

patch.connect(
    [trig_on.outs[0], msg_length.ins[0]],     # b outlet → length query
    [msg_length.outs[0], coll_obj.ins[0]],    # length → coll
)

# --- Note-off path ---
# notein velocity → select 0 (detect note-off)
patch.set_position(260, 105)
sel_zero = patch.place("select 0")[0]

patch.connect([notein_obj.outs[1], sel_zero.ins[0]])

# int stores current pitch; note-off bang recalls it
patch.set_position(260, 65)
int_pitch = patch.place("int")[0]

patch.connect(
    [notein_obj.outs[0], int_pitch.ins[1]],   # always store current pitch
    [sel_zero.outs[0], int_pitch.ins[0]],     # note-off triggers recall
)

# trigger b i for note-off: remove then get length
patch.set_position(260, 145)
trig_off = patch.place("trigger b i")[0]

patch.connect([int_pitch.outs[0], trig_off.ins[0]])

patch.set_position(370, 145)
msg_remove = place_raw({
    "box": {
        "maxclass": "message", "text": "remove $1",
        "numinlets": 2, "numoutlets": 1, "outlettype": [""],
        "patching_rect": [370.0, 145.0, 70.0, 22.0],
    }
}, 370, 145)

patch.connect(
    [trig_off.outs[1], msg_remove.ins[0]],    # i outlet → remove message
    [msg_remove.outs[0], coll_obj.ins[0]],    # remove → coll
    [trig_off.outs[0], msg_length.ins[0]],    # b outlet → length query (shared)
)

# --- Count tracking ---
# coll outlet 3 gives count after "length" message
# clip 1 128 prevents mod-by-zero when coll is empty
patch.set_position(200, 265)
clip_count = patch.place("clip 1 128")[0]

patch.connect([coll_obj.outs[3], clip_count.ins[0]])

# ============================================================
# ARPEGGIO CLOCK
# ============================================================

patch.set_position(30, 330)
patch.place("comment === ARPEGGIO CLOCK ===")[0]

patch.set_position(30, 365)
metro = patch.place("metro 250")[0]

# loadbang starts the metro (always running; no output when coll is empty)
patch.set_position(200, 330)
loadbang = patch.place("loadbang")[0]

patch.set_position(200, 365)
toggle = patch.place("toggle")[0]
patch.connect(
    [loadbang.outs[0], toggle.ins[0]],
    [toggle.outs[0], metro.ins[0]],
)

# trigger b b: right outlet fires first (velocity), left fires second (pitch chain)
patch.set_position(30, 405)
trig_metro = patch.place("trigger b b")[0]

patch.connect([metro.outs[0], trig_metro.ins[0]])

# --- Velocity (fires first via right outlet) ---
patch.set_position(200, 405)
msg_vel = place_raw({
    "box": {
        "maxclass": "message", "text": "100",
        "numinlets": 2, "numoutlets": 1, "outlettype": [""],
        "patching_rect": [200.0, 405.0, 30.0, 22.0],
    }
}, 200, 405)

patch.connect([trig_metro.outs[1], msg_vel.ins[0]])

# --- Pitch chain (fires second via left outlet) ---
# counter → % count → + 1 (coll nth is 1-indexed) → message "nth $1" → coll
patch.set_position(30, 445)
counter = patch.place("counter")[0]

patch.set_position(30, 485)
mod_obj = patch.place("% 1")[0]

patch.set_position(30, 525)
add_one = patch.place("+ 1")[0]

patch.set_position(30, 565)
msg_nth = place_raw({
    "box": {
        "maxclass": "message", "text": "nth $1",
        "numinlets": 2, "numoutlets": 1, "outlettype": [""],
        "patching_rect": [30.0, 565.0, 46.0, 22.0],
    }
}, 30, 565)

patch.connect(
    [trig_metro.outs[0], counter.ins[0]],     # left outlet → counter
    [counter.outs[0], mod_obj.ins[0]],        # count value → mod
    [clip_count.outs[0], mod_obj.ins[1]],     # note count → mod divisor
    [mod_obj.outs[0], add_one.ins[0]],        # 0-based → 1-based
    [add_one.outs[0], msg_nth.ins[0]],        # index → "nth N"
    [msg_nth.outs[0], coll_obj.ins[0]],       # "nth N" → coll
)

# ============================================================
# MIDI OUTPUT (noteout via place_raw)
# ============================================================

patch.set_position(30, 620)
patch.place("comment === MIDI OUTPUT ===")[0]

noteout = place_raw({
    "box": {
        "maxclass": "newobj", "numinlets": 3, "numoutlets": 0,
        "outlettype": [],
        "patching_rect": [30.0, 660.0, 55.0, 22.0],
        "text": "noteout",
    }
}, 30, 660)

# coll outlet 0 = pitch from nth lookup, msg_vel = velocity 100
patch.connect(
    [coll_obj.outs[0], noteout.ins[0]],       # pitch → noteout
    [msg_vel.outs[0], noteout.ins[1]],        # velocity → noteout
)

# ============================================================
# RATE CONTROL (BPM → ms)
# ============================================================

DIAL_COLORS = {
    "activedialcolor": [0.60, 0.25, 0.55, 1.0],
    "dialcolor": [0.25, 0.12, 0.22, 1.0],
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


dial_rate = make_dial("Rate", "rate", 95, 40.0, 300.0, 120.0)

# BPM → ms: 60000 / BPM
bpm_to_ms = place_raw({
    "box": {
        "maxclass": "newobj", "numinlets": 1, "numoutlets": 1,
        "outlettype": ["float"],
        "patching_rect": [350.0, 365.0, 100.0, 22.0],
        "text": "expr 60000. / $f1",
    }
}, 350, 365)

patch.connect(
    [dial_rate.outs[0], bpm_to_ms.ins[0]],
    [bpm_to_ms.outs[0], metro.ins[1]],
)

# ============================================================
# SAVE
# ============================================================

patcher_json = patch.get_json()
patcher_json["patcher"]["openinpresentation"] = 1

with open("examples/m4l_arpeggiator.maxpat", "w") as f:
    json.dump(patcher_json, f, indent=2)
print("Saved: examples/m4l_arpeggiator.maxpat")

from amxd import save_amxd
save_amxd(patcher_json, "examples/m4l_arpeggiator.amxd", device_type="midi_effect")
print("Saved: examples/m4l_arpeggiator.amxd")

print(f"Total objects: {patch.num_objs}")
