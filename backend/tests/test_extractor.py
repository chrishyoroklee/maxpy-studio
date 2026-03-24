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
        response = '''Helper:

```python
import json
x = 1
```

Full script:

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
import json
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

    # --- Allowlist import tests ---

    def test_forbidden_os_import_rejected(self):
        response = '''```python
import maxpylang as mp
import os
patch = mp.MaxPatch()
patch.place("plugout~")
patch.save("device.amxd")
```'''
        with pytest.raises(ExtractionError, match="Forbidden import"):
            extract_code(response)

    def test_forbidden_subprocess_rejected(self):
        response = '''```python
import maxpylang as mp
import subprocess
patch = mp.MaxPatch()
patch.place("plugout~")
patch.save("device.amxd")
```'''
        with pytest.raises(ExtractionError, match="Forbidden import"):
            extract_code(response)

    def test_forbidden_from_os_rejected(self):
        response = '''```python
import maxpylang as mp
from os import system
patch = mp.MaxPatch()
patch.place("plugout~")
patch.save("device.amxd")
```'''
        with pytest.raises(ExtractionError, match="Forbidden import"):
            extract_code(response)

    def test_forbidden_importlib_rejected(self):
        response = '''```python
import maxpylang as mp
import importlib
patch = mp.MaxPatch()
patch.place("plugout~")
patch.save("device.amxd")
```'''
        with pytest.raises(ExtractionError, match="Forbidden import"):
            extract_code(response)

    def test_forbidden_pty_rejected(self):
        response = '''```python
import maxpylang as mp
import pty
patch = mp.MaxPatch()
patch.place("plugout~")
patch.save("device.amxd")
```'''
        with pytest.raises(ExtractionError, match="Forbidden import"):
            extract_code(response)

    def test_forbidden_requests_rejected(self):
        response = '''```python
import maxpylang as mp
import requests
patch = mp.MaxPatch()
patch.place("plugout~")
patch.save("device.amxd")
```'''
        with pytest.raises(ExtractionError, match="Forbidden import"):
            extract_code(response)

    def test_dangerous_eval_rejected(self):
        response = '''```python
import maxpylang as mp
eval("1+1")
patch = mp.MaxPatch()
patch.place("plugout~")
patch.save("device.amxd")
```'''
        with pytest.raises(ExtractionError, match="forbidden pattern"):
            extract_code(response)

    def test_dangerous_getattr_rejected(self):
        response = '''```python
import maxpylang as mp
getattr(object, "x")
patch = mp.MaxPatch()
patch.place("plugout~")
patch.save("device.amxd")
```'''
        with pytest.raises(ExtractionError, match="forbidden pattern"):
            extract_code(response)

    def test_dangerous_builtins_rejected(self):
        response = '''```python
import maxpylang as mp
x = __builtins__
patch = mp.MaxPatch()
patch.place("plugout~")
patch.save("device.amxd")
```'''
        with pytest.raises(ExtractionError, match="forbidden pattern"):
            extract_code(response)

    # --- Allowed imports ---

    def test_json_import_accepted(self):
        response = '''```python
import maxpylang as mp
import json
patch = mp.MaxPatch()
patch.place("plugout~")
patch.save("device.amxd")
```'''
        code = extract_code(response)
        assert "import json" in code

    def test_save_amxd_import_accepted(self):
        response = '''```python
import maxpylang as mp
from amxd import save_amxd
patch = mp.MaxPatch()
patch.place("plugout~")
patch.save("device.maxpat")
save_amxd(patch.get_json(), "device.amxd", device_type="audio_effect")
```'''
        code = extract_code(response)
        assert "save_amxd" in code

    def test_maxpylang_submodule_import_accepted(self):
        response = '''```python
import maxpylang as mp
from maxpylang.maxobject import MaxObject
patch = mp.MaxPatch()
patch.place("plugout~")
patch.save("device.amxd")
```'''
        code = extract_code(response)
        assert "MaxObject" in code

    def test_numpy_import_accepted(self):
        response = '''```python
import maxpylang as mp
import numpy
patch = mp.MaxPatch()
patch.place("plugout~")
patch.save("device.amxd")
```'''
        code = extract_code(response)
        assert "import numpy" in code
