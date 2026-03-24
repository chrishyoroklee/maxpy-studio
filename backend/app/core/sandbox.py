"""Sandboxed execution of LLM-generated maxpylang code.

MVP: subprocess with timeout (local dev).
Production: Docker container with no network (Phase 3).
"""

import os
import re
import shutil
import subprocess
import sys
import uuid
from pathlib import Path

from app.config import settings

# Path to amxd.py helper (shipped with the project)
AMXD_MODULE = Path(__file__).parent.parent.parent / "sandbox" / "amxd.py"


class SandboxError(Exception):
    """Raised when code execution fails in the sandbox."""
    pass


class SandboxResult:
    def __init__(self, generation_id: str, stdout: str, stderr: str, files: dict[str, Path]):
        self.generation_id = generation_id
        self.stdout = stdout
        self.stderr = stderr
        self.files = files  # {"maxpat": Path, "amxd": Path}


def execute(code: str, generation_id: str | None = None, timeout: int = 30) -> SandboxResult:
    """Run generated maxpylang code and collect output files.

    Args:
        code: Python source code to execute.
        generation_id: Optional UUID to use. If None, a new one is created.
        timeout: Max execution time in seconds.

    Returns:
        SandboxResult with paths to generated .maxpat and .amxd files.

    Raises:
        SandboxError: If execution fails or times out.
    """
    if generation_id is None:
        generation_id = str(uuid.uuid4())

    output_dir = settings.output_path / generation_id
    output_dir.mkdir(parents=True, exist_ok=True)

    # Copy amxd.py into the output dir so `from amxd import save_amxd` works
    if AMXD_MODULE.exists():
        shutil.copy2(AMXD_MODULE, output_dir / "amxd.py")

    # Rewrite save paths in the code to point to our output directory
    code = _rewrite_save_paths(code, output_dir)

    # Write code to a temp file
    code_file = output_dir / "generate.py"
    code_file.write_text(code)

    # Use the same Python interpreter that's running the server
    # (ensures maxpylang is importable)
    python_exec = sys.executable

    # Minimal environment — do NOT leak server secrets to the subprocess
    safe_env = {
        "PATH": os.environ.get("PATH", "/usr/bin:/usr/local/bin"),
        "HOME": os.environ.get("HOME", "/tmp"),
        "PYTHONPATH": os.environ.get("PYTHONPATH", ""),
        "PYTHONDONTWRITEBYTECODE": "1",
        "VIRTUAL_ENV": os.environ.get("VIRTUAL_ENV", ""),
    }

    try:
        result = subprocess.run(
            [python_exec, str(code_file)],
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=str(output_dir),
            env=safe_env,
        )
    except subprocess.TimeoutExpired:
        raise SandboxError(f"Code execution timed out after {timeout}s")
    except FileNotFoundError:
        raise SandboxError(f"Python not found at {python_exec}")

    if result.returncode != 0:
        # Truncate long error messages
        stderr = result.stderr
        if len(stderr) > 2000:
            stderr = stderr[:2000] + "\n... (truncated)"
        raise SandboxError(
            f"Code execution failed (exit {result.returncode}):\n{stderr}"
        )

    # Collect output files
    files = {}
    for f in output_dir.iterdir():
        if f.suffix == ".maxpat":
            files["maxpat"] = f
        elif f.suffix == ".amxd":
            files["amxd"] = f

    if "amxd" not in files:
        raise SandboxError(
            "Code executed successfully but no .amxd file was generated.\n"
            f"stdout: {result.stdout}\nFiles in output: {list(output_dir.iterdir())}"
        )

    return SandboxResult(
        generation_id=generation_id,
        stdout=result.stdout,
        stderr=result.stderr,
        files=files,
    )


def _rewrite_save_paths(code: str, output_dir: Path) -> str:
    """Rewrite file paths in save() and save_amxd() calls to use the output directory."""
    out = str(output_dir).replace("\\", "/")  # normalize for all platforms

    # patch.save("anything.maxpat" ...) → patch.save("{out}/device.maxpat" ...)
    code = re.sub(
        r"""\.save\(\s*(['"])([^'"]*\.maxpat)\1""",
        f'.save("{out}/device.maxpat"',
        code,
    )

    # patch.save("anything.amxd" ...) → patch.save("{out}/device.amxd" ...)
    code = re.sub(
        r"""\.save\(\s*(['"])([^'"]*\.amxd)\1""",
        f'.save("{out}/device.amxd"',
        code,
    )

    # save_amxd(..., "anything.amxd" ...) → save_amxd(..., "{out}/device.amxd" ...)
    code = re.sub(
        r"""save_amxd\(([^,]+),\s*(['"])([^'"]*\.amxd)\2""",
        f'save_amxd(\\1, "{out}/device.amxd"',
        code,
    )

    return code
