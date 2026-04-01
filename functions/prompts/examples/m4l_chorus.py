"""
Max for Live Chorus (Audio Effect)
===================================
A two-knob chorus with a hot pink UI.

  Rate  — LFO speed (0.1–5 Hz)
  Depth — delay modulation amount (0–5 ms)

Signal flow:
  plugin~ (stereo from Ableton)
    └─ +~ → *~ 0.5 (sum to mono)
          │
     ┌────┤ (dry)
     │    │
     │  tapin~ 50 (write to delay buffer)
     │    │
     │  tapout~ 7 ← delay time from snapshot~ ← LFO
     │    │ (wet)
     │    │
     └─ +~ (dry + wet) → *~ 0.5
                            │
                      clip~ -1. 1.
                            │
                       plugout~

LFO chain:
  cycle~ rate → *~ depth → +~ 7. → snapshot~ 20 (signal → float → tapout~)

Usage in Ableton Live:
  1. Drag the .amxd onto an audio track
  2. Rate sets the shimmer speed, Depth sets how thick the chorus is
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
        "patching_rect": [600.0, 200.0, 140.0, 90.0],
        "presentation": 1,
        "presentation_rect": [0.0, 0.0, 140.0, 90.0],
        "bgcolor": [1.0, 0.18, 0.56, 1.0],
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
# DELAY LINE (chorus core)
# ============================================================

patch.set_position(30, 200)
patch.place("comment === CHORUS DELAY ===")[0]

patch.set_position(30, 235)
tapin = patch.place("tapin~ 50")[0]

patch.set_position(30, 275)
tapout = patch.place("tapout~ 7")[0]

# Audio → delay buffer, and tapin~ → tapout~ (buffer reference)
patch.connect(
    [norm.outs[0], tapin.ins[0]],
    [tapin.outs[0], tapout.ins[0]],
)

# ============================================================
# LFO (modulates delay time for chorus shimmer)
# ============================================================

patch.set_position(250, 200)
patch.place("comment === LFO ===")[0]

patch.set_position(250, 235)
lfo = patch.place("cycle~ 0.5")[0]

# Scale LFO by depth (ms), then offset to center delay (7 ms)
patch.set_position(250, 275)
lfo_depth = patch.place("*~ 2")[0]

patch.set_position(250, 315)
lfo_center = patch.place("+~ 7.")[0]

# Convert signal to float messages for tapout~ delay time
patch.set_position(250, 355)
snap = patch.place("snapshot~ 20 @active 1")[0]

patch.connect(
    [lfo.outs[0], lfo_depth.ins[0]],
    [lfo_depth.outs[0], lfo_center.ins[0]],
    [lfo_center.outs[0], snap.ins[0]],
    [snap.outs[0], tapout.ins[0]],          # float delay time → tapout~
)

# ============================================================
# CONTROLS (live.dial — automatable in Ableton)
# ============================================================

patch.set_position(430, 200)
patch.place("comment === CONTROLS ===")[0]

# Pink dial colors
DIAL_COLORS = {
    "activedialcolor": [1.0, 0.18, 0.56, 1.0],
    "dialcolor": [0.45, 0.1, 0.28, 1.0],
    "activeneedlecolor": [1.0, 1.0, 1.0, 1.0],
    "needlecolor": [0.9, 0.9, 0.9, 1.0],
    "textcolor": [1.0, 1.0, 1.0, 1.0],
}

dial_rate = place_raw({
    "box": {
        "maxclass": "live.dial",
        "varname": "rate",
        "text": "live.dial",
        "numinlets": 1,
        "numoutlets": 2,
        "outlettype": ["", "float"],
        "patching_rect": [430.0, 230.0, 44.0, 48.0],
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
                "parameter_mmax": 5.0,
                "parameter_initial_enable": 1,
                "parameter_initial": [0.5],
                "parameter_unitstyle": 1,
                "parameter_exponent": 2.0
            }
        }
    }
}, 430, 230)

dial_depth = place_raw({
    "box": {
        "maxclass": "live.dial",
        "varname": "depth",
        "text": "live.dial",
        "numinlets": 1,
        "numoutlets": 2,
        "outlettype": ["", "float"],
        "patching_rect": [500.0, 230.0, 44.0, 48.0],
        "presentation": 1,
        "presentation_rect": [75.0, 30.0, 44.0, 48.0],
        "parameter_enable": 1,
        **DIAL_COLORS,
        "saved_attribute_attributes": {
            "valueof": {
                "parameter_longname": "Depth",
                "parameter_shortname": "Depth",
                "parameter_type": 0,
                "parameter_mmin": 0.0,
                "parameter_mmax": 5.0,
                "parameter_initial_enable": 1,
                "parameter_initial": [2.0],
                "parameter_unitstyle": 1
            }
        }
    }
}, 500, 230)

# Rate → LFO frequency, Depth → LFO amplitude (ms)
patch.connect(
    [dial_rate.outs[0], lfo.ins[0]],
    [dial_depth.outs[0], lfo_depth.ins[1]],
)

# ============================================================
# MIX (dry + wet)
# ============================================================

patch.set_position(30, 340)
patch.place("comment === MIX ===")[0]

patch.set_position(30, 375)
mix = patch.place("+~")[0]

patch.set_position(30, 415)
mix_norm = patch.place("*~ 0.5")[0]

patch.connect(
    [norm.outs[0], mix.ins[0]],           # dry signal
    [tapout.outs[0], mix.ins[1]],         # wet (delayed) signal
    [mix.outs[0], mix_norm.ins[0]],
)

# ============================================================
# OUTPUT
# ============================================================

patch.set_position(30, 465)
patch.place("comment === OUTPUT ===")[0]

patch.set_position(30, 500)
clip = patch.place("clip~ -1. 1.")[0]

patch.set_position(30, 540)
plugout = patch.place("plugout~")[0]

patch.connect(
    [mix_norm.outs[0], clip.ins[0]],
    [clip.outs[0], plugout.ins[0]],       # mono → left
    [clip.outs[0], plugout.ins[1]],       # mono → right (mirrored)
)

# ============================================================
# PRESENTATION UI (title on top of pink panel)
# ============================================================

title = place_raw({
    "box": {
        "maxclass": "comment",
        "text": "Chorus",
        "numinlets": 1,
        "numoutlets": 0,
        "outlettype": [],
        "patching_rect": [600.0, 300.0, 80.0, 20.0],
        "presentation": 1,
        "presentation_rect": [15.0, 6.0, 100.0, 18.0],
        "fontsize": 11.0,
        "fontface": 1,
        "textcolor": [1.0, 1.0, 1.0, 1.0]
    }
}, 600, 300)

# ============================================================
# SAVE (enable presentation mode)
# ============================================================

patcher_json = patch.get_json()
patcher_json["patcher"]["openinpresentation"] = 1

with open("examples/m4l_chorus.maxpat", "w") as f:
    json.dump(patcher_json, f, indent=2)
print("Saved: examples/m4l_chorus.maxpat")

from amxd import save_amxd
save_amxd(patcher_json, "examples/m4l_chorus.amxd", device_type="audio_effect")
print("Saved: examples/m4l_chorus.amxd")

print(f"Total objects: {patch.num_objs}")
