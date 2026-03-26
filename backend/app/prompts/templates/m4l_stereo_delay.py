"""
Max for Live Stereo Delay (Audio Effect)
=========================================
A ping-pong stereo delay with feedback.

  Time     — delay time in ms (50–1000 ms)
  Feedback — how much delayed signal feeds back (0–0.9)
  Mix      — dry/wet balance (0 = dry, 1 = all wet)

Signal flow:
  plugin~ (stereo from Ableton)
    ├─ out[0] (L) → left delay chain
    └─ out[1] (R) → right delay chain

  Left chain:  tapin~ 2000 → tapout~ (time) → *~ (feedback) → back to tapin~
  Right chain: tapin~ 2000 → tapout~ (time * 0.75) → *~ (feedback) → back to tapin~

  The right delay is 75% of the left time, creating a ping-pong stereo spread.

  Dry/wet mix per channel:
    dry * (1 - mix) + wet * mix → clip~ → plugout~

Usage in Ableton Live:
  1. Drag the .amxd onto an audio track
  2. Time sets the delay length, Feedback sets how many repeats
  3. Mix blends between dry and wet signal
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
# AUDIO INPUT (keep stereo — no mono sum for this effect)
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

# ============================================================
# LEFT DELAY CHAIN
# ============================================================

patch.set_position(30, 120)
patch.place("comment === LEFT DELAY ===")[0]

# tapin~/tapout~ pair for left channel
patch.set_position(30, 155)
tapin_l = patch.place("tapin~ 2000")[0]

patch.set_position(30, 195)
tapout_l = patch.place("tapout~ 300")[0]

# Feedback: delayed signal * feedback amount → back into tapin~
# We sum the input + feedback with +~ before tapin~
patch.set_position(30, 235)
fb_gain_l = patch.place("*~ 0.")[0]

# Input summer: plugin~ left + feedback → tapin~
patch.set_position(30, 275)
input_sum_l = patch.place("+~")[0]

patch.connect(
    [plugin.outs[0], input_sum_l.ins[0]],      # dry left → summer
    [fb_gain_l.outs[0], input_sum_l.ins[1]],   # feedback → summer
    [input_sum_l.outs[0], tapin_l.ins[0]],     # summer → delay write
    [tapin_l.outs[0], tapout_l.ins[0]],        # tapin~ → tapout~ (buffer ref)
    [tapout_l.outs[0], fb_gain_l.ins[0]],      # delayed signal → feedback gain
)

# ============================================================
# RIGHT DELAY CHAIN (time * 0.75 for ping-pong offset)
# ============================================================

patch.set_position(250, 120)
patch.place("comment === RIGHT DELAY ===")[0]

patch.set_position(250, 155)
tapin_r = patch.place("tapin~ 2000")[0]

patch.set_position(250, 195)
tapout_r = patch.place("tapout~ 225")[0]

patch.set_position(250, 235)
fb_gain_r = patch.place("*~ 0.")[0]

patch.set_position(250, 275)
input_sum_r = patch.place("+~")[0]

patch.connect(
    [plugin.outs[1], input_sum_r.ins[0]],
    [fb_gain_r.outs[0], input_sum_r.ins[1]],
    [input_sum_r.outs[0], tapin_r.ins[0]],
    [tapin_r.outs[0], tapout_r.ins[0]],
    [tapout_r.outs[0], fb_gain_r.ins[0]],
)

# ============================================================
# DELAY TIME CONTROL
# Convert dial ms → snapshot~ float → tapout~ inlets
# Right channel gets time * 0.75 for ping-pong offset
# ============================================================

patch.set_position(470, 120)
patch.place("comment === DELAY TIME ===")[0]

# Time dial value → sig~ → tapout~ modulation
patch.set_position(470, 155)
sig_time_l = patch.place("sig~")[0]

# Right time = left time * 0.75
patch.set_position(470, 195)
sig_time_r = patch.place("*~ 0.75")[0]

# snapshot~ to convert signal → float for tapout~ delay time
patch.set_position(470, 235)
snap_l = patch.place("snapshot~ 20 @active 1")[0]

patch.set_position(470, 275)
snap_r = patch.place("snapshot~ 20 @active 1")[0]

patch.connect(
    [sig_time_l.outs[0], sig_time_r.ins[0]],   # left time → * 0.75 for right
    [sig_time_l.outs[0], snap_l.ins[0]],        # left time → snapshot~
    [sig_time_r.outs[0], snap_r.ins[0]],        # right time → snapshot~
    [snap_l.outs[0], tapout_l.ins[0]],          # float time → left tapout~
    [snap_r.outs[0], tapout_r.ins[0]],          # float time → right tapout~
)

# ============================================================
# FEEDBACK CONTROL
# sig~ converts dial float to signal for *~ feedback gain
# ============================================================

patch.set_position(470, 320)
sig_fb = patch.place("sig~")[0]

patch.connect(
    [sig_fb.outs[0], fb_gain_l.ins[1]],    # feedback amount → left
    [sig_fb.outs[0], fb_gain_r.ins[1]],    # feedback amount → right
)

# ============================================================
# DRY/WET MIX
# dry * (1-mix) + wet * mix, per channel
#
# For dry: input * (1 - mix)
#   mix → sig~ → *~ -1 → +~ 1 = (1-mix) signal
#   input *~ (1-mix)
# For wet: delayed * mix
#   delayed *~ mix_sig
# Then sum dry + wet per channel
# ============================================================

patch.set_position(30, 340)
patch.place("comment === MIX ===")[0]

# Mix signal and its complement (1 - mix)
patch.set_position(470, 370)
sig_mix = patch.place("sig~")[0]

patch.set_position(470, 410)
mix_inv = patch.place("*~ -1.")[0]

patch.set_position(470, 450)
mix_comp = patch.place("+~ 1.")[0]

patch.connect(
    [sig_mix.outs[0], mix_inv.ins[0]],
    [mix_inv.outs[0], mix_comp.ins[0]],
)

# Left channel mix
patch.set_position(30, 380)
dry_l = patch.place("*~")[0]          # input * (1-mix)

patch.set_position(30, 420)
wet_l = patch.place("*~")[0]          # delayed * mix

patch.set_position(30, 460)
sum_l = patch.place("+~")[0]          # dry + wet

patch.connect(
    [plugin.outs[0], dry_l.ins[0]],        # dry input left
    [mix_comp.outs[0], dry_l.ins[1]],      # * (1 - mix)
    [tapout_l.outs[0], wet_l.ins[0]],      # wet (delayed) left
    [sig_mix.outs[0], wet_l.ins[1]],       # * mix
    [dry_l.outs[0], sum_l.ins[0]],
    [wet_l.outs[0], sum_l.ins[1]],
)

# Right channel mix
patch.set_position(250, 380)
dry_r = patch.place("*~")[0]

patch.set_position(250, 420)
wet_r = patch.place("*~")[0]

patch.set_position(250, 460)
sum_r = patch.place("+~")[0]

patch.connect(
    [plugin.outs[1], dry_r.ins[0]],
    [mix_comp.outs[0], dry_r.ins[1]],
    [tapout_r.outs[0], wet_r.ins[0]],
    [sig_mix.outs[0], wet_r.ins[1]],
    [dry_r.outs[0], sum_r.ins[0]],
    [wet_r.outs[0], sum_r.ins[1]],
)

# ============================================================
# OUTPUT
# ============================================================

patch.set_position(30, 520)
patch.place("comment === OUTPUT ===")[0]

patch.set_position(30, 555)
clip_l = patch.place("clip~ -1. 1.")[0]

patch.set_position(250, 555)
clip_r = patch.place("clip~ -1. 1.")[0]

patch.set_position(140, 595)
plugout = patch.place("plugout~")[0]

patch.connect(
    [sum_l.outs[0], clip_l.ins[0]],
    [sum_r.outs[0], clip_r.ins[0]],
    [clip_l.outs[0], plugout.ins[0]],      # left out
    [clip_r.outs[0], plugout.ins[1]],      # right out
)

# ============================================================
# CONTROLS (live.dial — automatable in Ableton)
# ============================================================

patch.set_position(630, 120)
patch.place("comment === CONTROLS ===")[0]

dial_time = place_raw({
    "box": {
        "maxclass": "live.dial",
        "varname": "time",
        "text": "live.dial",
        "numinlets": 1,
        "numoutlets": 2,
        "outlettype": ["", "float"],
        "patching_rect": [630.0, 155.0, 44.0, 48.0],
        "presentation": 1,
        "presentation_rect": [15.0, 30.0, 44.0, 48.0],
        "parameter_enable": 1,
        "saved_attribute_attributes": {
            "valueof": {
                "parameter_longname": "Time",
                "parameter_shortname": "Time",
                "parameter_type": 0,
                "parameter_mmin": 50.0,
                "parameter_mmax": 1000.0,
                "parameter_initial_enable": 1,
                "parameter_initial": [300.0],
                "parameter_unitstyle": 1,
                "parameter_exponent": 2.0
            }
        }
    }
}, 630, 155)

dial_feedback = place_raw({
    "box": {
        "maxclass": "live.dial",
        "varname": "feedback",
        "text": "live.dial",
        "numinlets": 1,
        "numoutlets": 2,
        "outlettype": ["", "float"],
        "patching_rect": [700.0, 155.0, 44.0, 48.0],
        "presentation": 1,
        "presentation_rect": [75.0, 30.0, 44.0, 48.0],
        "parameter_enable": 1,
        "saved_attribute_attributes": {
            "valueof": {
                "parameter_longname": "Feedback",
                "parameter_shortname": "Fdbk",
                "parameter_type": 0,
                "parameter_mmin": 0.0,
                "parameter_mmax": 0.9,
                "parameter_initial_enable": 1,
                "parameter_initial": [0.4],
                "parameter_unitstyle": 1
            }
        }
    }
}, 700, 155)

dial_mix = place_raw({
    "box": {
        "maxclass": "live.dial",
        "varname": "mix",
        "text": "live.dial",
        "numinlets": 1,
        "numoutlets": 2,
        "outlettype": ["", "float"],
        "patching_rect": [770.0, 155.0, 44.0, 48.0],
        "presentation": 1,
        "presentation_rect": [135.0, 30.0, 44.0, 48.0],
        "parameter_enable": 1,
        "saved_attribute_attributes": {
            "valueof": {
                "parameter_longname": "Mix",
                "parameter_shortname": "Mix",
                "parameter_type": 0,
                "parameter_mmin": 0.0,
                "parameter_mmax": 1.0,
                "parameter_initial_enable": 1,
                "parameter_initial": [0.35],
                "parameter_unitstyle": 1
            }
        }
    }
}, 770, 155)

# Wire dials → sig~ converters
patch.connect(
    [dial_time.outs[0], sig_time_l.ins[0]],
    [dial_feedback.outs[0], sig_fb.ins[0]],
    [dial_mix.outs[0], sig_mix.ins[0]],
)

# ============================================================
# PRESENTATION UI
# ============================================================

title = place_raw({
    "box": {
        "maxclass": "comment",
        "text": "Stereo Delay",
        "numinlets": 1,
        "numoutlets": 0,
        "outlettype": [],
        "patching_rect": [630.0, 300.0, 100.0, 20.0],
        "presentation": 1,
        "presentation_rect": [15.0, 6.0, 160.0, 18.0],
        "fontsize": 11.0,
        "fontface": 1
    }
}, 630, 300)

# ============================================================
# SAVE (enable presentation mode)
# ============================================================

patcher_json = patch.get_json()
patcher_json["patcher"]["openinpresentation"] = 1

with open("examples/m4l_stereo_delay.maxpat", "w") as f:
    json.dump(patcher_json, f, indent=2)
print("Saved: examples/m4l_stereo_delay.maxpat")

from amxd import save_amxd
save_amxd(patcher_json, "examples/m4l_stereo_delay.amxd", device_type="audio_effect")
print("Saved: examples/m4l_stereo_delay.amxd")

print(f"Total objects: {patch.num_objs}")
