"""Tests for sandbox execution."""

import pytest
from app.core.sandbox import execute, SandboxError, _rewrite_save_paths
from pathlib import Path


class TestRewriteSavePaths:
    def test_rewrites_maxpat_path(self):
        code = 'patch.save("examples/m4l_chorus.maxpat")'
        result = _rewrite_save_paths(code, Path("/tmp/out"))
        assert "/tmp/out/device.maxpat" in result

    def test_rewrites_amxd_path(self):
        code = 'patch.save("examples/m4l_chorus.amxd", device_type="audio_effect")'
        result = _rewrite_save_paths(code, Path("/tmp/out"))
        assert "/tmp/out/device.amxd" in result

    def test_rewrites_save_amxd_call(self):
        code = 'save_amxd(patch.get_json(), "examples/chorus.amxd", device_type="audio_effect")'
        result = _rewrite_save_paths(code, Path("/tmp/out"))
        assert "/tmp/out/device.amxd" in result

    def test_handles_single_quotes(self):
        code = "patch.save('my_device.maxpat')"
        result = _rewrite_save_paths(code, Path("/tmp/out"))
        assert "/tmp/out/device.maxpat" in result

    def test_preserves_non_save_code(self):
        code = 'x = "hello.maxpat"\nprint(x)'
        result = _rewrite_save_paths(code, Path("/tmp/out"))
        assert 'x = "hello.maxpat"' in result


class TestExecute:
    def test_simple_script_generates_files(self):
        """Test that a minimal maxpylang script produces .amxd output."""
        code = '''
import maxpylang as mp
from maxpylang.maxobject import MaxObject
import json

patch = mp.MaxPatch()

def place_raw(obj_dict, x, y):
    obj = MaxObject(obj_dict, from_dict=True)
    patch.set_position(x, y)
    patch.place_obj(obj, position=[float(x), float(y)])
    return obj

plugin = place_raw({
    "box": {
        "maxclass": "newobj", "numinlets": 2, "numoutlets": 2,
        "outlettype": ["signal", "signal"],
        "patching_rect": [30.0, 65.0, 46.0, 22.0],
        "text": "plugin~"
    }
}, 30, 65)

patch.set_position(30, 105)
clip = patch.place("clip~ -1. 1.")[0]

patch.set_position(30, 145)
plugout = patch.place("plugout~")[0]

patch.connect(
    [plugin.outs[0], clip.ins[0]],
    [clip.outs[0], plugout.ins[0]],
    [clip.outs[0], plugout.ins[1]],
)

# Save using manual JSON + amxd approach
patcher_json = patch.get_json()
with open("device.maxpat", "w") as f:
    json.dump(patcher_json, f)

from amxd import save_amxd
save_amxd(patcher_json, "device.amxd", device_type="audio_effect")
print("Generated successfully")
'''
        result = execute(code)
        assert result.generation_id
        assert "amxd" in result.files
        assert result.files["amxd"].exists()
        assert result.files["amxd"].stat().st_size > 0

    def test_timeout_raises(self):
        code = '''
import time
time.sleep(60)
'''
        with pytest.raises(SandboxError, match="timed out"):
            execute(code, timeout=2)

    def test_syntax_error_raises(self):
        code = "def broken(:\n  pass"
        with pytest.raises(SandboxError, match="execution failed"):
            execute(code)

    def test_missing_amxd_output_raises(self):
        code = "print('hello')"
        with pytest.raises(SandboxError, match="no .amxd file"):
            execute(code)
