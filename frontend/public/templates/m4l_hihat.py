"""
Max for Live Hihat Instrument (M4L Instrument)
===============================================
A playable closed hihat synth that runs as a Max for Live MIDI instrument.

  notein (MIDI from Ableton)
    └─ velocity -> > 0 -> select 1 0 -> attack/decay messages -> line~ (envelope)

  noise~ -> svf~ (highpass 8kHz, Q 0.5) -> *~ (envelope VCA) -> clip~ -> plugout~

Usage in Ableton Live:
  1. Drag the .amxd onto a MIDI track
  2. Play notes — each hit triggers a short closed hihat
"""

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
# NOISE + FILTER
# ============================================================

patch.set_position(30, 30)
patch.place("comment === NOISE + FILTER ===")[0]

patch.set_position(30, 65)
noise = patch.place("noise~")[0]

svf = place_raw({
    "box": {
        "maxclass": "newobj", "numinlets": 3, "numoutlets": 4,
        "outlettype": ["signal", "signal", "signal", "signal"],
        "patching_rect": [30.0, 105.0, 36.0, 22.0],
        "text": "svf~"
    }
}, 30, 105)

# Filter parameters: cutoff 8kHz, Q 0.5
loadbang_freq = place_raw({
    "box": {
        "maxclass": "newobj", "numinlets": 1, "numoutlets": 1,
        "outlettype": ["bang"],
        "patching_rect": [170.0, 65.0, 58.0, 22.0],
        "text": "loadbang"
    }
}, 170, 65)

msg_freq = place_raw({
    "box": {
        "maxclass": "message", "numinlets": 2, "numoutlets": 1,
        "outlettype": [""],
        "patching_rect": [170.0, 105.0, 42.0, 22.0],
        "text": "8000."
    }
}, 170, 105)

loadbang_q = place_raw({
    "box": {
        "maxclass": "newobj", "numinlets": 1, "numoutlets": 1,
        "outlettype": ["bang"],
        "patching_rect": [300.0, 65.0, 58.0, 22.0],
        "text": "loadbang"
    }
}, 300, 65)

msg_q = place_raw({
    "box": {
        "maxclass": "message", "numinlets": 2, "numoutlets": 1,
        "outlettype": [""],
        "patching_rect": [300.0, 105.0, 29.0, 22.0],
        "text": "0.5"
    }
}, 300, 105)

patch.connect(
    [noise.outs[0], svf.ins[0]],
    [loadbang_freq.outs[0], msg_freq.ins[0]],
    [msg_freq.outs[0], svf.ins[1]],
    [loadbang_q.outs[0], msg_q.ins[0]],
    [msg_q.outs[0], svf.ins[2]],
)

# ============================================================
# ENVELOPE (velocity -> gate -> line~)
# ============================================================

patch.set_position(430, 30)
patch.place("comment === ENVELOPE ===")[0]

notein = place_raw({
    "box": {
        "maxclass": "newobj", "numinlets": 1, "numoutlets": 3,
        "outlettype": ["int", "int", "int"],
        "patching_rect": [430.0, 65.0, 41.0, 22.0],
        "text": "notein"
    }
}, 430, 65)

vel_gate = place_raw({
    "box": {
        "maxclass": "newobj", "numinlets": 2, "numoutlets": 1,
        "outlettype": ["int"],
        "patching_rect": [430.0, 105.0, 29.0, 22.0],
        "text": "> 0"
    }
}, 430, 105)

patch.set_position(430, 145)
sel = patch.place("select 1 0")[0]

msg_attack = place_raw({
    "box": {
        "maxclass": "message", "numinlets": 2, "numoutlets": 1,
        "outlettype": [""],
        "patching_rect": [430.0, 185.0, 32.0, 22.0],
        "text": "1. 1"
    }
}, 430, 185)

msg_decay = place_raw({
    "box": {
        "maxclass": "message", "numinlets": 2, "numoutlets": 1,
        "outlettype": [""],
        "patching_rect": [530.0, 185.0, 38.0, 22.0],
        "text": "0. 80"
    }
}, 530, 185)

patch.set_position(430, 225)
line_env = patch.place("line~")[0]

patch.connect(
    [notein.outs[1], vel_gate.ins[0]],
    [vel_gate.outs[0], sel.ins[0]],
    [sel.outs[0], msg_attack.ins[0]],
    [sel.outs[1], msg_decay.ins[0]],
    [msg_attack.outs[0], line_env.ins[0]],
    [msg_decay.outs[0], line_env.ins[0]],
)

# ============================================================
# OUTPUT
# ============================================================

patch.set_position(30, 180)
patch.place("comment === OUTPUT ===")[0]

# Envelope VCA: svf~ highpass (outlet 1) * line~ envelope
patch.set_position(30, 210)
env_vca = patch.place("*~")[0]

# Safety + plugout~
patch.set_position(30, 250)
clip = patch.place("clip~ -1. 1.")[0]

patch.set_position(30, 290)
plugout = patch.place("plugout~")[0]

patch.connect(
    # svf~ highpass (outlet 1) -> envelope VCA
    [svf.outs[1], env_vca.ins[0]],
    [line_env.outs[0], env_vca.ins[1]],
    # VCA -> clip -> plugout~ stereo
    [env_vca.outs[0], clip.ins[0]],
    [clip.outs[0], plugout.ins[0]],
    [clip.outs[0], plugout.ins[1]],
)

# ============================================================
# INSTRUCTIONS
# ============================================================

patch.set_position(30, 340)
patch.place("comment Drag this .amxd onto a MIDI track in Ableton Live")[0]

# ============================================================
# SAVE
# ============================================================

patch.save("device.maxpat")
print("Saved: examples/m4l_hihat.maxpat")

from amxd import save_amxd
save_amxd(patch.get_json(), "device.amxd", device_type="instrument")
print("Saved: examples/m4l_hihat.amxd")

print(f"Total objects: {patch.num_objs}")
