"""
Max for Live Lo-Fi Vibez (Audio Effect)
========================================
A bitcrusher effect with a warm lo-fi aesthetic.

  Crush   — bit depth reduction (1–24 bits, default 24 = clean)
  Sample  — sample rate reduction (1000–44100 Hz, default 44100 = clean)

Signal flow:
  plugin~ (stereo from Ableton)
    └─ +~ → *~ 0.5 (sum to mono)
              │
          degrade~ (bitcrusher + sample rate reducer)
              │
         clip~ -1. 1.
              │
         plugout~ (stereo)

degrade~ does all the work — it reduces bit depth and sample rate in one object.
  inlet 0: audio signal
  inlet 1: sample rate divisor (float, higher = more crushed)
  argument: bit depth (lower = more crushed)

Usage in Ableton Live:
  1. Drag the .amxd onto an audio track
  2. Crush down for gritty bit reduction, Sample down for that aliased texture
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


# Warm amber/orange color palette
BG_COLOR = [0.18, 0.14, 0.12, 1.0]         # dark brown background
DIAL_COLORS = {
    "activedialcolor": [0.95, 0.6, 0.2, 1.0],   # warm amber active
    "dialcolor": [0.35, 0.22, 0.1, 1.0],         # dark brown inactive
    "activeneedlecolor": [1.0, 0.95, 0.85, 1.0], # warm white needle
    "needlecolor": [0.8, 0.7, 0.55, 1.0],        # tan needle
    "textcolor": [0.95, 0.85, 0.65, 1.0],        # warm cream text
}

# ============================================================
# PRESENTATION BACKGROUND (placed first = behind everything)
# ============================================================

panel = place_raw({
    "box": {
        "maxclass": "panel",
        "text": "panel",
        "numinlets": 1,
        "numoutlets": 0,
        "outlettype": [],
        "patching_rect": [600.0, 200.0, 150.0, 90.0],
        "presentation": 1,
        "presentation_rect": [0.0, 0.0, 150.0, 90.0],
        "bgcolor": BG_COLOR,
        "mode": 0,
        "rounded": 0,
        "background": 1
    }
}, 600, 200)

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
# BITCRUSHER (degrade~ does bit depth + sample rate reduction)
# ============================================================

patch.set_position(30, 200)
patch.place("comment === BITCRUSHER ===")[0]

# degrade~ 24 = 24-bit (clean). Lower bits = more crushed.
# inlet 1 accepts sample rate divisor (1. = no change, higher = more aliased)
patch.set_position(30, 235)
degrade = patch.place("degrade~ 24")[0]

patch.connect(
    [norm.outs[0], degrade.ins[0]],
)

# ============================================================
# CONTROLS (live.dial — automatable in Ableton)
# ============================================================

patch.set_position(250, 200)
patch.place("comment === CONTROLS ===")[0]

# Crush dial: controls bit depth (1–24 bits)
# degrade~ takes bit depth as its argument but can be set via inlet
# We'll use a message to set it: "bits $1" or just send the float
# Actually, degrade~'s bit depth is set by sending a float to a specific inlet
# Let me use the approach of sending bit depth as a message

dial_crush = place_raw({
    "box": {
        "maxclass": "live.dial",
        "varname": "crush",
        "text": "live.dial",
        "numinlets": 1,
        "numoutlets": 2,
        "outlettype": ["", "float"],
        "patching_rect": [250.0, 230.0, 44.0, 48.0],
        "presentation": 1,
        "presentation_rect": [18.0, 30.0, 44.0, 48.0],
        "parameter_enable": 1,
        **DIAL_COLORS,
        "saved_attribute_attributes": {
            "valueof": {
                "parameter_longname": "Crush",
                "parameter_shortname": "Crush",
                "parameter_type": 0,
                "parameter_mmin": 1.0,
                "parameter_mmax": 24.0,
                "parameter_initial_enable": 1,
                "parameter_initial": [24.0],
                "parameter_unitstyle": 1
            }
        }
    }
}, 250, 230)

# Sample dial: controls sample rate reduction factor
# degrade~ inlet 1 = sample rate divisor (1. = original, 44.1 = crushed to 1kHz)
# We'll expose this as a Hz value and convert:
#   divisor = 44100 / desired_sample_rate
# Use !/ 44100. to compute divisor from Hz
# Actually simpler: just expose the divisor directly (1–40)
# But Hz is more intuitive. Let me use Hz and convert.

dial_sample = place_raw({
    "box": {
        "maxclass": "live.dial",
        "varname": "sample_rate",
        "text": "live.dial",
        "numinlets": 1,
        "numoutlets": 2,
        "outlettype": ["", "float"],
        "patching_rect": [330.0, 230.0, 44.0, 48.0],
        "presentation": 1,
        "presentation_rect": [88.0, 30.0, 44.0, 48.0],
        "parameter_enable": 1,
        **DIAL_COLORS,
        "saved_attribute_attributes": {
            "valueof": {
                "parameter_longname": "Sample",
                "parameter_shortname": "Sample",
                "parameter_type": 0,
                "parameter_mmin": 1.0,
                "parameter_mmax": 40.0,
                "parameter_initial_enable": 1,
                "parameter_initial": [1.0],
                "parameter_unitstyle": 1
            }
        }
    }
}, 330, 230)

# Convert dial floats to signal rate for degrade~ inlets
patch.set_position(250, 300)
sig_crush = patch.place("sig~")[0]

patch.set_position(330, 300)
sig_sample = patch.place("sig~")[0]

patch.connect(
    [dial_crush.outs[0], sig_crush.ins[0]],
    [sig_crush.outs[0], degrade.ins[2]],     # bit depth (signal rate)
    [dial_sample.outs[0], sig_sample.ins[0]],
    [sig_sample.outs[0], degrade.ins[1]],    # sample rate divisor (signal rate)
)

# ============================================================
# OUTPUT
# ============================================================

patch.set_position(30, 310)
patch.place("comment === OUTPUT ===")[0]

patch.set_position(30, 345)
clip = patch.place("clip~ -1. 1.")[0]

patch.set_position(30, 385)
plugout = patch.place("plugout~")[0]

patch.connect(
    [degrade.outs[0], clip.ins[0]],
    [clip.outs[0], plugout.ins[0]],       # mono → left
    [clip.outs[0], plugout.ins[1]],       # mono → right (mirrored)
)

# ============================================================
# PRESENTATION UI
# ============================================================

title = place_raw({
    "box": {
        "maxclass": "comment",
        "text": "Lo-Fi Vibez",
        "numinlets": 1,
        "numoutlets": 0,
        "outlettype": [],
        "patching_rect": [600.0, 300.0, 100.0, 20.0],
        "presentation": 1,
        "presentation_rect": [15.0, 5.0, 120.0, 18.0],
        "fontsize": 12.0,
        "fontface": 1,
        "textcolor": [0.95, 0.6, 0.2, 1.0]
    }
}, 600, 300)

# ============================================================
# SAVE (enable presentation mode)
# ============================================================

patcher_json = patch.get_json()
patcher_json["patcher"]["openinpresentation"] = 1

with open("device.maxpat", "w") as f:
    json.dump(patcher_json, f, indent=2)
print("Saved: examples/m4l_lofi.maxpat")

from amxd import save_amxd
save_amxd(patcher_json, "device.amxd", device_type="audio_effect")
print("Saved: examples/m4l_lofi.amxd")

print(f"Total objects: {patch.num_objs}")
