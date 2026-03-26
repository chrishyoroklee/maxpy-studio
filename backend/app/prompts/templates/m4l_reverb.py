"""
Max for Live Reverb (Audio Effect)
====================================
A simple feedback delay network reverb with one knob.

  Mix — dry/wet balance (0 = dry, 1 = all reverb)

Signal flow:
  plugin~ (stereo from Ableton)
    └─ +~ → *~ 0.5 (sum to mono)
          │
     ┌────┤ (dry)
     │    │
     │  4 parallel delay lines with prime-number delays:
     │    tapin~ → tapout~ 37ms → *~ 0.7 (feedback) ──┐
     │    tapin~ → tapout~ 53ms → *~ 0.7 ─────────────┤
     │    tapin~ → tapout~ 71ms → *~ 0.7 ─────────────┤
     │    tapin~ → tapout~ 97ms → *~ 0.7 ─────────────┤
     │                                                  │
     │    +~ → +~ (sum all 4 taps) → *~ 0.25 ─────────┘
     │          │ (wet/reverb signal)
     │          │
     └── dry*(1-mix) + wet*mix → clip~ → plugout~

  Prime-number delays avoid metallic resonances.
  Each line feeds back into itself for sustained reverb tail.

Usage in Ableton Live:
  1. Drag the .amxd onto an audio track
  2. Mix controls how much reverb you hear
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
# REVERB (4 parallel feedback delay lines, prime-number delays)
# ============================================================

patch.set_position(30, 200)
patch.place("comment === REVERB NETWORK ===")[0]

# Delay times in ms (prime numbers to avoid metallic resonances)
DELAYS = [37, 53, 71, 97]
FEEDBACK = 0.7
COL_W = 100

tapins = []
tapouts = []
fb_gains = []
input_sums = []

for i, delay_ms in enumerate(DELAYS):
    x = 30 + i * COL_W

    # Input summer: mono input + feedback → tapin~
    patch.set_position(x, 235)
    isum = patch.place("+~")[0]

    patch.set_position(x, 275)
    tap_in = patch.place(f"tapin~ {delay_ms + 50}")[0]

    patch.set_position(x, 315)
    tap_out = patch.place(f"tapout~ {delay_ms}")[0]

    patch.set_position(x, 355)
    fb = patch.place(f"*~ {FEEDBACK}")[0]

    # Wire: input → summer → tapin~ → tapout~ → feedback → back to summer
    patch.connect(
        [norm.outs[0], isum.ins[0]],
        [fb.outs[0], isum.ins[1]],
        [isum.outs[0], tap_in.ins[0]],
        [tap_in.outs[0], tap_out.ins[0]],
        [tap_out.outs[0], fb.ins[0]],
    )

    tapins.append(tap_in)
    tapouts.append(tap_out)
    fb_gains.append(fb)
    input_sums.append(isum)

# Sum all 4 delay taps
patch.set_position(30, 410)
patch.place("comment === REVERB SUM ===")[0]

patch.set_position(30, 445)
sum12 = patch.place("+~")[0]

patch.set_position(200, 445)
sum34 = patch.place("+~")[0]

patch.set_position(115, 485)
sum_all = patch.place("+~")[0]

# Normalize (4 taps summed → divide by 4)
patch.set_position(115, 525)
reverb_norm = patch.place("*~ 0.25")[0]

patch.connect(
    [tapouts[0].outs[0], sum12.ins[0]],
    [tapouts[1].outs[0], sum12.ins[1]],
    [tapouts[2].outs[0], sum34.ins[0]],
    [tapouts[3].outs[0], sum34.ins[1]],
    [sum12.outs[0], sum_all.ins[0]],
    [sum34.outs[0], sum_all.ins[1]],
    [sum_all.outs[0], reverb_norm.ins[0]],
)

# ============================================================
# DRY/WET MIX: dry*(1-mix) + wet*mix
# ============================================================

patch.set_position(30, 575)
patch.place("comment === MIX ===")[0]

# Mix signal and complement (1 - mix)
patch.set_position(430, 575)
sig_mix = patch.place("sig~")[0]

patch.set_position(430, 615)
mix_inv = patch.place("*~ -1.")[0]

patch.set_position(430, 655)
mix_comp = patch.place("+~ 1.")[0]

patch.connect(
    [sig_mix.outs[0], mix_inv.ins[0]],
    [mix_inv.outs[0], mix_comp.ins[0]],
)

# Dry path: input * (1-mix)
patch.set_position(30, 615)
dry = patch.place("*~")[0]

# Wet path: reverb * mix
patch.set_position(30, 655)
wet = patch.place("*~")[0]

# Sum dry + wet
patch.set_position(30, 695)
mix_sum = patch.place("+~")[0]

patch.connect(
    [norm.outs[0], dry.ins[0]],
    [mix_comp.outs[0], dry.ins[1]],
    [reverb_norm.outs[0], wet.ins[0]],
    [sig_mix.outs[0], wet.ins[1]],
    [dry.outs[0], mix_sum.ins[0]],
    [wet.outs[0], mix_sum.ins[1]],
)

# ============================================================
# OUTPUT
# ============================================================

patch.set_position(30, 745)
patch.place("comment === OUTPUT ===")[0]

patch.set_position(30, 780)
clip = patch.place("clip~ -1. 1.")[0]

patch.set_position(30, 820)
plugout = patch.place("plugout~")[0]

patch.connect(
    [mix_sum.outs[0], clip.ins[0]],
    [clip.outs[0], plugout.ins[0]],
    [clip.outs[0], plugout.ins[1]],
)

# ============================================================
# CONTROL
# ============================================================

patch.set_position(550, 200)
patch.place("comment === CONTROL ===")[0]

dial_mix = place_raw({
    "box": {
        "maxclass": "live.dial",
        "varname": "mix",
        "text": "live.dial",
        "numinlets": 1,
        "numoutlets": 2,
        "outlettype": ["", "float"],
        "patching_rect": [550.0, 235.0, 44.0, 48.0],
        "presentation": 1,
        "presentation_rect": [15.0, 30.0, 44.0, 48.0],
        "parameter_enable": 1,
        "activedialcolor": [0.55, 0.45, 1.0, 1.0],
        "dialcolor": [0.15, 0.12, 0.3, 1.0],
        "activeneedlecolor": [0.85, 0.82, 1.0, 1.0],
        "needlecolor": [0.5, 0.45, 0.7, 1.0],
        "textcolor": [0.85, 0.82, 1.0, 1.0],
        "saved_attribute_attributes": {
            "valueof": {
                "parameter_longname": "Mix",
                "parameter_shortname": "Mix",
                "parameter_type": 0,
                "parameter_mmin": 0.0,
                "parameter_mmax": 1.0,
                "parameter_initial_enable": 1,
                "parameter_initial": [0.3],
                "parameter_unitstyle": 1
            }
        }
    }
}, 550, 235)

patch.connect(
    [dial_mix.outs[0], sig_mix.ins[0]],
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
        "patching_rect": [600.0, 400.0, 80.0, 90.0],
        "presentation": 1,
        "presentation_rect": [0.0, 0.0, 80.0, 90.0],
        "bgcolor": [0.1, 0.08, 0.18, 1.0],
        "mode": 0,
        "rounded": 0,
        "background": 1
    }
}, 600, 400)

title = place_raw({
    "box": {
        "maxclass": "comment",
        "text": "Reverb",
        "numinlets": 1,
        "numoutlets": 0,
        "outlettype": [],
        "patching_rect": [600.0, 500.0, 80.0, 20.0],
        "presentation": 1,
        "presentation_rect": [12.0, 6.0, 60.0, 18.0],
        "fontsize": 11.0,
        "fontface": 1,
        "textcolor": [0.55, 0.45, 1.0, 1.0]
    }
}, 600, 500)

# ============================================================
# SAVE
# ============================================================

patcher_json = patch.get_json()
patcher_json["patcher"]["openinpresentation"] = 1

with open("examples/m4l_reverb.maxpat", "w") as f:
    json.dump(patcher_json, f, indent=2)
print("Saved: examples/m4l_reverb.maxpat")

from amxd import save_amxd
save_amxd(patcher_json, "examples/m4l_reverb.amxd", device_type="audio_effect")
print("Saved: examples/m4l_reverb.amxd")

print(f"Total objects: {patch.num_objs}")
