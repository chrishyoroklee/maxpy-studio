"""
Max for Live Distortion (Audio Effect)
=======================================
A 3-knob overdrive inspired by the Tube Screamer circuit.

  Drive — pre-gain before soft clipping (1–50)
  Tone  — post-distortion lowpass cutoff (200–8000 Hz)
  Mix   — dry/wet blend (0–1)

Signal flow:
  plugin~ (stereo from Ableton)
    └─ +~ → *~ 0.5 (sum to mono)
          │
     ┌────┤ (dry path)
     │    │
     │  *~ drive (pre-gain)
     │    │
     │  overdrive~ (soft clip, tube saturation)
     │    │
     │  lores~ tone (tame harsh artifacts)
     │    │ (wet path)
     │    │
     │  Dry/Wet mix: dry*(1-mix) + wet*mix
     │    │
     └────┘
          │
     clip~ -1. 1.
          │
     plugout~

Usage in Ableton Live:
  1. Drag the .amxd onto an audio track
  2. Drive adds gain before the soft clipper
  3. Tone rolls off highs after distortion
  4. Mix blends between clean and distorted signal
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
# PRESENTATION BACKGROUND (placed first = draws behind everything)
# ============================================================

panel = place_raw({
    "box": {
        "maxclass": "panel",
        "text": "panel",
        "numinlets": 1,
        "numoutlets": 0,
        "outlettype": [],
        "patching_rect": [600.0, 200.0, 180.0, 90.0],
        "presentation": 1,
        "presentation_rect": [0.0, 0.0, 180.0, 90.0],
        "bgcolor": [0.18, 0.06, 0.04, 1.0],
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
# DISTORTION (pre-gain → overdrive~ → tone filter)
# ============================================================

patch.set_position(30, 200)
patch.place("comment === DISTORTION ===")[0]

# Pre-gain: multiply input by Drive amount
patch.set_position(30, 235)
pre_gain = patch.place("*~")[0]

# Convert Drive dial float → signal for *~ inlet 1
patch.set_position(200, 235)
sig_drive = patch.place("sig~")[0]

# Soft clipper (tube saturation)
patch.set_position(30, 275)
overdrive = patch.place("overdrive~ 2")[0]

# Post-distortion tone filter
patch.set_position(30, 315)
tone_filt = patch.place("lores~ 3000 0.3")[0]

# Convert Tone dial float → signal for lores~ frequency inlet
patch.set_position(200, 315)
sig_tone = patch.place("sig~")[0]

patch.connect(
    [norm.outs[0], pre_gain.ins[0]],
    [sig_drive.outs[0], pre_gain.ins[1]],
    [pre_gain.outs[0], overdrive.ins[0]],
    [overdrive.outs[0], tone_filt.ins[0]],
    [sig_tone.outs[0], tone_filt.ins[1]],
)

# ============================================================
# DRY/WET MIX
# ============================================================

patch.set_position(30, 380)
patch.place("comment === MIX ===")[0]

# Convert Mix dial → signal
patch.set_position(350, 380)
sig_mix = patch.place("sig~")[0]

# 1 - mix
patch.set_position(350, 420)
one_minus_mix = patch.place("-~ 1.")[0]

# wet * mix
patch.set_position(30, 420)
wet_scaled = patch.place("*~")[0]

# dry * (1 - mix)
patch.set_position(200, 420)
dry_scaled = patch.place("*~")[0]

# Sum wet + dry
patch.set_position(30, 460)
mix_sum = patch.place("+~")[0]

patch.connect(
    # Mix signal path
    [sig_mix.outs[0], one_minus_mix.ins[0]],
    # Wet path: distorted * mix
    [tone_filt.outs[0], wet_scaled.ins[0]],
    [sig_mix.outs[0], wet_scaled.ins[1]],
    # Dry path: clean * (1 - mix)
    [norm.outs[0], dry_scaled.ins[0]],
    [one_minus_mix.outs[0], dry_scaled.ins[1]],
    # Sum
    [wet_scaled.outs[0], mix_sum.ins[0]],
    [dry_scaled.outs[0], mix_sum.ins[1]],
)

# ============================================================
# CONTROLS (live.dial — automatable in Ableton)
# ============================================================

patch.set_position(430, 200)
patch.place("comment === CONTROLS ===")[0]

# Red/orange color scheme (distortion pedal vibe)
DIAL_COLORS = {
    "activedialcolor": [0.95, 0.2, 0.1, 1.0],
    "dialcolor": [0.35, 0.1, 0.05, 1.0],
    "activeneedlecolor": [1.0, 0.9, 0.8, 1.0],
    "needlecolor": [0.8, 0.6, 0.5, 1.0],
    "textcolor": [1.0, 0.9, 0.8, 1.0],
}

dial_drive = place_raw({
    "box": {
        "maxclass": "live.dial",
        "varname": "drive",
        "text": "live.dial",
        "numinlets": 1,
        "numoutlets": 2,
        "outlettype": ["", "float"],
        "patching_rect": [430.0, 230.0, 44.0, 48.0],
        "presentation": 1,
        "presentation_rect": [10.0, 30.0, 44.0, 48.0],
        "parameter_enable": 1,
        **DIAL_COLORS,
        "saved_attribute_attributes": {
            "valueof": {
                "parameter_longname": "Drive",
                "parameter_shortname": "Drive",
                "parameter_type": 0,
                "parameter_mmin": 1.0,
                "parameter_mmax": 50.0,
                "parameter_initial_enable": 1,
                "parameter_initial": [5.0],
                "parameter_unitstyle": 1,
                "parameter_exponent": 2.0
            }
        }
    }
}, 430, 230)

dial_tone = place_raw({
    "box": {
        "maxclass": "live.dial",
        "varname": "tone",
        "text": "live.dial",
        "numinlets": 1,
        "numoutlets": 2,
        "outlettype": ["", "float"],
        "patching_rect": [500.0, 230.0, 44.0, 48.0],
        "presentation": 1,
        "presentation_rect": [65.0, 30.0, 44.0, 48.0],
        "parameter_enable": 1,
        **DIAL_COLORS,
        "saved_attribute_attributes": {
            "valueof": {
                "parameter_longname": "Tone",
                "parameter_shortname": "Tone",
                "parameter_type": 0,
                "parameter_mmin": 200.0,
                "parameter_mmax": 8000.0,
                "parameter_initial_enable": 1,
                "parameter_initial": [3000.0],
                "parameter_unitstyle": 1,
                "parameter_exponent": 2.0
            }
        }
    }
}, 500, 230)

dial_mix = place_raw({
    "box": {
        "maxclass": "live.dial",
        "varname": "mix",
        "text": "live.dial",
        "numinlets": 1,
        "numoutlets": 2,
        "outlettype": ["", "float"],
        "patching_rect": [570.0, 230.0, 44.0, 48.0],
        "presentation": 1,
        "presentation_rect": [120.0, 30.0, 44.0, 48.0],
        "parameter_enable": 1,
        **DIAL_COLORS,
        "saved_attribute_attributes": {
            "valueof": {
                "parameter_longname": "Mix",
                "parameter_shortname": "Mix",
                "parameter_type": 0,
                "parameter_mmin": 0.0,
                "parameter_mmax": 1.0,
                "parameter_initial_enable": 1,
                "parameter_initial": [0.7],
                "parameter_unitstyle": 1
            }
        }
    }
}, 570, 230)

# Connect dials to processing
patch.connect(
    [dial_drive.outs[0], sig_drive.ins[0]],
    [dial_tone.outs[0], sig_tone.ins[0]],
    [dial_mix.outs[0], sig_mix.ins[0]],
)

# ============================================================
# OUTPUT
# ============================================================

patch.set_position(30, 510)
patch.place("comment === OUTPUT ===")[0]

patch.set_position(30, 545)
clip = patch.place("clip~ -1. 1.")[0]

patch.set_position(30, 585)
plugout = patch.place("plugout~")[0]

patch.connect(
    [mix_sum.outs[0], clip.ins[0]],
    [clip.outs[0], plugout.ins[0]],
    [clip.outs[0], plugout.ins[1]],
)

# ============================================================
# PRESENTATION UI (title on top of panel)
# ============================================================

title = place_raw({
    "box": {
        "maxclass": "comment",
        "text": "Distortion",
        "numinlets": 1,
        "numoutlets": 0,
        "outlettype": [],
        "patching_rect": [600.0, 300.0, 80.0, 20.0],
        "presentation": 1,
        "presentation_rect": [10.0, 6.0, 100.0, 18.0],
        "fontsize": 11.0,
        "fontface": 1,
        "textcolor": [1.0, 0.9, 0.8, 1.0]
    }
}, 600, 300)

# ============================================================
# SAVE (enable presentation mode)
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
