"""
Max for Live Rhodes EP (M4L Instrument) — 4-Voice Polyphonic
==============================================================
A simple electric piano using additive synthesis (fundamental sine +
bell partial at 14x freq) with 4-voice polyphony so you can play chords.

Polyphony architecture:
  notein → poly 4 1 (4 voices, last-note-steal)
    outlet 0 = voice#  (fires LAST due to Max right-to-left firing)
    outlet 1 = pitch   (fires second)
    outlet 2 = velocity (fires first)
  ↓
  pack 0 0 0 — voice# on inlet 0 (trigger), pitch on 1, velocity on 2
    Output: [voice# pitch velocity] list (pack emits after all 3 stored)
  ↓
  route 1 2 3 4 — strips the matched voice# from the list, outputs
    [pitch velocity] on the corresponding outlet (0..3) for that voice
  ↓
  4 parallel voice chains, each:
    unpack pitch velocity
      ├─ pitch → mtof → sig~ → { cycle~ (fundamental), *~14 → cycle~ (bell) }
      └─ velocity → expr $i1 / 127. → { amp_env gate, bell_env gate,
                                         brightness scale }
    → fundamental*amp_env + bell*bell_env*vel*brightness*0.3 = voice_out
  4 voice_outs summed → clip~ → plugout~

All voices share the same live.dial controls (Brightness, Decay, Sustain,
Release, Volume), so tweaking a dial updates every voice in sync.

NOTE: poly's outlet 3 is "overflow", NOT a list of [voice pitch velocity].
We must build the list explicitly with `pack`, and we must connect in
reverse outlet order (velocity first, pitch second, voice# last) so
voice# arrives LAST at pack's inlet 0 (the trigger inlet) after pitch and
velocity have been stored.

Usage:
  1. Drag the .amxd onto a MIDI track in Ableton
  2. Play chords up to 4 notes at a time
  3. Tweak Brightness for more/less bell/tine character
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


NUM_VOICES = 4

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
        "maxclass": "comment", "text": "RHODES EP (4-voice)",
        "numinlets": 1, "numoutlets": 0, "outlettype": [],
        "patching_rect": [800.0, 70.0, 160.0, 20.0],
        "presentation": 1, "presentation_rect": [12.0, 4.0, 200.0, 18.0],
        "fontsize": 12.0, "fontface": 1,
        "textcolor": [1.0, 0.9, 0.6, 1.0],
    }
}, 800, 70)

# ============================================================
# SHARED DIALS (Brightness / Decay / Sustain / Release / Volume)
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

# Shared sig~ instances so we only compute each dial value once and fan out
patch.set_position(600, 30)
sig_brightness = patch.place("sig~")[0]

patch.set_position(600, 70)
sig_volume = patch.place("sig~")[0]

patch.connect(
    [dial_brightness.outs[0], sig_brightness.ins[0]],
    [dial_volume.outs[0], sig_volume.ins[0]],
)

# ============================================================
# MIDI INPUT + VOICE ALLOCATION (poly 4 1 = 4 voices, last-note-steal)
# ============================================================

patch.set_position(30, 30)
patch.place("comment === MIDI INPUT (4-voice polyphonic) ===")[0]

notein_obj = place_raw({
    "box": {
        "maxclass": "newobj", "numinlets": 1, "numoutlets": 3,
        "outlettype": ["int", "int", "int"],
        "patching_rect": [30.0, 65.0, 41.0, 22.0],
        "text": "notein",
    }
}, 30, 65)

# poly 4 1 — 4 voices, steal-mode 1 (steal oldest held note when full)
# Outlets: 0=voice#, 1=pitch, 2=velocity, 3=overflow (fires only on voice pool full)
# Max fires outlets right-to-left: vel (2) first, pitch (1), voice# (0) last.
patch.set_position(30, 105)
poly_alloc = patch.place("poly 4 1")[0]

patch.connect(
    [notein_obj.outs[0], poly_alloc.ins[0]],  # pitch → poly
    [notein_obj.outs[1], poly_alloc.ins[1]],  # velocity → poly
)

# Build a [voice# pitch velocity] list explicitly with pack.
# pack outputs when its leftmost inlet (0) receives a value, after the
# other inlets have been updated. Since poly fires outlets right-to-left
# (vel → pitch → voice#), the order works out:
#   1. vel arrives at pack.ins[2] (stored)
#   2. pitch arrives at pack.ins[1] (stored)
#   3. voice# arrives at pack.ins[0] (TRIGGERS output of [voice# pitch vel])
patch.set_position(30, 145)
packer = patch.place("pack 0 0 0")[0]
patch.connect(
    [poly_alloc.outs[2], packer.ins[2]],  # velocity → stored
    [poly_alloc.outs[1], packer.ins[1]],  # pitch → stored
    [poly_alloc.outs[0], packer.ins[0]],  # voice# → triggers output
)

# Route by voice# — route strips the matched first element, so each
# outlet (0..3) receives [pitch velocity] for the corresponding voice.
patch.set_position(30, 185)
router = patch.place("route 1 2 3 4")[0]
patch.connect([packer.outs[0], router.ins[0]])

# ============================================================
# VOICE CHAIN BUILDER (builds one full voice and returns its audio output)
# ============================================================


def build_voice(voice_index, x_base):
    """Build one voice chain and return the audio output (*~ mix)."""
    x = x_base
    y = 200

    # Unpack [pitch velocity] from the router outlet for this voice
    unpacker = patch.place("unpack 0 0", num_objs=1, starting_pos=[x, y])[0]
    patch.connect([router.outs[voice_index], unpacker.ins[0]])

    # Velocity scaling: expr $i1 / 127. → scaled 0-1 float
    vel_scale = place_raw({
        "box": {
            "maxclass": "newobj", "numinlets": 1, "numoutlets": 1,
            "outlettype": ["float"],
            "patching_rect": [float(x + 40), float(y + 40), 80.0, 22.0],
            "text": "expr $i1 / 127.",
        }
    }, x + 40, y + 40)

    # Scaled velocity → sig~ for use as a signal multiplier (bell brightness)
    patch.set_position(x + 40, y + 80)
    vel_sig = patch.place("sig~")[0]

    # Pitch → mtof → sig~ → freq_signal
    patch.set_position(x, y + 40)
    mtof_obj = patch.place("mtof")[0]

    patch.set_position(x, y + 80)
    freq_sig = patch.place("sig~")[0]

    # Fundamental oscillator
    patch.set_position(x, y + 120)
    fundamental = patch.place("cycle~")[0]

    # Bell partial: freq × 14 → cycle~
    patch.set_position(x, y + 160)
    bell_freq_mul = patch.place("*~ 14.")[0]

    patch.set_position(x, y + 200)
    bell_osc = patch.place("cycle~")[0]

    # Amp envelope (piano-like: quick attack, long decay, low sustain)
    amp_env = place_raw({
        "box": {
            "maxclass": "newobj", "numinlets": 5, "numoutlets": 4,
            "outlettype": ["signal", "signal", "", ""],
            "patching_rect": [float(x + 80), float(y + 120), 160.0, 22.0],
            "text": "adsr~ 5 1200 0.3 400",
        }
    }, x + 80, y + 120)

    # Bell envelope (instant attack, fast decay to 0 — the "tine clonk")
    bell_env = place_raw({
        "box": {
            "maxclass": "newobj", "numinlets": 5, "numoutlets": 4,
            "outlettype": ["signal", "signal", "", ""],
            "patching_rect": [float(x + 80), float(y + 160), 140.0, 22.0],
            "text": "adsr~ 1 150 0 80",
        }
    }, x + 80, y + 160)

    # VCAs
    patch.set_position(x, y + 240)
    fund_vca = patch.place("*~")[0]

    patch.set_position(x + 80, y + 240)
    bell_x_env = patch.place("*~")[0]  # bell × bell_env

    patch.set_position(x + 80, y + 280)
    bell_x_vel = patch.place("*~")[0]  # × velocity

    patch.set_position(x + 80, y + 320)
    bell_x_bright = patch.place("*~")[0]  # × brightness

    patch.set_position(x + 80, y + 360)
    bell_attenuate = patch.place("*~ 0.3")[0]  # scale down before mixing

    # Mix fundamental_vca + bell_attenuated
    patch.set_position(x, y + 400)
    voice_mix = patch.place("+~")[0]

    patch.connect(
        # Unpack → pitch (outlet 0), velocity (outlet 1)
        [unpacker.outs[0], mtof_obj.ins[0]],        # pitch → mtof
        [mtof_obj.outs[0], freq_sig.ins[0]],        # freq → sig~
        [freq_sig.outs[0], fundamental.ins[0]],     # → fundamental cycle~
        [freq_sig.outs[0], bell_freq_mul.ins[0]],   # → × 14 → bell freq
        [bell_freq_mul.outs[0], bell_osc.ins[0]],   # → bell cycle~
        # Velocity → scaling + gates
        [unpacker.outs[1], vel_scale.ins[0]],       # velocity → scale
        [vel_scale.outs[0], vel_sig.ins[0]],        # scaled → sig~
        [vel_scale.outs[0], amp_env.ins[0]],        # gate amp env
        [vel_scale.outs[0], bell_env.ins[0]],       # gate bell env
        # Fundamental VCA
        [fundamental.outs[0], fund_vca.ins[0]],
        [amp_env.outs[0], fund_vca.ins[1]],
        # Bell chain: osc × env × vel × brightness × 0.3
        [bell_osc.outs[0], bell_x_env.ins[0]],
        [bell_env.outs[0], bell_x_env.ins[1]],
        [bell_x_env.outs[0], bell_x_vel.ins[0]],
        [vel_sig.outs[0], bell_x_vel.ins[1]],
        [bell_x_vel.outs[0], bell_x_bright.ins[0]],
        [sig_brightness.outs[0], bell_x_bright.ins[1]],
        [bell_x_bright.outs[0], bell_attenuate.ins[0]],
        # Mix fundamental + bell
        [fund_vca.outs[0], voice_mix.ins[0]],
        [bell_attenuate.outs[0], voice_mix.ins[1]],
    )

    # Connect the shared dials to this voice's envelope inlets
    patch.connect(
        [dial_decay.outs[0], amp_env.ins[2]],
        [dial_sustain.outs[0], amp_env.ins[3]],
        [dial_release.outs[0], amp_env.ins[4]],
    )

    return voice_mix


# Build all 4 voices, spaced horizontally
voice_outputs = [build_voice(i, 30 + i * 260) for i in range(NUM_VOICES)]

# ============================================================
# VOICE SUMMING (4 voices → master → volume → clip~ → plugout~)
# ============================================================

patch.set_position(30, 700)
patch.place("comment === SUM VOICES ===")[0]

# Sum in pairs: (v0 + v1) + (v2 + v3)
patch.set_position(30, 735)
sum_01 = patch.place("+~")[0]

patch.set_position(200, 735)
sum_23 = patch.place("+~")[0]

patch.set_position(30, 775)
master_sum = patch.place("+~")[0]

# Master volume VCA
patch.set_position(30, 815)
vol_vca = patch.place("*~")[0]

# Safety clip before plugout~
patch.set_position(30, 855)
clip = patch.place("clip~ -1. 1.")[0]

patch.set_position(30, 895)
plugout = patch.place("plugout~")[0]

patch.connect(
    # Sum voices
    [voice_outputs[0].outs[0], sum_01.ins[0]],
    [voice_outputs[1].outs[0], sum_01.ins[1]],
    [voice_outputs[2].outs[0], sum_23.ins[0]],
    [voice_outputs[3].outs[0], sum_23.ins[1]],
    [sum_01.outs[0], master_sum.ins[0]],
    [sum_23.outs[0], master_sum.ins[1]],
    # Master volume
    [master_sum.outs[0], vol_vca.ins[0]],
    [sig_volume.outs[0], vol_vca.ins[1]],
    # Clip → plugout~ stereo
    [vol_vca.outs[0], clip.ins[0]],
    [clip.outs[0], plugout.ins[0]],
    [clip.outs[0], plugout.ins[1]],
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
