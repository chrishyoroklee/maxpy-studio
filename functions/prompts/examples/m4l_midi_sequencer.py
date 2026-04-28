"""
Max for Live 8-Step MIDI Sequencer (MIDI Effect)
==================================================
An 8-step MIDI sequencer with per-step pitch control.

  Tempo    — sequencer speed in BPM (40–240)
  Step 1–8 — MIDI note pitch for each step (36–84, C2–C6)

Signal flow:
  metro (tempo-driven clock)
    → counter 0 7 (cycles through 8 steps)
      → select 0 1 2 3 4 5 6 7 (trigger per step)
        → step N pitch dial value
          → noteout (MIDI note output to Ableton)

Usage in Ableton Live:
  1. Drag the .amxd onto a MIDI track (before an instrument)
  2. Set step pitches with the 8 dials
  3. Adjust Tempo to change sequencer speed
"""

import json
import maxpylang as mp
from maxpylang.maxobject import MaxObject

patch = mp.MaxPatch()


def place_raw(obj_dict, x, y):
    """Create a MaxObject from a raw dict and place it at (x, y)."""
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
        "patching_rect": [600.0, 100.0, 540.0, 120.0],
        "presentation": 1, "presentation_rect": [0.0, 0.0, 540.0, 120.0],
        "bgcolor": [0.12, 0.08, 0.20, 1.0],
        "mode": 0, "rounded": 0, "background": 1,
    }
}, 600, 100)

header = place_raw({
    "box": {
        "maxclass": "panel", "text": "panel",
        "numinlets": 1, "numoutlets": 0, "outlettype": [],
        "patching_rect": [600.0, 90.0, 540.0, 24.0],
        "presentation": 1, "presentation_rect": [0.0, 0.0, 540.0, 24.0],
        "bgcolor": [0.45, 0.20, 0.70, 1.0],
        "mode": 0, "rounded": 0, "background": 1,
    }
}, 600, 90)

title = place_raw({
    "box": {
        "maxclass": "comment", "text": "MIDI SEQUENCER",
        "numinlets": 1, "numoutlets": 0, "outlettype": [],
        "patching_rect": [600.0, 70.0, 160.0, 20.0],
        "presentation": 1, "presentation_rect": [12.0, 4.0, 160.0, 18.0],
        "fontsize": 12.0, "fontface": 1,
        "textcolor": [1.0, 1.0, 1.0, 1.0],
    }
}, 600, 70)

# ============================================================
# CLOCK (metro → counter → select)
# ============================================================

patch.set_position(30, 30)
patch.place("comment === CLOCK ===")[0]

# metro with tempo-driven interval
patch.set_position(30, 65)
metro = patch.place("metro 500")[0]

# loadbang to start metro automatically
patch.set_position(150, 30)
loadbang = patch.place("loadbang")[0]

# Toggle for start/stop
patch.set_position(150, 65)
toggle = patch.place("toggle")[0]
patch.connect(
    [loadbang.outs[0], toggle.ins[0]],
    [toggle.outs[0], metro.ins[0]],
)

# Counter cycles 0–7
patch.set_position(30, 115)
counter = patch.place("counter 0 7")[0]
patch.connect([metro.outs[0], counter.ins[0]])

# Select triggers individual step bangs
patch.set_position(30, 165)
sel = patch.place("select 0 1 2 3 4 5 6 7")[0]
patch.connect([counter.outs[0], sel.ins[0]])

# ============================================================
# TEMPO CONTROL
# ============================================================

DIAL_COLORS = {
    "activedialcolor": [0.45, 0.20, 0.70, 1.0],
    "dialcolor": [0.25, 0.12, 0.40, 1.0],
    "activeneedlecolor": [1.0, 1.0, 1.0, 1.0],
    "needlecolor": [0.9, 0.9, 0.9, 1.0],
    "textcolor": [1.0, 1.0, 1.0, 1.0],
}


def make_dial(name, varname, px, min_v, max_v, init, exponent=1.0, unitstyle=1):
    return place_raw({
        "box": {
            "maxclass": "live.dial", "varname": varname,
            "text": "live.dial",
            "numinlets": 1, "numoutlets": 2, "outlettype": ["", "float"],
            "patching_rect": [430.0 + (px - 15), 230.0, 44.0, 48.0],
            "presentation": 1,
            "presentation_rect": [float(px), 30.0, 44.0, 48.0],
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


# Tempo dial: BPM → ms conversion (60000 / BPM = ms per beat)
dial_tempo = make_dial("Tempo", "tempo", 15, 40.0, 240.0, 120.0)

# BPM → ms: expr 60000. / $f1
patch.set_position(300, 65)
bpm_to_ms = place_raw({
    "box": {
        "maxclass": "newobj", "numinlets": 1, "numoutlets": 1,
        "outlettype": ["float"],
        "patching_rect": [300.0, 65.0, 100.0, 22.0],
        "text": "expr 60000. / $f1",
    }
}, 300, 65)

patch.connect(
    [dial_tempo.outs[0], bpm_to_ms.ins[0]],
    [bpm_to_ms.outs[0], metro.ins[1]],
)

# ============================================================
# STEP PITCH DIALS + NOTEOUT
# ============================================================

patch.set_position(30, 230)
patch.place("comment === STEP DIALS ===")[0]

NOTE_DEFAULTS = [60, 62, 64, 65, 67, 69, 71, 72]  # C major scale

step_dials = []
for i in range(8):
    dial = make_dial(f"Step {i+1}", f"step_{i+1}", 75 + i * 58, 36.0, 84.0, float(NOTE_DEFAULTS[i]))
    step_dials.append(dial)

# noteout: inlets = pitch (0), velocity (1), channel (2)
noteout = place_raw({
    "box": {
        "maxclass": "newobj", "numinlets": 3, "numoutlets": 0,
        "outlettype": [],
        "patching_rect": [30.0, 350.0, 55.0, 22.0],
        "text": "noteout",
    }
}, 30, 350)

# Fixed velocity (100)
patch.set_position(200, 310)
velocity = place_raw({
    "box": {
        "maxclass": "message", "text": "100",
        "numinlets": 2, "numoutlets": 1, "outlettype": [""],
        "patching_rect": [200.0, 310.0, 30.0, 22.0],
    }
}, 200, 310)

# Each select outlet triggers the corresponding step dial to send its value
# The dial's current value is sent via "int" object when banged
for i in range(8):
    # int stores the dial value and outputs it when banged by select
    patch.set_position(30 + i * 60, 270)
    int_obj = patch.place("int")[0]

    # dial → int (right inlet stores value)
    patch.connect([step_dials[i].outs[0], int_obj.ins[1]])
    # select bang → int (left inlet triggers output)
    patch.connect([sel.outs[i], int_obj.ins[0]])
    # int → noteout pitch
    patch.connect([int_obj.outs[0], noteout.ins[0]])
    # also trigger velocity
    patch.connect([sel.outs[i], velocity.ins[0]])

patch.connect([velocity.outs[0], noteout.ins[1]])

# ============================================================
# SAVE
# ============================================================

patcher_json = patch.get_json()
patcher_json["patcher"]["openinpresentation"] = 1

with open("examples/m4l_midi_sequencer.maxpat", "w") as f:
    json.dump(patcher_json, f, indent=2)
print("Saved: examples/m4l_midi_sequencer.maxpat")

from amxd import save_amxd
save_amxd(patcher_json, "examples/m4l_midi_sequencer.amxd", device_type="midi_effect")
print("Saved: examples/m4l_midi_sequencer.amxd")

print(f"Total objects: {patch.num_objs}")
