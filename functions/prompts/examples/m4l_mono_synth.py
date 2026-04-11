"""
Max for Live Mono Synth (M4L Instrument)
==========================================
A monophonic sine synth with proper ADSR envelope and last-note-priority
voice management.

Signal flow:
  notein → poly 1 1 (voice allocator, last-note priority)
    ├─ pitch → mtof → sig~ → cycle~ (sine oscillator)
    └─ velocity → expr $i1 / 127. → adsr~ gate
                                       │
  cycle~ *~ adsr~ output (VCA) → clip~ → plugout~

Key improvements over the old template:
  • Uses adsr~ for real attack/decay/sustain/release (was: AR with line~)
  • Uses poly 1 1 so releasing an older note doesn't cut off a newer one
  • Velocity sensitivity: hard notes are louder, soft notes are quieter
  • live.dial controls for Attack, Decay, Sustain, Release, Volume

Usage in Ableton Live:
  1. Drag the .amxd onto a MIDI track
  2. Play notes — monophonic, last-note priority
  3. Tweak ADSR dials to shape the envelope
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
# PRESENTATION BACKGROUND
# ============================================================

# Dark blue gradient panel — "Mono Synth" aesthetic
panel = place_raw({
    "box": {
        "maxclass": "panel", "text": "panel",
        "numinlets": 1, "numoutlets": 0, "outlettype": [],
        "patching_rect": [800.0, 100.0, 360.0, 120.0],
        "presentation": 1, "presentation_rect": [0.0, 0.0, 360.0, 120.0],
        "bgcolor": [0.08, 0.10, 0.18, 1.0],
        "mode": 0, "rounded": 0, "background": 1,
    }
}, 800, 100)

# Accent header strip
header = place_raw({
    "box": {
        "maxclass": "panel", "text": "panel",
        "numinlets": 1, "numoutlets": 0, "outlettype": [],
        "patching_rect": [800.0, 90.0, 360.0, 24.0],
        "presentation": 1, "presentation_rect": [0.0, 0.0, 360.0, 24.0],
        "bgcolor": [0.15, 0.35, 0.65, 1.0],
        "mode": 0, "rounded": 0, "background": 1,
    }
}, 800, 90)

title = place_raw({
    "box": {
        "maxclass": "comment", "text": "MONO SYNTH",
        "numinlets": 1, "numoutlets": 0, "outlettype": [],
        "patching_rect": [800.0, 70.0, 120.0, 20.0],
        "presentation": 1, "presentation_rect": [12.0, 4.0, 140.0, 18.0],
        "fontsize": 12.0, "fontface": 1,
        "textcolor": [0.85, 0.92, 1.0, 1.0],
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
# PITCH PATH (poly → mtof → sig~ → cycle~)
# ============================================================

patch.set_position(30, 145)
patch.place("comment === PITCH ===")[0]

patch.set_position(30, 180)
mtof_obj = patch.place("mtof")[0]

patch.set_position(30, 220)
freq_sig = patch.place("sig~")[0]

patch.set_position(30, 260)
osc = patch.place("cycle~")[0]

patch.connect(
    [voice.outs[1], mtof_obj.ins[0]],     # pitch → mtof
    [mtof_obj.outs[0], freq_sig.ins[0]],  # freq → sig~
    [freq_sig.outs[0], osc.ins[0]],       # sig~ → cycle~ frequency
)

# ============================================================
# ADSR ENVELOPE (velocity-sensitive)
# ============================================================

patch.set_position(250, 145)
patch.place("comment === ADSR ENVELOPE ===")[0]

# Scale velocity (0-127 int) to 0-1 float for adsr~ gate peak level
vel_scale = place_raw({
    "box": {
        "maxclass": "newobj", "numinlets": 1, "numoutlets": 1,
        "outlettype": ["float"],
        "patching_rect": [250.0, 180.0, 80.0, 22.0],
        "text": "expr $i1 / 127.",
    }
}, 250, 180)

# adsr~ A D S R
# inlets: 0=gate signal, 1=attack ms, 2=decay ms, 3=sustain level, 4=release ms
# outlets: 0=signal envelope, 1=signal envelope, 2=note-sounding, 3=done trigger
adsr_env = place_raw({
    "box": {
        "maxclass": "newobj", "numinlets": 5, "numoutlets": 4,
        "outlettype": ["signal", "signal", "", ""],
        "patching_rect": [250.0, 260.0, 140.0, 22.0],
        "text": "adsr~ 10 120 0.7 300",
    }
}, 250, 260)

patch.connect(
    [voice.outs[2], vel_scale.ins[0]],    # velocity → scale
    [vel_scale.outs[0], adsr_env.ins[0]], # normalized velocity → adsr gate
)

# ============================================================
# VCA + OUTPUT
# ============================================================

patch.set_position(30, 320)
patch.place("comment === OUTPUT ===")[0]

# Envelope VCA: cycle~ * adsr_env
patch.set_position(30, 355)
vca = patch.place("*~")[0]

# Master volume (sig~ driven by live.dial)
patch.set_position(30, 395)
vol_vca = patch.place("*~")[0]

patch.set_position(200, 395)
sig_vol = patch.place("sig~")[0]

# Safety clip before plugout~
patch.set_position(30, 435)
clip = patch.place("clip~ -1. 1.")[0]

patch.set_position(30, 475)
plugout = patch.place("plugout~")[0]

patch.connect(
    [osc.outs[0], vca.ins[0]],           # oscillator → VCA
    [adsr_env.outs[0], vca.ins[1]],      # envelope → VCA
    [vca.outs[0], vol_vca.ins[0]],       # envelope'd audio → master volume
    [sig_vol.outs[0], vol_vca.ins[1]],
    [vol_vca.outs[0], clip.ins[0]],
    [clip.outs[0], plugout.ins[0]],
    [clip.outs[0], plugout.ins[1]],
)

# ============================================================
# LIVE.DIAL CONTROLS (A / D / S / R / Volume)
# ============================================================

DIAL_COLORS = {
    "activedialcolor": [0.35, 0.65, 1.0, 1.0],
    "dialcolor": [0.15, 0.22, 0.35, 1.0],
    "activeneedlecolor": [0.85, 0.92, 1.0, 1.0],
    "needlecolor": [0.55, 0.65, 0.85, 1.0],
    "textcolor": [0.85, 0.92, 1.0, 1.0],
}


def make_dial(name, px, min_v, max_v, init, unitstyle=1, exponent=1.0):
    """Create a live.dial in the presentation UI."""
    return place_raw({
        "box": {
            "maxclass": "live.dial", "varname": name.lower(),
            "text": "live.dial",
            "numinlets": 1, "numoutlets": 2, "outlettype": ["", "float"],
            "patching_rect": [800.0 + (px * 1.0), 130.0, 44.0, 48.0],
            "presentation": 1,
            "presentation_rect": [float(px), 40.0, 50.0, 56.0],
            "parameter_enable": 1, **DIAL_COLORS,
            "saved_attribute_attributes": {
                "valueof": {
                    "parameter_longname": name,
                    "parameter_shortname": name[:4],
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


# Attack, Decay, Sustain, Release, Volume
dial_attack = make_dial("Attack", 15, 1.0, 2000.0, 10.0, exponent=2.0)
dial_decay = make_dial("Decay", 85, 1.0, 2000.0, 120.0, exponent=2.0)
dial_sustain = make_dial("Sustain", 155, 0.0, 1.0, 0.7)
dial_release = make_dial("Release", 225, 1.0, 4000.0, 300.0, exponent=2.0)
dial_volume = make_dial("Volume", 295, 0.0, 1.0, 0.5)

# Connect dials → adsr~ and volume
patch.connect(
    [dial_attack.outs[0], adsr_env.ins[1]],   # A
    [dial_decay.outs[0], adsr_env.ins[2]],    # D
    [dial_sustain.outs[0], adsr_env.ins[3]],  # S
    [dial_release.outs[0], adsr_env.ins[4]],  # R
    [dial_volume.outs[0], sig_vol.ins[0]],    # master volume → sig~
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
