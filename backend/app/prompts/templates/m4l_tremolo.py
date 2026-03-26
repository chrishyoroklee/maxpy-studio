"""
Max for Live Tremolo (Audio Effect)
====================================
A two-knob tremolo effect for Ableton Live.

  Rate  — LFO speed (0.1–20 Hz)
  Depth — how strong the effect is (0 = bypass, 1 = full tremolo)

Signal flow:
  plugin~ (stereo from Ableton)
    └─ +~ → *~ 0.5 (sum to mono)
              │
              *~ ← modulator
              │         ↑
              │   cycle~ rate
              │     → *~ 0.5 → +~ 0.5 (unipolar 0..1)
              │       → -~ 1. (shift to -1..0)
              │         → *~ depth (scale by depth)
              │           → +~ 1. (modulator: (1-depth)..1)
              │
        clip~ -1. 1.
              │
         plugout~ (stereo)

Depth math: modulator = 1 + depth * (lfo_unipolar - 1)
  depth=0 → constant 1.0 (bypass)
  depth=1 → 0..1 (full tremolo)

Usage in Ableton Live:
  1. Drag the .amxd onto an audio track
  2. Rate sets tremolo speed, Depth sets intensity
"""

import json
import maxpylang as mp
from maxpylang.maxobject import MaxObject

patch = mp.MaxPatch()


# -- Helper: place objects that maxpylang's arg validator rejects -----------
def place_raw(obj_dict, x, y):
    """Create a MaxObject from a raw dict and place it at (x, y)."""
    obj = MaxObject(obj_dict, from_dict=True)
    patch.set_position(x, y)
    patch.place_obj(obj, position=[float(x), float(y)])
    return obj


# ============================================================
# AUDIO INPUT
# ============================================================

patch.set_position(30, 30)
patch.place("comment === AUDIO INPUT ===")[0]

plugin = place_raw({
    "box": {
        "maxclass": "newobj", "numinlets": 2, "numoutlets": 2,
        "outlettype": ["signal", "signal"],
        "patching_rect": [30.0, 65.0, 46.0, 22.0],
        "text": "plugin~"
    }
}, 30, 65)

# Sum stereo to mono
patch.set_position(30, 105)
sum_stereo = patch.place("+~")[0]

patch.set_position(30, 145)
norm = patch.place("*~ 0.5")[0]

patch.connect(
    [plugin.outs[0], sum_stereo.ins[0]],
    [plugin.outs[1], sum_stereo.ins[1]],
    [sum_stereo.outs[0], norm.ins[0]],
)

# ============================================================
# LFO (sine, with depth scaling)
# ============================================================

patch.set_position(250, 30)
patch.place("comment === LFO ===")[0]

# LFO oscillator — frequency set by Rate dial
patch.set_position(250, 65)
lfo = patch.place("cycle~ 4")[0]

# Scale bipolar (-1..1) to unipolar (0..1)
patch.set_position(250, 105)
lfo_scale = patch.place("*~ 0.5")[0]

patch.set_position(250, 145)
lfo_offset = patch.place("+~ 0.5")[0]

# Depth scaling: modulator = 1 + depth * (lfo_unipolar - 1)
# At depth=0: constant 1 (no effect). At depth=1: full 0..1 tremolo.
patch.set_position(250, 185)
lfo_shift = patch.place("-~ 1.")[0]       # lfo - 1 → range (-1..0)

patch.set_position(250, 225)
depth_scale = patch.place("*~")[0]        # * depth → range (-depth..0)

patch.set_position(250, 265)
modulator = patch.place("+~ 1.")[0]       # + 1 → range (1-depth..1)

patch.connect(
    [lfo.outs[0], lfo_scale.ins[0]],
    [lfo_scale.outs[0], lfo_offset.ins[0]],
    [lfo_offset.outs[0], lfo_shift.ins[0]],
    [lfo_shift.outs[0], depth_scale.ins[0]],
    [depth_scale.outs[0], modulator.ins[0]],
)

# ============================================================
# CONTROLS (live.dial — automatable in Ableton)
# ============================================================

patch.set_position(430, 30)
patch.place("comment === CONTROLS ===")[0]

# Cool cyan/teal color palette
DIAL_COLORS = {
    "activedialcolor": [0.0, 0.9, 0.85, 1.0],      # bright cyan active
    "dialcolor": [0.08, 0.22, 0.28, 1.0],           # dark teal inactive
    "activeneedlecolor": [0.7, 1.0, 0.98, 1.0],     # ice white needle
    "needlecolor": [0.4, 0.7, 0.68, 1.0],           # muted teal needle
    "textcolor": [0.7, 1.0, 0.98, 1.0],             # ice white text
}

dial_rate = place_raw({
    "box": {
        "maxclass": "live.dial",
        "varname": "rate",
        "text": "live.dial",
        "numinlets": 1,
        "numoutlets": 2,
        "outlettype": ["", "float"],
        "patching_rect": [430.0, 60.0, 44.0, 48.0],
        "presentation": 1,
        "presentation_rect": [15.0, 30.0, 44.0, 48.0],
        "parameter_enable": 1,
        **DIAL_COLORS,
        "saved_attribute_attributes": {
            "valueof": {
                "parameter_longname": "Rate",
                "parameter_shortname": "Rate",
                "parameter_type": 0,
                "parameter_mmin": 0.1,
                "parameter_mmax": 20.0,
                "parameter_initial_enable": 1,
                "parameter_initial": [4.0],
                "parameter_unitstyle": 1,
                "parameter_exponent": 2.0
            }
        }
    }
}, 430, 60)

dial_depth = place_raw({
    "box": {
        "maxclass": "live.dial",
        "varname": "depth",
        "text": "live.dial",
        "numinlets": 1,
        "numoutlets": 2,
        "outlettype": ["", "float"],
        "patching_rect": [500.0, 60.0, 44.0, 48.0],
        "presentation": 1,
        "presentation_rect": [70.0, 30.0, 44.0, 48.0],
        "parameter_enable": 1,
        **DIAL_COLORS,
        "saved_attribute_attributes": {
            "valueof": {
                "parameter_longname": "Depth",
                "parameter_shortname": "Depth",
                "parameter_type": 0,
                "parameter_mmin": 0.0,
                "parameter_mmax": 1.0,
                "parameter_initial_enable": 1,
                "parameter_initial": [1.0],
                "parameter_unitstyle": 1
            }
        }
    }
}, 500, 60)

# Rate → LFO frequency, Depth → depth scaler
patch.connect(
    [dial_rate.outs[0], lfo.ins[0]],
    [dial_depth.outs[0], depth_scale.ins[1]],
)

# ============================================================
# TREMOLO VCA (input * modulator)
# ============================================================

patch.set_position(30, 210)
patch.place("comment === TREMOLO ===")[0]

patch.set_position(30, 245)
vca = patch.place("*~")[0]

patch.connect(
    [norm.outs[0], vca.ins[0]],           # mono audio → VCA
    [modulator.outs[0], vca.ins[1]],      # depth-scaled modulator → VCA
)

# ============================================================
# OUTPUT
# ============================================================

patch.set_position(30, 300)
patch.place("comment === OUTPUT ===")[0]

patch.set_position(30, 335)
clip = patch.place("clip~ -1. 1.")[0]

patch.set_position(30, 375)
plugout = patch.place("plugout~")[0]

patch.connect(
    [vca.outs[0], clip.ins[0]],
    [clip.outs[0], plugout.ins[0]],       # mono → left
    [clip.outs[0], plugout.ins[1]],       # mono → right (mirrored)
)

# ============================================================
# PRESENTATION UI (dark bg + cyan accents)
# ============================================================

panel = place_raw({
    "box": {
        "maxclass": "panel",
        "text": "panel",
        "numinlets": 1,
        "numoutlets": 0,
        "outlettype": [],
        "patching_rect": [600.0, 100.0, 130.0, 90.0],
        "presentation": 1,
        "presentation_rect": [0.0, 0.0, 130.0, 90.0],
        "bgcolor": [0.1, 0.14, 0.18, 1.0],
        "mode": 0,
        "rounded": 0,
        "background": 1
    }
}, 600, 100)

title = place_raw({
    "box": {
        "maxclass": "comment",
        "text": "Tremolo",
        "numinlets": 1,
        "numoutlets": 0,
        "outlettype": [],
        "patching_rect": [600.0, 30.0, 80.0, 20.0],
        "presentation": 1,
        "presentation_rect": [15.0, 6.0, 100.0, 18.0],
        "fontsize": 12.0,
        "fontface": 1,
        "textcolor": [0.0, 0.9, 0.85, 1.0]
    }
}, 600, 30)

# ============================================================
# SAVE (enable presentation mode)
# ============================================================

patcher_json = patch.get_json()
patcher_json["patcher"]["openinpresentation"] = 1

with open("device.maxpat", "w") as f:
    json.dump(patcher_json, f, indent=2)
print("Saved: examples/m4l_tremolo.maxpat")

from amxd import save_amxd
save_amxd(patcher_json, "device.amxd", device_type="audio_effect")
print("Saved: examples/m4l_tremolo.amxd")

print(f"Total objects: {patch.num_objs}")
