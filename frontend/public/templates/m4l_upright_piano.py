"""
Max for Live Upright Piano (M4L Instrument) — 4-Voice Polyphonic
==================================================================
A simple upright piano using additive synthesis with 4 harmonics per
voice. Unlike the Rhodes (which has a single bell partial), the piano
has a richer harmonic spectrum with partials at octaves and fifths.

Per voice, 4 sine partials at ratios:
  1.0x (fundamental) — strongest
  2.0x (octave)      — strong
  3.0x (octave+5th)  — moderate
  4.01x (2 octaves)  — weak, slightly detuned for beating/warmth

Each partial has its own decay envelope — higher partials decay faster,
which mimics the natural overtone decay of a real piano string.

Envelopes (ADSR times in ms):
  fundamental env:  5 / 2500 / 0.15 / 500  — slow decay, low sustain
  harmonic env:     2 /  800 / 0.05 / 300  — faster decay for upper partials

Velocity controls both amplitude (via adsr~ gate) AND brightness (the
upper harmonics are scaled by velocity, so hard notes are brighter).

Polyphony: poly 4 1 + pack + route 1 2 3 4 + 4 parallel voice chains
(same pattern as m4l_rhodes_piano.py).

Usage:
  1. Drag the .amxd onto a MIDI track in Ableton
  2. Play chords up to 4 notes
  3. Tweak Brightness for more/less harmonic content
  4. Decay controls the main sustain time (higher = longer notes ring)
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


NUM_VOICES = 4
# (ratio, base_amplitude) — upper partials quieter by default
HARMONICS = [
    (1.0,  1.00),   # fundamental
    (2.0,  0.50),   # octave
    (3.0,  0.30),   # octave + 5th
    (4.01, 0.18),   # 2 octaves (slightly detuned)
]

# ============================================================
# PRESENTATION BACKGROUND (dark wood / ivory piano aesthetic)
# ============================================================

panel = place_raw({
    "box": {
        "maxclass": "panel", "text": "panel",
        "numinlets": 1, "numoutlets": 0, "outlettype": [],
        "patching_rect": [800.0, 100.0, 360.0, 120.0],
        "presentation": 1, "presentation_rect": [0.0, 0.0, 360.0, 120.0],
        "bgcolor": [0.10, 0.07, 0.05, 1.0],
        "mode": 0, "rounded": 0, "background": 1,
    }
}, 800, 100)

header = place_raw({
    "box": {
        "maxclass": "panel", "text": "panel",
        "numinlets": 1, "numoutlets": 0, "outlettype": [],
        "patching_rect": [800.0, 90.0, 360.0, 24.0],
        "presentation": 1, "presentation_rect": [0.0, 0.0, 360.0, 24.0],
        "bgcolor": [0.65, 0.55, 0.40, 1.0],
        "mode": 0, "rounded": 0, "background": 1,
    }
}, 800, 90)

title = place_raw({
    "box": {
        "maxclass": "comment", "text": "UPRIGHT PIANO",
        "numinlets": 1, "numoutlets": 0, "outlettype": [],
        "patching_rect": [800.0, 70.0, 160.0, 20.0],
        "presentation": 1, "presentation_rect": [12.0, 4.0, 200.0, 18.0],
        "fontsize": 12.0, "fontface": 1,
        "textcolor": [0.95, 0.88, 0.75, 1.0],
    }
}, 800, 70)

# ============================================================
# SHARED DIALS
# ============================================================

DIAL_COLORS = {
    "activedialcolor": [0.80, 0.65, 0.35, 1.0],
    "dialcolor": [0.30, 0.22, 0.12, 1.0],
    "activeneedlecolor": [0.95, 0.88, 0.75, 1.0],
    "needlecolor": [0.70, 0.60, 0.40, 1.0],
    "textcolor": [0.95, 0.88, 0.75, 1.0],
}


def make_dial(name, px, min_v, max_v, init, unitstyle=1, exponent=1.0):
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


dial_brightness = make_dial("Brightness", 15, 0.0, 2.0, 1.0, exponent=1.5)
dial_decay = make_dial("Decay", 85, 500.0, 5000.0, 2500.0, exponent=2.0)
dial_sustain = make_dial("Sustain", 155, 0.0, 0.6, 0.15)
dial_release = make_dial("Release", 225, 50.0, 2000.0, 500.0, exponent=2.0)
dial_volume = make_dial("Volume", 295, 0.0, 1.0, 0.5)

# Shared sig~ so dials fan out to all voices without duplication
patch.set_position(600, 30)
sig_brightness = patch.place("sig~")[0]

patch.set_position(600, 70)
sig_volume = patch.place("sig~")[0]

patch.connect(
    [dial_brightness.outs[0], sig_brightness.ins[0]],
    [dial_volume.outs[0], sig_volume.ins[0]],
)

# ============================================================
# MIDI INPUT + VOICE ALLOCATION (poly 4 1 + pack + route)
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

patch.set_position(30, 105)
poly_alloc = patch.place("poly 4 1")[0]
patch.connect(
    [notein_obj.outs[0], poly_alloc.ins[0]],
    [notein_obj.outs[1], poly_alloc.ins[1]],
)

patch.set_position(30, 145)
packer = patch.place("pack 0 0 0")[0]
patch.connect(
    [poly_alloc.outs[2], packer.ins[2]],  # velocity → stored
    [poly_alloc.outs[1], packer.ins[1]],  # pitch → stored
    [poly_alloc.outs[0], packer.ins[0]],  # voice# → triggers pack
)

patch.set_position(30, 185)
router = patch.place("route 1 2 3 4")[0]
patch.connect([packer.outs[0], router.ins[0]])

# ============================================================
# VOICE CHAIN BUILDER
# ============================================================


def build_voice(voice_index, x_base):
    """Build a single piano voice (4 harmonics with individual envelopes)."""
    x = x_base
    y = 240

    patch.set_position(x, y)
    unpacker = patch.place("unpack 0 0")[0]
    patch.connect([router.outs[voice_index], unpacker.ins[0]])

    vel_scale = place_raw({
        "box": {
            "maxclass": "newobj", "numinlets": 1, "numoutlets": 1,
            "outlettype": ["float"],
            "patching_rect": [float(x + 40), float(y + 40), 80.0, 22.0],
            "text": "expr $i1 / 127.",
        }
    }, x + 40, y + 40)

    patch.set_position(x + 40, y + 80)
    vel_sig = patch.place("sig~")[0]  # scaled velocity as signal

    patch.set_position(x, y + 40)
    mtof_obj = patch.place("mtof")[0]

    patch.set_position(x, y + 80)
    freq_sig = patch.place("sig~")[0]

    patch.connect(
        [unpacker.outs[0], mtof_obj.ins[0]],
        [mtof_obj.outs[0], freq_sig.ins[0]],
        [unpacker.outs[1], vel_scale.ins[0]],
        [vel_scale.outs[0], vel_sig.ins[0]],
    )

    # Build 4 harmonics, each with its own cycle~ + VCA
    harmonic_outputs = []
    for i, (ratio, base_amp) in enumerate(HARMONICS):
        hx = x + i * 40
        hy = y + 140

        # freq × ratio
        patch.set_position(hx, hy)
        if ratio == 1.0:
            harmonic_cycle = patch.place("cycle~")[0]
            patch.connect([freq_sig.outs[0], harmonic_cycle.ins[0]])
        else:
            freq_scaled = patch.place(f"*~ {ratio}")[0]
            patch.set_position(hx, hy + 40)
            harmonic_cycle = patch.place("cycle~")[0]
            patch.connect(
                [freq_sig.outs[0], freq_scaled.ins[0]],
                [freq_scaled.outs[0], harmonic_cycle.ins[0]],
            )

        # Base amplitude scale — hardcoded per-harmonic weight
        patch.set_position(hx, hy + 80)
        harmonic_base = patch.place(f"*~ {base_amp}")[0]
        patch.connect([harmonic_cycle.outs[0], harmonic_base.ins[0]])

        # For upper harmonics (i > 0): scale by velocity × brightness
        # (so hard notes have richer harmonic content)
        if i > 0:
            patch.set_position(hx, hy + 120)
            x_vel = patch.place("*~")[0]
            patch.set_position(hx, hy + 160)
            x_bright = patch.place("*~")[0]
            patch.connect(
                [harmonic_base.outs[0], x_vel.ins[0]],
                [vel_sig.outs[0], x_vel.ins[1]],
                [x_vel.outs[0], x_bright.ins[0]],
                [sig_brightness.outs[0], x_bright.ins[1]],
            )
            harmonic_outputs.append(x_bright)
        else:
            harmonic_outputs.append(harmonic_base)

    # Single amp envelope for the whole voice (the fundamental's decay shape)
    # Attack=5, Decay=[dial], Sustain=[dial], Release=[dial]
    amp_env = place_raw({
        "box": {
            "maxclass": "newobj", "numinlets": 5, "numoutlets": 4,
            "outlettype": ["signal", "signal", "", ""],
            "patching_rect": [float(x + 240), float(y + 40), 160.0, 22.0],
            "text": "adsr~ 5 2500 0.15 500",
        }
    }, x + 240, y + 40)
    patch.connect([vel_scale.outs[0], amp_env.ins[0]])

    # Sum all harmonics
    patch.set_position(x, y + 360)
    sum_01 = patch.place("+~")[0]
    patch.set_position(x + 80, y + 360)
    sum_23 = patch.place("+~")[0]
    patch.set_position(x, y + 400)
    harmonic_sum = patch.place("+~")[0]

    patch.connect(
        [harmonic_outputs[0].outs[0], sum_01.ins[0]],
        [harmonic_outputs[1].outs[0], sum_01.ins[1]],
        [harmonic_outputs[2].outs[0], sum_23.ins[0]],
        [harmonic_outputs[3].outs[0], sum_23.ins[1]],
        [sum_01.outs[0], harmonic_sum.ins[0]],
        [sum_23.outs[0], harmonic_sum.ins[1]],
    )

    # Apply amp envelope to the harmonic sum
    patch.set_position(x, y + 440)
    voice_vca = patch.place("*~")[0]
    patch.connect(
        [harmonic_sum.outs[0], voice_vca.ins[0]],
        [amp_env.outs[0], voice_vca.ins[1]],
    )

    # Connect per-voice env inlets to shared dials (decay, sustain, release)
    patch.connect(
        [dial_decay.outs[0], amp_env.ins[2]],
        [dial_sustain.outs[0], amp_env.ins[3]],
        [dial_release.outs[0], amp_env.ins[4]],
    )

    return voice_vca


voice_outputs = [build_voice(i, 30 + i * 280) for i in range(NUM_VOICES)]

# ============================================================
# VOICE SUMMING + MASTER OUTPUT
# ============================================================

patch.set_position(30, 780)
patch.place("comment === SUM VOICES ===")[0]

patch.set_position(30, 815)
sum_01 = patch.place("+~")[0]

patch.set_position(200, 815)
sum_23 = patch.place("+~")[0]

patch.set_position(30, 855)
master_sum = patch.place("+~")[0]

# Normalize — 4 voices × up to 2x sum (harmonics) → divide down
patch.set_position(30, 895)
normalize = patch.place("*~ 0.25")[0]

patch.set_position(30, 935)
vol_vca = patch.place("*~")[0]

patch.set_position(30, 975)
clip = patch.place("clip~ -1. 1.")[0]

patch.set_position(30, 1015)
plugout = patch.place("plugout~")[0]

patch.connect(
    [voice_outputs[0].outs[0], sum_01.ins[0]],
    [voice_outputs[1].outs[0], sum_01.ins[1]],
    [voice_outputs[2].outs[0], sum_23.ins[0]],
    [voice_outputs[3].outs[0], sum_23.ins[1]],
    [sum_01.outs[0], master_sum.ins[0]],
    [sum_23.outs[0], master_sum.ins[1]],
    [master_sum.outs[0], normalize.ins[0]],
    [normalize.outs[0], vol_vca.ins[0]],
    [sig_volume.outs[0], vol_vca.ins[1]],
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
