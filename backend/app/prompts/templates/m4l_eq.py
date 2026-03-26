"""
Max for Live 3-Band EQ (Audio Effect)
=====================================
A simple 3-band crossover equalizer that runs as a Max for Live audio effect.

Signal flow:
  plugin~ (stereo audio from Ableton track)
    └─ +~ → *~ 0.5 (sum to mono, normalize)
         │
         ├─ lores~ 300 Hz (LOW band)  ─── *~ (Low Gain)  ──┐
         ├─ subtract low → lores~ 3kHz (MID band) ─── *~ (Mid Gain)  ──┤
         └─ subtract low+mid (HIGH band) ─── *~ (High Gain) ──┤
                                                                │
                                                   +~ (sum all) ┘
                                                        │
                                                  clip~ -1. 1.
                                                        │
                                                   plugout~

Usage in Ableton Live:
  1. Drag the .amxd onto an audio track (or after an instrument)
  2. Adjust Low, Mid, and High gain dials to shape the sound
  3. All three dials are automatable in Ableton's automation lanes
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

# plugin~ receives stereo audio from the Ableton track
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

# Normalize mono sum
patch.set_position(30, 145)
norm = patch.place("*~ 0.5")[0]

patch.connect(
    [plugin.outs[0], sum_stereo.ins[0]],   # left → +~
    [plugin.outs[1], sum_stereo.ins[1]],   # right → +~
    [sum_stereo.outs[0], norm.ins[0]],     # sum → normalize
)

# ============================================================
# CROSSOVER FILTERS (split into 3 bands)
# ============================================================

patch.set_position(30, 195)
patch.place("comment === CROSSOVER FILTERS ===")[0]

# Low band: lowpass at 300 Hz
patch.set_position(30, 230)
lp_low = patch.place("lores~ 300 0.5")[0]

# Subtract low from input → mid+high
patch.set_position(30, 270)
sub1 = patch.place("-~")[0]

# Mid band: lowpass at 3000 Hz (applied to mid+high signal)
patch.set_position(30, 310)
lp_mid = patch.place("lores~ 3000 0.5")[0]

# Subtract mid from mid+high → high
patch.set_position(30, 350)
sub2 = patch.place("-~")[0]

patch.connect(
    # Mono signal → low-pass filter (extracts low band)
    [norm.outs[0], lp_low.ins[0]],
    # Mono signal → subtractor inlet 0 (full signal)
    [norm.outs[0], sub1.ins[0]],
    # Low-pass output → subtractor inlet 1 (subtract low = mid+high)
    [lp_low.outs[0], sub1.ins[1]],
    # Mid+high → second low-pass (extracts mid band)
    [sub1.outs[0], lp_mid.ins[0]],
    # Mid+high → second subtractor inlet 0
    [sub1.outs[0], sub2.ins[0]],
    # Mid low-pass output → subtractor inlet 1 (subtract mid = high)
    [lp_mid.outs[0], sub2.ins[1]],
)

# ============================================================
# BAND GAINS
# ============================================================

patch.set_position(250, 195)
patch.place("comment === BAND GAINS ===")[0]

# Low gain (default 1.0 = unity)
patch.set_position(250, 230)
gain_low = patch.place("*~ 1.")[0]

# Mid gain
patch.set_position(250, 310)
gain_mid = patch.place("*~ 1.")[0]

# High gain
patch.set_position(250, 350)
gain_high = patch.place("*~ 1.")[0]

# Wire each band to its gain stage
patch.connect(
    [lp_low.outs[0], gain_low.ins[0]],     # low band → low gain
    [lp_mid.outs[0], gain_mid.ins[0]],     # mid band → mid gain
    [sub2.outs[0], gain_high.ins[0]],      # high band → high gain
)

# ============================================================
# CONTROLS (live.dial — automatable in Ableton)
# ============================================================

patch.set_position(430, 195)
patch.place("comment === CONTROLS ===")[0]

# Blue theme dial colors
DIAL_COLORS = {
    "activedialcolor": [0.3, 0.75, 1.0, 1.0],
    "dialcolor": [0.12, 0.2, 0.3, 1.0],
    "activeneedlecolor": [0.85, 0.95, 1.0, 1.0],
    "needlecolor": [0.5, 0.65, 0.8, 1.0],
    "textcolor": [0.8, 0.9, 1.0, 1.0],
}

dial_low = place_raw({
    "box": {
        "maxclass": "live.dial",
        "varname": "low_gain",
        "text": "live.dial",
        "numinlets": 1,
        "numoutlets": 2,
        "outlettype": ["", "float"],
        "patching_rect": [430.0, 218.0, 41.0, 48.0],
        "presentation": 1,
        "presentation_rect": [15.0, 30.0, 44.0, 48.0],
        "parameter_enable": 1,
        **DIAL_COLORS,
        "saved_attribute_attributes": {
            "valueof": {
                "parameter_longname": "Low Gain",
                "parameter_shortname": "Low",
                "parameter_type": 0,
                "parameter_mmin": 0.0,
                "parameter_mmax": 2.0,
                "parameter_initial_enable": 1,
                "parameter_initial": [1.0],
                "parameter_unitstyle": 1
            }
        }
    }
}, 430, 218)

dial_mid = place_raw({
    "box": {
        "maxclass": "live.dial",
        "varname": "mid_gain",
        "text": "live.dial",
        "numinlets": 1,
        "numoutlets": 2,
        "outlettype": ["", "float"],
        "patching_rect": [430.0, 298.0, 41.0, 48.0],
        "presentation": 1,
        "presentation_rect": [75.0, 30.0, 44.0, 48.0],
        "parameter_enable": 1,
        **DIAL_COLORS,
        "saved_attribute_attributes": {
            "valueof": {
                "parameter_longname": "Mid Gain",
                "parameter_shortname": "Mid",
                "parameter_type": 0,
                "parameter_mmin": 0.0,
                "parameter_mmax": 2.0,
                "parameter_initial_enable": 1,
                "parameter_initial": [1.0],
                "parameter_unitstyle": 1
            }
        }
    }
}, 430, 298)

dial_high = place_raw({
    "box": {
        "maxclass": "live.dial",
        "varname": "high_gain",
        "text": "live.dial",
        "numinlets": 1,
        "numoutlets": 2,
        "outlettype": ["", "float"],
        "patching_rect": [430.0, 350.0, 41.0, 48.0],
        "presentation": 1,
        "presentation_rect": [135.0, 30.0, 44.0, 48.0],
        "parameter_enable": 1,
        **DIAL_COLORS,
        "saved_attribute_attributes": {
            "valueof": {
                "parameter_longname": "High Gain",
                "parameter_shortname": "High",
                "parameter_type": 0,
                "parameter_mmin": 0.0,
                "parameter_mmax": 2.0,
                "parameter_initial_enable": 1,
                "parameter_initial": [1.0],
                "parameter_unitstyle": 1
            }
        }
    }
}, 430, 350)

# Wire dials to gain stages (live.dial outlet 0 → *~ inlet 1)
patch.connect(
    [dial_low.outs[0], gain_low.ins[1]],
    [dial_mid.outs[0], gain_mid.ins[1]],
    [dial_high.outs[0], gain_high.ins[1]],
)

# ============================================================
# MIXER (sum the 3 bands back together)
# ============================================================

patch.set_position(250, 400)
patch.place("comment === MIXER ===")[0]

patch.set_position(250, 435)
mix1 = patch.place("+~")[0]

patch.set_position(250, 475)
mix2 = patch.place("+~")[0]

patch.connect(
    [gain_low.outs[0], mix1.ins[0]],      # low → mixer
    [gain_mid.outs[0], mix1.ins[1]],      # mid → mixer
    [mix1.outs[0], mix2.ins[0]],          # (low+mid) → mixer
    [gain_high.outs[0], mix2.ins[1]],     # high → mixer
)

# ============================================================
# OUTPUT
# ============================================================

patch.set_position(250, 520)
patch.place("comment === OUTPUT ===")[0]

patch.set_position(250, 555)
clip = patch.place("clip~ -1. 1.")[0]

patch.set_position(250, 595)
plugout = patch.place("plugout~")[0]

patch.connect(
    [mix2.outs[0], clip.ins[0]],          # mixer → safety limiter
    [clip.outs[0], plugout.ins[0]],       # mono EQ output → left
    [clip.outs[0], plugout.ins[1]],       # mono EQ output → right (mirrored)
)

# ============================================================
# SPECTRUM VISUALIZER (taps the EQ output)
# ============================================================

spectroscope = place_raw({
    "box": {
        "maxclass": "spectroscope~",
        "text": "spectroscope~",
        "numinlets": 2,
        "numoutlets": 1,
        "outlettype": [""],
        "patching_rect": [450.0, 555.0, 200.0, 80.0],
        "presentation": 1,
        "presentation_rect": [8.0, 85.0, 180.0, 75.0],
        "bgcolor": [0.08, 0.08, 0.12, 1.0],
        "fgcolor": [0.3, 0.75, 1.0, 1.0],
        "gridcolor": [0.15, 0.2, 0.3, 0.5],
        "sono": 0
    }
}, 450, 555)

# Feed the EQ output into the spectroscope
patch.connect(
    [mix2.outs[0], spectroscope.ins[0]],
)

# ============================================================
# PRESENTATION UI
# ============================================================

panel = place_raw({
    "box": {
        "maxclass": "panel",
        "text": "panel",
        "numinlets": 1,
        "numoutlets": 0,
        "outlettype": [],
        "patching_rect": [600.0, 100.0, 200.0, 170.0],
        "presentation": 1,
        "presentation_rect": [0.0, 0.0, 196.0, 168.0],
        "bgcolor": [0.12, 0.12, 0.16, 1.0],
        "mode": 0,
        "rounded": 0,
        "background": 1
    }
}, 600, 100)

title = place_raw({
    "box": {
        "maxclass": "comment",
        "text": "3-Band EQ",
        "numinlets": 1,
        "numoutlets": 0,
        "outlettype": [],
        "patching_rect": [600.0, 30.0, 100.0, 20.0],
        "presentation": 1,
        "presentation_rect": [15.0, 6.0, 160.0, 18.0],
        "fontsize": 12.0,
        "fontface": 1,
        "textcolor": [0.3, 0.75, 1.0, 1.0]
    }
}, 600, 30)

# ============================================================
# INSTRUCTIONS
# ============================================================

patch.set_position(30, 645)
patch.place("comment Drag this .amxd onto an audio track in Ableton Live. Adjust Low/Mid/High dials to shape the EQ.")[0]

# ============================================================
# SAVE (enable presentation mode on the patcher before writing)
# ============================================================

patcher_json = patch.get_json()
patcher_json["patcher"]["openinpresentation"] = 1

# Write .maxpat manually (need the modified patcher JSON)
with open("examples/m4l_eq.maxpat", "w") as f:
    json.dump(patcher_json, f, indent=2)
print("Saved: examples/m4l_eq.maxpat")

from amxd import save_amxd
save_amxd(patcher_json, "examples/m4l_eq.amxd", device_type="audio_effect")
print("Saved: examples/m4l_eq.amxd")

print(f"Total objects: {patch.num_objs}")
