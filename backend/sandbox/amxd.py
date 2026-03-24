"""
amxd.py — Save and load Max for Live .amxd files.

The .amxd format is a binary wrapper around the same JSON that .maxpat uses.
Three chunks: ampf (device type), meta (empty), ptch (patcher JSON + null).
"""

import struct
import json

DEVICE_TYPES = {
    "audio_effect": b"aaaa",
    "midi_effect":  b"mmmm",
    "instrument":   b"iiii",
}


def save_amxd(patcher_json, filename, device_type="instrument"):
    """Wrap a patcher JSON dict in .amxd binary format and write to file."""
    if device_type not in DEVICE_TYPES:
        raise ValueError(f"Unknown device_type {device_type!r}. "
                         f"Choose from: {', '.join(DEVICE_TYPES)}")

    json_bytes = json.dumps(patcher_json, indent=2).encode("utf-8") + b"\x00"

    with open(filename, "wb") as f:
        # ampf chunk — device type identifier
        f.write(b"ampf")
        f.write(struct.pack("<I", 4))
        f.write(DEVICE_TYPES[device_type])
        # meta chunk — reserved, 4 null bytes
        f.write(b"meta")
        f.write(struct.pack("<I", 4))
        f.write(b"\x00\x00\x00\x00")
        # ptch chunk — the patcher JSON, null-terminated
        f.write(b"ptch")
        f.write(struct.pack("<I", len(json_bytes)))
        f.write(json_bytes)


def load_amxd(filename):
    """Read an .amxd file and return the patcher JSON dict."""
    with open(filename, "rb") as f:
        data = f.read()

    offset = 0
    while offset < len(data):
        field = data[offset:offset + 4].decode("ascii")
        size = struct.unpack("<I", data[offset + 4:offset + 8])[0]
        if field == "ptch":
            json_bytes = data[offset + 8:offset + 8 + size]
            return json.loads(json_bytes.rstrip(b"\x00"))
        offset += 8 + size

    raise ValueError("No ptch chunk found in .amxd file")
