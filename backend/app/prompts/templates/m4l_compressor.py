"""
Max for Live Compressor (Audio Effect)
=======================================
Simple, clean compressor using envelope following + gain reduction.

  Thresh — compression threshold (0.01–1.0, signal level)
  Speed  — attack/release speed (1–100, lower = faster)
  Makeup — output gain boost (1–10x)

Signal flow (simple and reliable):
  plugin~ → sum to mono
    │
    ├── abs~ → slide~ (envelope follower)
    │     │
    │     └── thresh / envelope = gain (clamped to max 1.0)
    │              │
    │              └── slide~ (smooth gain changes)
    │                    │
    └── *~ gain ── *~ makeup ── clip~ ── plugout~
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
# PRESENTATION
# ============================================================

panel = place_raw({
    "box": {
        "maxclass": "panel", "text": "panel",
        "numinlets": 1, "numoutlets": 0, "outlettype": [],
        "patching_rect": [500.0, 200.0, 195.0, 90.0],
        "presentation": 1, "presentation_rect": [0.0, 0.0, 195.0, 90.0],
        "bgcolor": [0.12, 0.12, 0.14, 1.0],
        "mode": 0, "rounded": 0, "background": 1
    }
}, 500, 200)

# ============================================================
# AUDIO INPUT
# ============================================================

patch.set_position(30, 30)
patch.place("comment === INPUT ===")[0]

plugin = place_raw({
    "box": {
        "maxclass": "newobj", "numinlets": 2, "numoutlets": 2,
        "outlettype": ["signal", "signal"],
        "patching_rect": [30.0, 65.0, 46.0, 22.0], "text": "plugin~"
    }
}, 30, 65)

patch.set_position(30, 105)
sum_st = patch.place("+~")[0]

patch.set_position(30, 145)
norm = patch.place("*~ 0.5")[0]

patch.connect(
    [plugin.outs[0], sum_st.ins[0]],
    [plugin.outs[1], sum_st.ins[1]],
    [sum_st.outs[0], norm.ins[0]],
)

# ============================================================
# ENVELOPE FOLLOWER
# ============================================================

patch.set_position(250, 30)
patch.place("comment === DETECTOR ===")[0]

patch.set_position(250, 65)
env_abs = patch.place("abs~")[0]

# slide~ smooths the envelope (attack/release)
# Higher number = slower. Default: 10 up, 100 down
patch.set_position(250, 105)
env_slide = patch.place("slide~ 10 100")[0]

# Add a tiny offset to avoid division by zero
patch.set_position(250, 145)
env_safe = patch.place("+~ 0.0001")[0]

patch.connect(
    [norm.outs[0], env_abs.ins[0]],
    [env_abs.outs[0], env_slide.ins[0]],
    [env_slide.outs[0], env_safe.ins[0]],
)

# ============================================================
# GAIN COMPUTER: gain = min(1, threshold / envelope)
# ============================================================

patch.set_position(250, 200)
patch.place("comment === GAIN ===")[0]

# Threshold as signal
patch.set_position(400, 200)
sig_thresh = patch.place("sig~")[0]

# threshold / envelope
patch.set_position(250, 235)
gain_raw = patch.place("/~")[0]

# Clamp gain to max 1.0 (don't boost, only reduce)
# Use clip~ 0. 1. to keep gain between 0 and 1
patch.set_position(250, 275)
gain_clamp = patch.place("clip~ 0. 1.")[0]

# Smooth the gain signal to avoid zipper noise
patch.set_position(250, 315)
gain_smooth = patch.place("slide~ 5 50")[0]

patch.connect(
    [sig_thresh.outs[0], gain_raw.ins[0]],
    [env_safe.outs[0], gain_raw.ins[1]],
    [gain_raw.outs[0], gain_clamp.ins[0]],
    [gain_clamp.outs[0], gain_smooth.ins[0]],
)

# ============================================================
# OUTPUT (apply gain + makeup)
# ============================================================

patch.set_position(30, 200)
patch.place("comment === OUTPUT ===")[0]

# Apply gain reduction
patch.set_position(30, 235)
vca = patch.place("*~")[0]

# Makeup gain
patch.set_position(30, 275)
sig_makeup = patch.place("sig~")[0]

patch.set_position(30, 315)
makeup_vca = patch.place("*~")[0]

# Safety + output
patch.set_position(30, 355)
clip = patch.place("clip~ -1. 1.")[0]

patch.set_position(30, 395)
plugout = patch.place("plugout~")[0]

patch.connect(
    [norm.outs[0], vca.ins[0]],
    [gain_smooth.outs[0], vca.ins[1]],
    [vca.outs[0], makeup_vca.ins[0]],
    [sig_makeup.outs[0], makeup_vca.ins[1]],
    [makeup_vca.outs[0], clip.ins[0]],
    [clip.outs[0], plugout.ins[0]],
    [clip.outs[0], plugout.ins[1]],
)

# ============================================================
# CONTROLS
# ============================================================

DIAL_COLORS = {
    "activedialcolor": [0.7, 0.72, 0.78, 1.0],
    "dialcolor": [0.25, 0.25, 0.3, 1.0],
    "activeneedlecolor": [1.0, 1.0, 1.0, 1.0],
    "needlecolor": [0.6, 0.6, 0.65, 1.0],
    "textcolor": [0.85, 0.85, 0.9, 1.0],
}

dial_thresh = place_raw({
    "box": {
        "maxclass": "live.dial", "varname": "threshold", "text": "live.dial",
        "numinlets": 1, "numoutlets": 2, "outlettype": ["", "float"],
        "patching_rect": [500.0, 230.0, 44.0, 48.0],
        "presentation": 1, "presentation_rect": [10.0, 30.0, 44.0, 48.0],
        "parameter_enable": 1, **DIAL_COLORS,
        "saved_attribute_attributes": {"valueof": {
            "parameter_longname": "Threshold", "parameter_shortname": "Thresh",
            "parameter_type": 0, "parameter_mmin": 0.01, "parameter_mmax": 1.0,
            "parameter_initial_enable": 1, "parameter_initial": [0.3],
            "parameter_unitstyle": 1
        }}
    }
}, 500, 230)

dial_speed = place_raw({
    "box": {
        "maxclass": "live.dial", "varname": "speed", "text": "live.dial",
        "numinlets": 1, "numoutlets": 2, "outlettype": ["", "float"],
        "patching_rect": [570.0, 230.0, 44.0, 48.0],
        "presentation": 1, "presentation_rect": [70.0, 30.0, 44.0, 48.0],
        "parameter_enable": 1, **DIAL_COLORS,
        "saved_attribute_attributes": {"valueof": {
            "parameter_longname": "Speed", "parameter_shortname": "Speed",
            "parameter_type": 0, "parameter_mmin": 1.0, "parameter_mmax": 100.0,
            "parameter_initial_enable": 1, "parameter_initial": [20.0],
            "parameter_unitstyle": 1
        }}
    }
}, 570, 230)

dial_makeup = place_raw({
    "box": {
        "maxclass": "live.dial", "varname": "makeup", "text": "live.dial",
        "numinlets": 1, "numoutlets": 2, "outlettype": ["", "float"],
        "patching_rect": [640.0, 230.0, 44.0, 48.0],
        "presentation": 1, "presentation_rect": [130.0, 30.0, 44.0, 48.0],
        "parameter_enable": 1, **DIAL_COLORS,
        "saved_attribute_attributes": {"valueof": {
            "parameter_longname": "Makeup", "parameter_shortname": "Gain",
            "parameter_type": 0, "parameter_mmin": 1.0, "parameter_mmax": 10.0,
            "parameter_initial_enable": 1, "parameter_initial": [1.0],
            "parameter_unitstyle": 1
        }}
    }
}, 640, 230)

# Connect dials
patch.connect(
    [dial_thresh.outs[0], sig_thresh.ins[0]],
    [dial_makeup.outs[0], sig_makeup.ins[0]],
)

# ============================================================
# TITLE
# ============================================================

title = place_raw({
    "box": {
        "maxclass": "comment", "text": "Compressor",
        "numinlets": 1, "numoutlets": 0, "outlettype": [],
        "patching_rect": [500.0, 300.0, 80.0, 20.0],
        "presentation": 1, "presentation_rect": [8.0, 4.0, 100.0, 16.0],
        "fontsize": 11.0, "fontface": 1,
        "textcolor": [0.85, 0.85, 0.9, 1.0]
    }
}, 500, 300)

# ============================================================
# SAVE
# ============================================================

patcher_json = patch.get_json()
patcher_json["patcher"]["openinpresentation"] = 1

with open("device.maxpat", "w") as f:
    json.dump(patcher_json, f, indent=2)
print("Saved: device.maxpat")

from amxd import save_amxd
save_amxd(patcher_json, "device.amxd", device_type="audio_effect")
print("Saved: device.amxd")

print(f"Total objects: {patch.num_objs}")
