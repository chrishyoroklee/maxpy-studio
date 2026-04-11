"""
Max for Live Organ (M4L Instrument) — 4-Voice Hammond-style Drawbar Organ
===========================================================================
A simple additive organ with 4 drawbar levels. Each voice sums 4 sine
waves at octave-related ratios (16', 8', 4', 2'), gated by a near-
instantaneous envelope (classic organ on/off feel — no attack ramp,
no decay, full sustain, fast release).

Drawbar layout (Hammond notation):
  16' = octave below played pitch   (ratio 0.5x)
   8' = played pitch (fundamental)  (ratio 1.0x)
   4' = octave above                (ratio 2.0x)
   2' = two octaves above           (ratio 4.0x)

Signal flow (per voice):
  pitch → mtof → sig~ → freq
    ├─ *~ 0.5 → cycle~ → *~ drawbar16 ─┐
    ├─         cycle~ → *~ drawbar8  ─┤
    ├─ *~ 2.0 → cycle~ → *~ drawbar4  ─┼─ +~ sum → *~ amp_env → voice_out
    └─ *~ 4.0 → cycle~ → *~ drawbar2  ─┘

Polyphony: poly 4 1 + pack + route 1 2 3 4 + 4 parallel voice chains
(same pattern as m4l_rhodes_piano.py).

Envelope: adsr~ 1 10 1 80 — 1ms attack, 10ms decay to sustain=1, 80ms release.
This is effectively an on/off gate with a tiny click-prevention ramp.

Usage:
  1. Drag the .amxd onto a MIDI track in Ableton
  2. Play chords up to 4 notes
  3. Tweak the 16'/8'/4'/2' drawbars to change the harmonic blend
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
# Drawbar frequency ratios and UI labels
DRAWBARS = [
    ("16 ft", 0.5),
    ("8 ft",  1.0),
    ("4 ft",  2.0),
    ("2 ft",  4.0),
]

# ============================================================
# PRESENTATION BACKGROUND
# ============================================================

panel = place_raw({
    "box": {
        "maxclass": "panel", "text": "panel",
        "numinlets": 1, "numoutlets": 0, "outlettype": [],
        "patching_rect": [800.0, 100.0, 420.0, 120.0],
        "presentation": 1, "presentation_rect": [0.0, 0.0, 420.0, 120.0],
        "bgcolor": [0.15, 0.08, 0.05, 1.0],
        "mode": 0, "rounded": 0, "background": 1,
    }
}, 800, 100)

header = place_raw({
    "box": {
        "maxclass": "panel", "text": "panel",
        "numinlets": 1, "numoutlets": 0, "outlettype": [],
        "patching_rect": [800.0, 90.0, 420.0, 24.0],
        "presentation": 1, "presentation_rect": [0.0, 0.0, 420.0, 24.0],
        "bgcolor": [0.50, 0.15, 0.08, 1.0],
        "mode": 0, "rounded": 0, "background": 1,
    }
}, 800, 90)

title = place_raw({
    "box": {
        "maxclass": "comment", "text": "ORGAN (4-voice drawbar)",
        "numinlets": 1, "numoutlets": 0, "outlettype": [],
        "patching_rect": [800.0, 70.0, 200.0, 20.0],
        "presentation": 1, "presentation_rect": [12.0, 4.0, 240.0, 18.0],
        "fontsize": 12.0, "fontface": 1,
        "textcolor": [1.0, 0.9, 0.7, 1.0],
    }
}, 800, 70)

# ============================================================
# SHARED DIALS — 4 drawbars + volume
# ============================================================

DIAL_COLORS = {
    "activedialcolor": [0.95, 0.55, 0.20, 1.0],
    "dialcolor": [0.35, 0.15, 0.08, 1.0],
    "activeneedlecolor": [1.0, 0.9, 0.7, 1.0],
    "needlecolor": [0.80, 0.50, 0.30, 1.0],
    "textcolor": [1.0, 0.9, 0.7, 1.0],
}


def make_dial(name, px, min_v, max_v, init, unitstyle=1, exponent=1.0):
    return place_raw({
        "box": {
            "maxclass": "live.dial", "varname": name.lower().replace(" ", "_").replace("'", ""),
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


# 4 drawbar level dials + 1 volume
# Classic Hammond default: 16'=0.8, 8'=0.8, 4'=0.6, 2'=0.3
dial_16 = make_dial("16 ft",  15, 0.0, 1.0, 0.8)
dial_8  = make_dial("8 ft",   85, 0.0, 1.0, 0.8)
dial_4  = make_dial("4 ft",  155, 0.0, 1.0, 0.6)
dial_2  = make_dial("2 ft",  225, 0.0, 1.0, 0.3)
dial_volume = make_dial("Volume", 335, 0.0, 1.0, 0.5)

drawbar_dials = [dial_16, dial_8, dial_4, dial_2]

# Shared sig~ for each drawbar level (one per drawbar, fans out to all voices)
drawbar_sigs = []
for i in range(4):
    patch.set_position(600, 30 + i * 40)
    sig = patch.place("sig~")[0]
    patch.connect([drawbar_dials[i].outs[0], sig.ins[0]])
    drawbar_sigs.append(sig)

# Shared sig~ for master volume
patch.set_position(600, 230)
sig_volume = patch.place("sig~")[0]
patch.connect([dial_volume.outs[0], sig_volume.ins[0]])

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

# Build [voice# pitch vel] list via pack (voice# triggers, vel/pitch stored first)
patch.set_position(30, 145)
packer = patch.place("pack 0 0 0")[0]
patch.connect(
    [poly_alloc.outs[2], packer.ins[2]],  # velocity fires first → stored
    [poly_alloc.outs[1], packer.ins[1]],  # pitch fires second → stored
    [poly_alloc.outs[0], packer.ins[0]],  # voice# fires last → triggers output
)

patch.set_position(30, 185)
router = patch.place("route 1 2 3 4")[0]
patch.connect([packer.outs[0], router.ins[0]])

# ============================================================
# VOICE CHAIN BUILDER
# ============================================================


def build_voice(voice_index, x_base):
    """Build a single organ voice (4 drawbars summed + amp envelope)."""
    x = x_base
    y = 240

    # Unpack [pitch velocity]
    patch.set_position(x, y)
    unpacker = patch.place("unpack 0 0")[0]
    patch.connect([router.outs[voice_index], unpacker.ins[0]])

    # Velocity scaling for adsr~ gate
    vel_scale = place_raw({
        "box": {
            "maxclass": "newobj", "numinlets": 1, "numoutlets": 1,
            "outlettype": ["float"],
            "patching_rect": [float(x + 40), float(y + 40), 80.0, 22.0],
            "text": "expr $i1 / 127.",
        }
    }, x + 40, y + 40)

    # pitch → mtof → sig~ → freq
    patch.set_position(x, y + 40)
    mtof_obj = patch.place("mtof")[0]

    patch.set_position(x, y + 80)
    freq_sig = patch.place("sig~")[0]

    # Organ amp envelope: near-instant gate with click protection
    amp_env = place_raw({
        "box": {
            "maxclass": "newobj", "numinlets": 5, "numoutlets": 4,
            "outlettype": ["signal", "signal", "", ""],
            "patching_rect": [float(x + 120), float(y + 40), 120.0, 22.0],
            "text": "adsr~ 1 10 1 80",
        }
    }, x + 120, y + 40)

    patch.connect(
        [unpacker.outs[0], mtof_obj.ins[0]],    # pitch → mtof
        [mtof_obj.outs[0], freq_sig.ins[0]],    # freq → sig~
        [unpacker.outs[1], vel_scale.ins[0]],   # velocity → scale
        [vel_scale.outs[0], amp_env.ins[0]],    # scaled velocity → gate
    )

    # Build 4 drawbars, sum them
    drawbar_outputs = []
    for i, (label, ratio) in enumerate(DRAWBARS):
        dx = x + i * 40
        dy = y + 140

        # freq × ratio → cycle~
        patch.set_position(dx, dy)
        if ratio == 1.0:
            # no multiplication needed
            drawbar_cycle = patch.place("cycle~")[0]
            patch.connect([freq_sig.outs[0], drawbar_cycle.ins[0]])
        else:
            freq_scaled = patch.place(f"*~ {ratio}")[0]
            patch.set_position(dx, dy + 40)
            drawbar_cycle = patch.place("cycle~")[0]
            patch.connect(
                [freq_sig.outs[0], freq_scaled.ins[0]],
                [freq_scaled.outs[0], drawbar_cycle.ins[0]],
            )

        # cycle~ × drawbar_level (shared sig~)
        patch.set_position(dx, dy + 80)
        drawbar_vca = patch.place("*~")[0]
        patch.connect(
            [drawbar_cycle.outs[0], drawbar_vca.ins[0]],
            [drawbar_sigs[i].outs[0], drawbar_vca.ins[1]],
        )
        drawbar_outputs.append(drawbar_vca)

    # Sum all 4 drawbars: (d0 + d1) + (d2 + d3)
    patch.set_position(x, y + 260)
    sum_01 = patch.place("+~")[0]
    patch.set_position(x + 80, y + 260)
    sum_23 = patch.place("+~")[0]
    patch.set_position(x, y + 300)
    drawbar_sum = patch.place("+~")[0]

    patch.connect(
        [drawbar_outputs[0].outs[0], sum_01.ins[0]],
        [drawbar_outputs[1].outs[0], sum_01.ins[1]],
        [drawbar_outputs[2].outs[0], sum_23.ins[0]],
        [drawbar_outputs[3].outs[0], sum_23.ins[1]],
        [sum_01.outs[0], drawbar_sum.ins[0]],
        [sum_23.outs[0], drawbar_sum.ins[1]],
    )

    # Apply amp envelope
    patch.set_position(x, y + 340)
    voice_vca = patch.place("*~")[0]
    patch.connect(
        [drawbar_sum.outs[0], voice_vca.ins[0]],
        [amp_env.outs[0], voice_vca.ins[1]],
    )

    return voice_vca


# Build 4 voices
voice_outputs = [build_voice(i, 30 + i * 260) for i in range(NUM_VOICES)]

# ============================================================
# VOICE SUMMING + MASTER OUTPUT
# ============================================================

patch.set_position(30, 720)
patch.place("comment === SUM VOICES ===")[0]

patch.set_position(30, 755)
sum_01 = patch.place("+~")[0]

patch.set_position(200, 755)
sum_23 = patch.place("+~")[0]

patch.set_position(30, 795)
master_sum = patch.place("+~")[0]

# Normalize — 4 voices × 4 drawbars = up to 16 sines summed. Scale down before clip.
patch.set_position(30, 835)
normalize = patch.place("*~ 0.15")[0]

patch.set_position(30, 875)
vol_vca = patch.place("*~")[0]

patch.set_position(30, 915)
clip = patch.place("clip~ -1. 1.")[0]

patch.set_position(30, 955)
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
