"""
Max for Live Mono Synth (M4L Instrument)
==========================================
A simple sine synth that runs as a Max for Live MIDI instrument in Ableton.

  notein (MIDI from Ableton)
    ├─ note number -> mtof -> sig~ -> cycle~ (sine oscillator)
    └─ velocity -> gate -> line~ envelope
  cycle~ *~ line~ (envelope VCA) -> clip~ -> plugout~ (stereo to Ableton)

Usage in Ableton Live:
  1. Drag the .maxpat onto a MIDI track
  2. Play notes — the synth responds automatically
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
# MIDI INPUT
# ============================================================

patch.set_position(30, 30)
patch.place("comment === MIDI INPUT ===")[0]

# Pitch path: notein -> mtof -> sig~ -> cycle~
patch.set_position(30, 65)
patch.place("comment Pitch")[0]

notein = place_raw({
    "box": {
        "maxclass": "newobj", "numinlets": 1, "numoutlets": 3,
        "outlettype": ["int", "int", "int"],
        "patching_rect": [30.0, 90.0, 41.0, 22.0],
        "text": "notein"
    }
}, 30, 90)

patch.set_position(30, 130)
mtof = patch.place("mtof")[0]

patch.set_position(30, 170)
freq_sig = patch.place("sig~")[0]

patch.set_position(30, 210)
osc = patch.place("cycle~")[0]

patch.connect(
    [notein.outs[0], mtof.ins[0]],
    [mtof.outs[0], freq_sig.ins[0]],
    [freq_sig.outs[0], osc.ins[0]],
)

# ============================================================
# ENVELOPE (velocity -> gate -> line~)
# ============================================================

patch.set_position(250, 30)
patch.place("comment === ENVELOPE ===")[0]

patch.set_position(250, 65)
patch.place("comment Velocity gate")[0]

vel_gate = place_raw({
    "box": {
        "maxclass": "newobj", "numinlets": 2, "numoutlets": 1,
        "outlettype": ["int"],
        "patching_rect": [250.0, 90.0, 29.0, 22.0],
        "text": "> 0"
    }
}, 250, 90)

patch.set_position(250, 130)
sel = patch.place("select 1 0")[0]

msg_attack = place_raw({
    "box": {
        "maxclass": "message", "numinlets": 2, "numoutlets": 1,
        "outlettype": [""],
        "patching_rect": [250.0, 170.0, 50.0, 22.0],
        "text": "1. 10"
    }
}, 250, 170)

msg_release = place_raw({
    "box": {
        "maxclass": "message", "numinlets": 2, "numoutlets": 1,
        "outlettype": [""],
        "patching_rect": [370.0, 170.0, 50.0, 22.0],
        "text": "0. 300"
    }
}, 370, 170)

patch.set_position(250, 210)
line_env = patch.place("line~")[0]

patch.connect(
    [notein.outs[1], vel_gate.ins[0]],
    [vel_gate.outs[0], sel.ins[0]],
    [sel.outs[0], msg_attack.ins[0]],
    [sel.outs[1], msg_release.ins[0]],
    [msg_attack.outs[0], line_env.ins[0]],
    [msg_release.outs[0], line_env.ins[0]],
)

# ============================================================
# OUTPUT
# ============================================================

patch.set_position(30, 280)
patch.place("comment === OUTPUT ===")[0]

# Envelope VCA
patch.set_position(30, 310)
env_vca = patch.place("*~")[0]

# Safety + plugout~
patch.set_position(30, 350)
clip = patch.place("clip~ -1. 1.")[0]

patch.set_position(30, 390)
plugout = patch.place("plugout~")[0]

patch.connect(
    # Oscillator -> envelope VCA
    [osc.outs[0], env_vca.ins[0]],
    [line_env.outs[0], env_vca.ins[1]],
    # VCA -> clip -> plugout~ stereo
    [env_vca.outs[0], clip.ins[0]],
    [clip.outs[0], plugout.ins[0]],
    [clip.outs[0], plugout.ins[1]],
)

# ============================================================
# INSTRUCTIONS
# ============================================================

patch.set_position(30, 440)
patch.place("comment Drag this .maxpat onto a MIDI track in Ableton Live")[0]

# ============================================================
# SAVE
# ============================================================

patch.save("examples/m4l_mono_synth.maxpat")
print("Saved: examples/m4l_mono_synth.maxpat")

from amxd import save_amxd
save_amxd(patch.get_json(), "examples/m4l_mono_synth.amxd", device_type="instrument")
print("Saved: examples/m4l_mono_synth.amxd")

print(f"Total objects: {patch.num_objs}")
