"""
Max for Live Bass Synth (M4L Instrument) — Moog-inspired
=========================================================
A monophonic subtractive bass synth with proper ADSR amp envelope,
filter envelope modulation, last-note-priority voice management, and
velocity sensitivity.

Controls:
  Cutoff      — filter cutoff frequency (100–5000 Hz)
  Reso        — filter resonance (0–0.95)
  Env Amt     — filter envelope modulation amount (0–4x cutoff)
  Decay       — filter envelope decay time (50–2000 ms)
  Attack      — amp envelope attack (1–500 ms)
  Release     — amp envelope release (10–2000 ms)

Signal flow (classic Moog architecture):
  notein → poly 1 1 (mono, last-note priority)
    ├─ pitch → mtof → sig~
    │                  │
    │           saw~ (primary — fat sawtooth)
    │                  │
    │           cycle~ at freq/2 (sub oscillator, one octave below)
    │                  │
    │           +~ → *~ 0.5 (mix saw + sub)
    │                  │
    │           lores~ (resonant lowpass filter — Moog-style sweep)
    │             ↑ cutoff = base_cutoff + (filter_env * env_amt)
    │                  │
    │           *~ amp_envelope (VCA via adsr~)
    │                  │
    │           clip~ → plugout~
    │
    └─ velocity → expr / 127. → both adsr~ envelopes
                  (velocity-sensitive dynamics)

Key improvements over the old template:
  • Proper ADSR amp envelope via adsr~ (was: line~ + messages)
  • Proper filter envelope via adsr~ with configurable decay
  • Velocity sensitivity (hard notes open filter + louder amp)
  • poly 1 1 voice allocator (fixes stuck notes on overlapping keys)
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


# ============================================================
# PRESENTATION BACKGROUND (warm Moog vibe)
# ============================================================

panel = place_raw({
    "box": {
        "maxclass": "panel", "text": "panel",
        "numinlets": 1, "numoutlets": 0, "outlettype": [],
        "patching_rect": [800.0, 200.0, 430.0, 120.0],
        "presentation": 1, "presentation_rect": [0.0, 0.0, 430.0, 120.0],
        "bgcolor": [0.08, 0.05, 0.02, 1.0],
        "mode": 0, "rounded": 0, "background": 1,
    }
}, 800, 200)

header_strip = place_raw({
    "box": {
        "maxclass": "panel", "text": "panel",
        "numinlets": 1, "numoutlets": 0, "outlettype": [],
        "patching_rect": [800.0, 190.0, 430.0, 24.0],
        "presentation": 1, "presentation_rect": [0.0, 0.0, 430.0, 24.0],
        "bgcolor": [0.35, 0.22, 0.08, 1.0],
        "mode": 0, "rounded": 0, "background": 1,
    }
}, 800, 190)

title = place_raw({
    "box": {
        "maxclass": "comment", "text": "BASS SYNTH",
        "numinlets": 1, "numoutlets": 0, "outlettype": [],
        "patching_rect": [800.0, 170.0, 120.0, 20.0],
        "presentation": 1, "presentation_rect": [12.0, 4.0, 140.0, 18.0],
        "fontsize": 12.0, "fontface": 1,
        "textcolor": [0.95, 0.75, 0.35, 1.0],
    }
}, 800, 170)

filter_label = place_raw({
    "box": {
        "maxclass": "comment", "text": "FILTER",
        "numinlets": 1, "numoutlets": 0, "outlettype": [],
        "patching_rect": [800.0, 340.0, 50.0, 16.0],
        "presentation": 1, "presentation_rect": [15.0, 28.0, 50.0, 16.0],
        "fontsize": 8.0, "fontface": 1,
        "textcolor": [0.6, 0.45, 0.25, 1.0],
    }
}, 800, 340)

env_label = place_raw({
    "box": {
        "maxclass": "comment", "text": "AMP ENV",
        "numinlets": 1, "numoutlets": 0, "outlettype": [],
        "patching_rect": [800.0, 360.0, 60.0, 16.0],
        "presentation": 1, "presentation_rect": [295.0, 28.0, 60.0, 16.0],
        "fontsize": 8.0, "fontface": 1,
        "textcolor": [0.6, 0.45, 0.25, 1.0],
    }
}, 800, 360)

# ============================================================
# MIDI INPUT + VOICE ALLOCATION
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

# poly 1 1: 1 voice, steal-mode 1 (replace oldest held)
# Outlets: 0=voice#, 1=pitch, 2=velocity, 3=list
patch.set_position(30, 105)
voice = patch.place("poly 1 1")[0]

patch.connect(
    [notein_obj.outs[0], voice.ins[0]],
    [notein_obj.outs[1], voice.ins[1]],
)

# ============================================================
# PITCH PATH
# ============================================================

patch.set_position(30, 145)
mtof_obj = patch.place("mtof")[0]

patch.set_position(30, 185)
freq_sig = patch.place("sig~")[0]

patch.connect(
    [voice.outs[1], mtof_obj.ins[0]],
    [mtof_obj.outs[0], freq_sig.ins[0]],
)

# ============================================================
# OSCILLATORS (saw + sub octave)
# ============================================================

patch.set_position(30, 240)
patch.place("comment === OSCILLATORS ===")[0]

# Primary sawtooth
patch.set_position(30, 275)
saw = patch.place("saw~")[0]

# Sub oscillator: freq / 2 (one octave below)
patch.set_position(200, 240)
freq_half = patch.place("*~ 0.5")[0]

patch.set_position(200, 275)
sub_osc = patch.place("cycle~")[0]

# Mix saw + sub (normalized)
patch.set_position(30, 315)
osc_mix = patch.place("+~")[0]

patch.set_position(30, 355)
osc_norm = patch.place("*~ 0.5")[0]

patch.connect(
    [freq_sig.outs[0], saw.ins[0]],
    [freq_sig.outs[0], freq_half.ins[0]],
    [freq_half.outs[0], sub_osc.ins[0]],
    [saw.outs[0], osc_mix.ins[0]],
    [sub_osc.outs[0], osc_mix.ins[1]],
    [osc_mix.outs[0], osc_norm.ins[0]],
)

# ============================================================
# VELOCITY SCALING (shared by both envelopes)
# ============================================================

patch.set_position(500, 30)
patch.place("comment === VELOCITY → ENVELOPES ===")[0]

vel_scale = place_raw({
    "box": {
        "maxclass": "newobj", "numinlets": 1, "numoutlets": 1,
        "outlettype": ["float"],
        "patching_rect": [500.0, 65.0, 80.0, 22.0],
        "text": "expr $i1 / 127.",
    }
}, 500, 65)

patch.connect([voice.outs[2], vel_scale.ins[0]])

# ============================================================
# AMP ENVELOPE (adsr~ for velocity-sensitive amplitude)
# ============================================================

# adsr~ A D S R
amp_env = place_raw({
    "box": {
        "maxclass": "newobj", "numinlets": 5, "numoutlets": 4,
        "outlettype": ["signal", "signal", "", ""],
        "patching_rect": [500.0, 105.0, 140.0, 22.0],
        "text": "adsr~ 5 200 0.75 300",
    }
}, 500, 105)

patch.connect([vel_scale.outs[0], amp_env.ins[0]])

# ============================================================
# FILTER ENVELOPE (adsr~ sweeps the cutoff — the Moog "bwow")
# ============================================================

# Second adsr~ for filter modulation: fast attack, configurable decay, 0 sustain
filt_env = place_raw({
    "box": {
        "maxclass": "newobj", "numinlets": 5, "numoutlets": 4,
        "outlettype": ["signal", "signal", "", ""],
        "patching_rect": [700.0, 105.0, 140.0, 22.0],
        "text": "adsr~ 5 400 0. 100",
    }
}, 700, 105)

patch.connect([vel_scale.outs[0], filt_env.ins[0]])

# ============================================================
# FILTER (lores~ with envelope modulation)
# ============================================================

patch.set_position(30, 410)
patch.place("comment === FILTER ===")[0]

# Main filter
patch.set_position(30, 445)
filt = patch.place("lores~ 500 0.5")[0]

# Base cutoff from dial (control)
patch.set_position(350, 445)
sig_cutoff = patch.place("sig~")[0]

# Resonance from dial (control)
patch.set_position(350, 485)
sig_reso = patch.place("sig~")[0]

# Env amount from dial (control) — multiplied by filter envelope
patch.set_position(200, 410)
sig_env_amt = patch.place("sig~")[0]

# Filter env output × env amount
patch.set_position(200, 445)
env_scaled = patch.place("*~")[0]

# Add scaled envelope to base cutoff
patch.set_position(200, 485)
cutoff_sum = patch.place("+~")[0]

patch.connect(
    [osc_norm.outs[0], filt.ins[0]],            # audio in
    [filt_env.outs[0], env_scaled.ins[0]],      # filter env signal
    [sig_env_amt.outs[0], env_scaled.ins[1]],   # * env amount
    [sig_cutoff.outs[0], cutoff_sum.ins[0]],    # + base cutoff
    [env_scaled.outs[0], cutoff_sum.ins[1]],
    [cutoff_sum.outs[0], filt.ins[1]],          # → filter cutoff
    [sig_reso.outs[0], filt.ins[2]],            # → filter resonance
)

# ============================================================
# VCA + OUTPUT
# ============================================================

patch.set_position(30, 540)
patch.place("comment === OUTPUT ===")[0]

patch.set_position(30, 575)
vca = patch.place("*~")[0]

patch.set_position(30, 615)
clip = patch.place("clip~ -1. 1.")[0]

patch.set_position(30, 655)
plugout = patch.place("plugout~")[0]

patch.connect(
    [filt.outs[0], vca.ins[0]],
    [amp_env.outs[0], vca.ins[1]],
    [vca.outs[0], clip.ins[0]],
    [clip.outs[0], plugout.ins[0]],
    [clip.outs[0], plugout.ins[1]],
)

# ============================================================
# LIVE.DIAL CONTROLS
# ============================================================

DIAL_COLORS = {
    "activedialcolor": [0.85, 0.55, 0.15, 1.0],
    "dialcolor": [0.3, 0.2, 0.08, 1.0],
    "activeneedlecolor": [1.0, 0.9, 0.7, 1.0],
    "needlecolor": [0.7, 0.55, 0.35, 1.0],
    "textcolor": [1.0, 0.9, 0.7, 1.0],
}


def make_dial(name, px, min_v, max_v, init, unitstyle=1, exponent=1.0):
    """Create a live.dial in the presentation UI."""
    return place_raw({
        "box": {
            "maxclass": "live.dial", "varname": name.lower().replace(" ", "_"),
            "text": "live.dial",
            "numinlets": 1, "numoutlets": 2, "outlettype": ["", "float"],
            "patching_rect": [800.0 + (px * 1.0), 230.0, 44.0, 48.0],
            "presentation": 1,
            "presentation_rect": [float(px), 46.0, 50.0, 56.0],
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
    }, 800 + int(px * 1.0), 230)


dial_cutoff = make_dial("Cutoff", 15, 100.0, 5000.0, 500.0, exponent=2.0)
dial_reso = make_dial("Reso", 85, 0.0, 0.95, 0.5)
dial_env_amt = make_dial("Env Amt", 155, 0.0, 5000.0, 2000.0, exponent=2.0)
dial_decay = make_dial("Decay", 225, 50.0, 2000.0, 400.0, exponent=2.0)
dial_attack = make_dial("Attack", 295, 1.0, 500.0, 5.0, exponent=2.0)
dial_release = make_dial("Release", 365, 10.0, 2000.0, 300.0, exponent=2.0)

# Connect dials → signals / envelopes
patch.connect(
    # Filter controls
    [dial_cutoff.outs[0], sig_cutoff.ins[0]],
    [dial_reso.outs[0], sig_reso.ins[0]],
    [dial_env_amt.outs[0], sig_env_amt.ins[0]],
    # Filter envelope decay
    [dial_decay.outs[0], filt_env.ins[2]],
    # Amp envelope A / R (D fixed, S fixed for punchy bass feel)
    [dial_attack.outs[0], amp_env.ins[1]],
    [dial_release.outs[0], amp_env.ins[4]],
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
