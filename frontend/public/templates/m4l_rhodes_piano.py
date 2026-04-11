"""
Max for Live Rhodes EP (M4L Instrument)
=========================================
A simple electric piano using additive synthesis — a fundamental sine plus
a high-frequency "bell" partial that gives the characteristic tine attack.

Signal flow:
  notein → poly 1 1 (last-note-priority mono)
    ├─ pitch → mtof → sig~ → freq_signal
    │    ├─ cycle~(freq)          (fundamental — warm sustained tone)
    │    └─ *~ 14. → sig~ → cycle~(freq * 14)   (bell partial — tine)
    │
    └─ velocity → expr $i1 / 127. → vel_signal
         ├─ → amp_env gate   (peak = velocity)
         └─ → bell scale     (brighter on hard hits)

  fundamental × amp_env + (bell × bell_env × brightness × velocity × 0.3)
    → *~ volume → clip~ -1. 1. → plugout~ (stereo)

Key sonic idea:
  • amp_env = adsr~ 5 1200 0.3 400 — piano-ish: quick attack, slow decay to
    a low sustain level, medium release
  • bell_env = adsr~ 1 150 0 80 — instant attack, decays to 0 in 150ms (the
    tine "clonk" that makes it sound like a Rhodes)
  • Velocity scales both: louder hits AND brighter (more tine character)

Usage in Ableton Live:
  1. Drag the .amxd onto a MIDI track
  2. Play — monophonic, last-note priority (chords won't work; single lines will)
  3. Tweak Brightness for more/less bell character
  4. Tweak Decay for shorter/longer sustain tails
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
# PRESENTATION BACKGROUND (warm Rhodes aesthetic — amber/gold)
# ============================================================

panel = place_raw({
    "box": {
        "maxclass": "panel", "text": "panel",
        "numinlets": 1, "numoutlets": 0, "outlettype": [],
        "patching_rect": [800.0, 100.0, 360.0, 120.0],
        "presentation": 1, "presentation_rect": [0.0, 0.0, 360.0, 120.0],
        "bgcolor": [0.08, 0.05, 0.02, 1.0],
        "mode": 0, "rounded": 0, "background": 1,
    }
}, 800, 100)

header = place_raw({
    "box": {
        "maxclass": "panel", "text": "panel",
        "numinlets": 1, "numoutlets": 0, "outlettype": [],
        "patching_rect": [800.0, 90.0, 360.0, 24.0],
        "presentation": 1, "presentation_rect": [0.0, 0.0, 360.0, 24.0],
        "bgcolor": [0.55, 0.35, 0.10, 1.0],
        "mode": 0, "rounded": 0, "background": 1,
    }
}, 800, 90)

title = place_raw({
    "box": {
        "maxclass": "comment", "text": "RHODES EP",
        "numinlets": 1, "numoutlets": 0, "outlettype": [],
        "patching_rect": [800.0, 70.0, 120.0, 20.0],
        "presentation": 1, "presentation_rect": [12.0, 4.0, 140.0, 18.0],
        "fontsize": 12.0, "fontface": 1,
        "textcolor": [1.0, 0.9, 0.6, 1.0],
    }
}, 800, 70)

# ============================================================
# MIDI INPUT + VOICE ALLOCATION (poly 1 1 = mono, last-note priority)
# ============================================================

patch.set_position(30, 30)
patch.place("comment === MIDI INPUT (mono, last-note priority) ===")[0]

notein_obj = place_raw({
    "box": {
        "maxclass": "newobj", "numinlets": 1, "numoutlets": 3,
        "outlettype": ["int", "int", "int"],
        "patching_rect": [30.0, 65.0, 41.0, 22.0],
        "text": "notein",
    }
}, 30, 65)

# poly 1 1: 1 voice, steal-mode 1 (oldest note replaced)
# Outlets: 0=voice#, 1=pitch, 2=velocity, 3=list
patch.set_position(30, 105)
voice = patch.place("poly 1 1")[0]

patch.connect(
    [notein_obj.outs[0], voice.ins[0]],  # pitch → poly
    [notein_obj.outs[1], voice.ins[1]],  # velocity → poly
)

# ============================================================
# PITCH PATH (poly → mtof → sig~ → freq_signal)
# ============================================================

patch.set_position(30, 145)
patch.place("comment === PITCH ===")[0]

patch.set_position(30, 180)
mtof_obj = patch.place("mtof")[0]

patch.set_position(30, 220)
freq_sig = patch.place("sig~")[0]

patch.connect(
    [voice.outs[1], mtof_obj.ins[0]],     # pitch → mtof
    [mtof_obj.outs[0], freq_sig.ins[0]],  # freq → sig~
)

# ============================================================
# VELOCITY SCALING (shared by amp env gate and bell brightness)
# ============================================================

patch.set_position(250, 30)
patch.place("comment === VELOCITY ===")[0]

vel_scale = place_raw({
    "box": {
        "maxclass": "newobj", "numinlets": 1, "numoutlets": 1,
        "outlettype": ["float"],
        "patching_rect": [250.0, 65.0, 80.0, 22.0],
        "text": "expr $i1 / 127.",
    }
}, 250, 65)

# Velocity → sig~ for use as a signal multiplier on bell amplitude
patch.set_position(250, 105)
vel_sig = patch.place("sig~")[0]

patch.connect(
    [voice.outs[2], vel_scale.ins[0]],
    [vel_scale.outs[0], vel_sig.ins[0]],  # scaled velocity → sig~ for signal-rate use
)

# ============================================================
# FUNDAMENTAL OSCILLATOR
# ============================================================

patch.set_position(30, 270)
patch.place("comment === FUNDAMENTAL ===")[0]

patch.set_position(30, 305)
fundamental = patch.place("cycle~")[0]

patch.connect([freq_sig.outs[0], fundamental.ins[0]])

# ============================================================
# BELL PARTIAL (freq × 14 → cycle~ → bell envelope → scale)
# ============================================================

patch.set_position(200, 270)
patch.place("comment === BELL PARTIAL ===")[0]

# Multiply fundamental freq by 14 to get the bell partial
patch.set_position(200, 305)
bell_freq = patch.place("*~ 14.")[0]

patch.set_position(200, 345)
bell_osc = patch.place("cycle~")[0]

# bell envelope: instant attack, 150ms decay to 0, fast release
# (the "tine clonk" that sells the Rhodes sound)
bell_env = place_raw({
    "box": {
        "maxclass": "newobj", "numinlets": 5, "numoutlets": 4,
        "outlettype": ["signal", "signal", "", ""],
        "patching_rect": [400.0, 180.0, 140.0, 22.0],
        "text": "adsr~ 1 150 0 80",
    }
}, 400, 180)

# bell_gain = bell_osc × bell_env × velocity_signal × brightness_dial
# Build the chain step by step:
patch.set_position(200, 385)
bell_x_env = patch.place("*~")[0]  # bell_osc × bell_env

patch.set_position(200, 425)
bell_x_vel = patch.place("*~")[0]  # × velocity

patch.set_position(200, 465)
bell_x_bright = patch.place("*~")[0]  # × brightness dial (sig~)

patch.set_position(400, 465)
sig_brightness = patch.place("sig~")[0]  # brightness dial → sig~

patch.connect(
    [freq_sig.outs[0], bell_freq.ins[0]],      # freq → *~ 14.
    [bell_freq.outs[0], bell_osc.ins[0]],      # bell_freq → cycle~
    [vel_scale.outs[0], bell_env.ins[0]],      # gate bell env with velocity
    # bell_osc × bell_env × vel × brightness
    [bell_osc.outs[0], bell_x_env.ins[0]],
    [bell_env.outs[0], bell_x_env.ins[1]],
    [bell_x_env.outs[0], bell_x_vel.ins[0]],
    [vel_sig.outs[0], bell_x_vel.ins[1]],
    [bell_x_vel.outs[0], bell_x_bright.ins[0]],
    [sig_brightness.outs[0], bell_x_bright.ins[1]],
)

# ============================================================
# AMP ENVELOPE (piano-ish ADSR — quick attack, long decay, low sustain)
# ============================================================

patch.set_position(400, 30)
patch.place("comment === AMP ENVELOPE ===")[0]

amp_env = place_raw({
    "box": {
        "maxclass": "newobj", "numinlets": 5, "numoutlets": 4,
        "outlettype": ["signal", "signal", "", ""],
        "patching_rect": [400.0, 65.0, 160.0, 22.0],
        "text": "adsr~ 5 1200 0.3 400",
    }
}, 400, 65)

patch.connect([vel_scale.outs[0], amp_env.ins[0]])  # gate with scaled velocity

# ============================================================
# MIX + VCA (fundamental × amp_env + bell; then × volume)
# ============================================================

patch.set_position(30, 510)
patch.place("comment === MIX + OUTPUT ===")[0]

# fundamental × amp_env
patch.set_position(30, 545)
fund_vca = patch.place("*~")[0]

# Mix fundamental_vca + bell_scaled
patch.set_position(30, 585)
mixer = patch.place("+~")[0]

# Apply master volume
patch.set_position(30, 625)
vol_vca = patch.place("*~")[0]

patch.set_position(200, 625)
sig_volume = patch.place("sig~")[0]

# Safety clip before plugout~
patch.set_position(30, 665)
clip = patch.place("clip~ -1. 1.")[0]

patch.set_position(30, 705)
plugout = patch.place("plugout~")[0]

# Attenuate bell contribution so it doesn't overpower the fundamental
patch.set_position(200, 505)
bell_attenuate = patch.place("*~ 0.3")[0]

patch.connect(
    # fundamental × amp_env
    [fundamental.outs[0], fund_vca.ins[0]],
    [amp_env.outs[0], fund_vca.ins[1]],
    # bell gain → attenuate (to blend with fundamental)
    [bell_x_bright.outs[0], bell_attenuate.ins[0]],
    # mix fundamental_vca + bell_attenuated
    [fund_vca.outs[0], mixer.ins[0]],
    [bell_attenuate.outs[0], mixer.ins[1]],
    # master volume
    [mixer.outs[0], vol_vca.ins[0]],
    [sig_volume.outs[0], vol_vca.ins[1]],
    # clip → plugout~ stereo
    [vol_vca.outs[0], clip.ins[0]],
    [clip.outs[0], plugout.ins[0]],
    [clip.outs[0], plugout.ins[1]],
)

# ============================================================
# LIVE.DIAL CONTROLS (Brightness / Decay / Sustain / Release / Volume)
# ============================================================

DIAL_COLORS = {
    "activedialcolor": [0.95, 0.65, 0.20, 1.0],
    "dialcolor": [0.30, 0.18, 0.05, 1.0],
    "activeneedlecolor": [1.0, 0.9, 0.6, 1.0],
    "needlecolor": [0.75, 0.55, 0.30, 1.0],
    "textcolor": [1.0, 0.9, 0.6, 1.0],
}


def make_dial(name, px, min_v, max_v, init, unitstyle=1, exponent=1.0):
    """Create a live.dial in the presentation UI."""
    return place_raw({
        "box": {
            "maxclass": "live.dial", "varname": name.lower().replace(" ", "_"),
            "text": "live.dial",
            "numinlets": 1, "numoutlets": 2, "outlettype": ["", "float"],
            "patching_rect": [800.0 + (px * 1.0), 130.0, 44.0, 48.0],
            "presentation": 1,
            "presentation_rect": [float(px), 40.0, 50.0, 56.0],
            "parameter_enable": 1, **DIAL_COLORS,
            "saved_attribute_attributes": {
                "valueof": {
                    "parameter_longname": name,
                    "parameter_shortname": name[:6],
                    "parameter_type": 0,
                    "parameter_mmin": min_v,
                    "parameter_mmax": max_v,
                    "parameter_initial_enable": 1,
                    "parameter_initial": [init],
                    "parameter_unitstyle": unitstyle,
                    "parameter_exponent": exponent,
                }
            }
        }
    }, 800 + int(px * 1.0), 130)


dial_brightness = make_dial("Brightness", 15, 0.0, 2.0, 0.8, exponent=1.5)
dial_decay = make_dial("Decay", 85, 200.0, 3000.0, 1200.0, exponent=2.0)
dial_sustain = make_dial("Sustain", 155, 0.0, 0.8, 0.3)
dial_release = make_dial("Release", 225, 50.0, 2000.0, 400.0, exponent=2.0)
dial_volume = make_dial("Volume", 295, 0.0, 1.0, 0.5)

# Connect dials → signals / adsr~ inlets
patch.connect(
    [dial_brightness.outs[0], sig_brightness.ins[0]],  # brightness → bell multiplier
    [dial_decay.outs[0], amp_env.ins[2]],              # D
    [dial_sustain.outs[0], amp_env.ins[3]],            # S
    [dial_release.outs[0], amp_env.ins[4]],            # R
    [dial_volume.outs[0], sig_volume.ins[0]],          # master volume → sig~
)

# ============================================================
# SAVE
# ============================================================

patcher_json = patch.get_json()
patcher_json["patcher"]["openinpresentation"] = 1

with open("device.maxpat", "w") as f:
    json.dump(patcher_json, f, indent=2)
print("Saved: device.maxpat")

from amxd import save_amxd
save_amxd(patcher_json, "device.amxd", device_type="instrument")
print("Saved: device.amxd")

print(f"Total objects: {patch.num_objs}")
