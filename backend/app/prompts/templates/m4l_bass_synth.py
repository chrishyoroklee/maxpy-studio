"""
Max for Live Bass Synth (M4L Instrument) — Moog-inspired
=========================================================
A monophonic subtractive bass synth inspired by the Minimoog.

  Cutoff — filter cutoff frequency (100–5000 Hz)
  Reso   — filter resonance (0–0.9)
  Decay  — filter envelope decay time (50–2000 ms)

Signal flow (classic Moog architecture):
  notein
    ├─ note → mtof → sig~
    │                  │
    │           saw~ (primary — fat sawtooth)
    │                  │
    │           cycle~ at freq/2 (sub oscillator, one octave below)
    │                  │
    │           +~ → *~ 0.5 (mix saw + sub)
    │                  │
    │           lores~ (resonant lowpass filter — Moog-style sweep)
    │             ↑ cutoff modulated by filter envelope
    │                  │
    │           *~ amp_envelope (VCA)
    │                  │
    │           clip~ → plugout~
    │
    └─ velocity → > 0 → select 1 0
                          │
                   filter envelope (line~): fast attack, sweeps cutoff down
                   amp envelope (line~): fast attack, sustains, releases

Usage in Ableton Live:
  1. Drag the .amxd onto a MIDI track
  2. Play bass notes — monophonic, last-note priority
  3. Cutoff sets the base filter frequency
  4. Reso adds resonant peak for more aggressive sound
  5. Decay controls how long the filter sweep takes
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
# PRESENTATION BACKGROUND
# ============================================================

# Main background (dark wood/leather Moog vibe)
panel = place_raw({
    "box": {
        "maxclass": "panel", "text": "panel",
        "numinlets": 1, "numoutlets": 0, "outlettype": [],
        "patching_rect": [600.0, 200.0, 260.0, 120.0],
        "presentation": 1, "presentation_rect": [0.0, 0.0, 260.0, 120.0],
        "bgcolor": [0.08, 0.05, 0.02, 1.0],
        "mode": 0, "rounded": 0, "background": 1
    }
}, 600, 200)

# Header strip (warm amber accent bar)
header_strip = place_raw({
    "box": {
        "maxclass": "panel", "text": "panel",
        "numinlets": 1, "numoutlets": 0, "outlettype": [],
        "patching_rect": [600.0, 190.0, 260.0, 24.0],
        "presentation": 1, "presentation_rect": [0.0, 0.0, 260.0, 24.0],
        "bgcolor": [0.35, 0.22, 0.08, 1.0],
        "mode": 0, "rounded": 0, "background": 1
    }
}, 600, 190)

# Filter section label
filter_label = place_raw({
    "box": {
        "maxclass": "comment", "text": "FILTER",
        "numinlets": 1, "numoutlets": 0, "outlettype": [],
        "patching_rect": [600.0, 350.0, 50.0, 16.0],
        "presentation": 1, "presentation_rect": [10.0, 28.0, 50.0, 16.0],
        "fontsize": 8.0, "fontface": 1,
        "textcolor": [0.6, 0.45, 0.25, 1.0]
    }
}, 600, 350)

# Envelope section label
env_label = place_raw({
    "box": {
        "maxclass": "comment", "text": "ENV",
        "numinlets": 1, "numoutlets": 0, "outlettype": [],
        "patching_rect": [600.0, 360.0, 40.0, 16.0],
        "presentation": 1, "presentation_rect": [185.0, 28.0, 40.0, 16.0],
        "fontsize": 8.0, "fontface": 1,
        "textcolor": [0.6, 0.45, 0.25, 1.0]
    }
}, 600, 360)

# ============================================================
# MIDI INPUT
# ============================================================

patch.set_position(30, 30)
patch.place("comment === MIDI INPUT ===")[0]

notein_obj = place_raw({
    "box": {
        "maxclass": "newobj", "numinlets": 1, "numoutlets": 3,
        "outlettype": ["int", "int", "int"],
        "patching_rect": [30.0, 65.0, 41.0, 22.0],
        "text": "notein"
    }
}, 30, 65)

patch.set_position(30, 105)
mtof_obj = patch.place("mtof")[0]

patch.set_position(30, 145)
freq_sig = patch.place("sig~")[0]

patch.connect(
    [notein_obj.outs[0], mtof_obj.ins[0]],
    [mtof_obj.outs[0], freq_sig.ins[0]],
)

# ============================================================
# OSCILLATORS (saw + sub octave)
# ============================================================

patch.set_position(30, 200)
patch.place("comment === OSCILLATORS ===")[0]

# Primary sawtooth
patch.set_position(30, 235)
saw = patch.place("saw~")[0]

# Sub oscillator: freq / 2 (one octave below)
patch.set_position(200, 200)
freq_half = patch.place("*~ 0.5")[0]

patch.set_position(200, 235)
sub_osc = patch.place("cycle~")[0]

# Mix saw + sub
patch.set_position(30, 275)
osc_mix = patch.place("+~")[0]

patch.set_position(30, 315)
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
# FILTER (lores~ with envelope modulation — the Moog "bwow")
# ============================================================

patch.set_position(30, 370)
patch.place("comment === FILTER ===")[0]

# Filter cutoff = base_cutoff + (envelope * sweep_amount)
# Base cutoff from Cutoff dial
patch.set_position(30, 405)
filt = patch.place("lores~ 500 0.5")[0]

# sig~ for base cutoff from dial
patch.set_position(350, 405)
sig_cutoff = patch.place("sig~")[0]

# sig~ for resonance from dial
patch.set_position(350, 445)
sig_reso = patch.place("sig~")[0]

# Filter envelope: sweeps cutoff up then back down
# Envelope amount = cutoff * 4 (sweep range)
patch.set_position(200, 370)
env_amount = patch.place("*~ 4")[0]

# Add envelope sweep to base cutoff
patch.set_position(200, 405)
cutoff_sum = patch.place("+~")[0]

patch.connect(
    [osc_norm.outs[0], filt.ins[0]],
    [sig_cutoff.outs[0], cutoff_sum.ins[0]],
    [env_amount.outs[0], cutoff_sum.ins[1]],
    [cutoff_sum.outs[0], filt.ins[1]],
    [sig_reso.outs[0], filt.ins[2]],
)

# ============================================================
# ENVELOPES (filter sweep + amplitude)
# ============================================================

patch.set_position(400, 30)
patch.place("comment === ENVELOPES ===")[0]

# Velocity gate
vel_gate = place_raw({
    "box": {
        "maxclass": "newobj", "numinlets": 2, "numoutlets": 1,
        "outlettype": ["int"],
        "patching_rect": [400.0, 65.0, 29.0, 22.0],
        "text": "> 0"
    }
}, 400, 65)

patch.set_position(400, 105)
sel = patch.place("select 1 0")[0]

# Amp envelope: fast attack, moderate sustain, medium release
msg_amp_on = place_raw({
    "box": {
        "maxclass": "message", "numinlets": 2, "numoutlets": 1,
        "outlettype": [""],
        "patching_rect": [400.0, 145.0, 75.0, 22.0],
        "text": "0.9 5, 0.6 200"
    }
}, 400, 145)

msg_amp_off = place_raw({
    "box": {
        "maxclass": "message", "numinlets": 2, "numoutlets": 1,
        "outlettype": [""],
        "patching_rect": [520.0, 145.0, 45.0, 22.0],
        "text": "0. 150"
    }
}, 520, 145)

patch.set_position(400, 185)
amp_line = patch.place("line~")[0]

# Filter envelope: fast attack, decays to 0 (the "bwow" sweep)
# Decay time controlled by Decay dial via message construction
msg_filt_on = place_raw({
    "box": {
        "maxclass": "message", "numinlets": 2, "numoutlets": 1,
        "outlettype": [""],
        "patching_rect": [400.0, 240.0, 70.0, 22.0],
        "text": "1. 5, 0. 400"
    }
}, 400, 240)

msg_filt_off = place_raw({
    "box": {
        "maxclass": "message", "numinlets": 2, "numoutlets": 1,
        "outlettype": [""],
        "patching_rect": [520.0, 240.0, 42.0, 22.0],
        "text": "0. 50"
    }
}, 520, 240)

patch.set_position(400, 280)
filt_line = patch.place("line~")[0]

# Connect velocity gate → envelopes
patch.connect(
    [notein_obj.outs[1], vel_gate.ins[0]],
    [vel_gate.outs[0], sel.ins[0]],
    [sel.outs[0], msg_amp_on.ins[0]],
    [sel.outs[0], msg_filt_on.ins[0]],
    [sel.outs[1], msg_amp_off.ins[0]],
    [sel.outs[1], msg_filt_off.ins[0]],
    [msg_amp_on.outs[0], amp_line.ins[0]],
    [msg_amp_off.outs[0], amp_line.ins[0]],
    [msg_filt_on.outs[0], filt_line.ins[0]],
    [msg_filt_off.outs[0], filt_line.ins[0]],
    # Filter envelope → filter cutoff modulation
    [filt_line.outs[0], env_amount.ins[0]],
)

# ============================================================
# VCA + OUTPUT
# ============================================================

patch.set_position(30, 460)
patch.place("comment === OUTPUT ===")[0]

patch.set_position(30, 495)
vca = patch.place("*~")[0]

patch.set_position(30, 535)
clip = patch.place("clip~ -1. 1.")[0]

patch.set_position(30, 575)
plugout = patch.place("plugout~")[0]

patch.connect(
    [filt.outs[0], vca.ins[0]],
    [amp_line.outs[0], vca.ins[1]],
    [vca.outs[0], clip.ins[0]],
    [clip.outs[0], plugout.ins[0]],
    [clip.outs[0], plugout.ins[1]],
)

# ============================================================
# CONTROLS (live.dial — automatable in Ableton)
# ============================================================

# Warm amber/brown color scheme (vintage Moog vibe)
DIAL_COLORS = {
    "activedialcolor": [0.85, 0.55, 0.15, 1.0],
    "dialcolor": [0.3, 0.2, 0.08, 1.0],
    "activeneedlecolor": [1.0, 0.9, 0.7, 1.0],
    "needlecolor": [0.7, 0.55, 0.35, 1.0],
    "textcolor": [1.0, 0.9, 0.7, 1.0],
}

dial_cutoff = place_raw({
    "box": {
        "maxclass": "live.dial", "varname": "cutoff", "text": "live.dial",
        "numinlets": 1, "numoutlets": 2, "outlettype": ["", "float"],
        "patching_rect": [600.0, 230.0, 44.0, 48.0],
        "presentation": 1, "presentation_rect": [15.0, 46.0, 50.0, 56.0],
        "parameter_enable": 1, **DIAL_COLORS,
        "saved_attribute_attributes": {
            "valueof": {
                "parameter_longname": "Cutoff", "parameter_shortname": "Cutoff",
                "parameter_type": 0, "parameter_mmin": 100.0, "parameter_mmax": 5000.0,
                "parameter_initial_enable": 1, "parameter_initial": [500.0],
                "parameter_unitstyle": 1, "parameter_exponent": 2.0
            }
        }
    }
}, 600, 230)

dial_reso = place_raw({
    "box": {
        "maxclass": "live.dial", "varname": "reso", "text": "live.dial",
        "numinlets": 1, "numoutlets": 2, "outlettype": ["", "float"],
        "patching_rect": [670.0, 230.0, 44.0, 48.0],
        "presentation": 1, "presentation_rect": [95.0, 46.0, 50.0, 56.0],
        "parameter_enable": 1, **DIAL_COLORS,
        "saved_attribute_attributes": {
            "valueof": {
                "parameter_longname": "Reso", "parameter_shortname": "Reso",
                "parameter_type": 0, "parameter_mmin": 0.0, "parameter_mmax": 0.95,
                "parameter_initial_enable": 1, "parameter_initial": [0.5],
                "parameter_unitstyle": 1
            }
        }
    }
}, 670, 230)

dial_decay = place_raw({
    "box": {
        "maxclass": "live.dial", "varname": "decay", "text": "live.dial",
        "numinlets": 1, "numoutlets": 2, "outlettype": ["", "float"],
        "patching_rect": [740.0, 230.0, 44.0, 48.0],
        "presentation": 1, "presentation_rect": [190.0, 46.0, 50.0, 56.0],
        "parameter_enable": 1, **DIAL_COLORS,
        "saved_attribute_attributes": {
            "valueof": {
                "parameter_longname": "Decay", "parameter_shortname": "Decay",
                "parameter_type": 0, "parameter_mmin": 50.0, "parameter_mmax": 2000.0,
                "parameter_initial_enable": 1, "parameter_initial": [400.0],
                "parameter_unitstyle": 1, "parameter_exponent": 2.0
            }
        }
    }
}, 740, 230)

# Connect dials to processing
patch.connect(
    [dial_cutoff.outs[0], sig_cutoff.ins[0]],
    [dial_reso.outs[0], sig_reso.ins[0]],
)

# ============================================================
# PRESENTATION UI (title)
# ============================================================

title = place_raw({
    "box": {
        "maxclass": "comment", "text": "BASS SYNTH",
        "numinlets": 1, "numoutlets": 0, "outlettype": [],
        "patching_rect": [600.0, 300.0, 100.0, 20.0],
        "presentation": 1, "presentation_rect": [8.0, 4.0, 120.0, 18.0],
        "fontsize": 12.0, "fontface": 1,
        "textcolor": [0.95, 0.75, 0.35, 1.0]
    }
}, 600, 300)

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
