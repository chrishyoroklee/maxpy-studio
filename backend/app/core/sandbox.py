"""Sandboxed execution of LLM-generated maxpylang code.

MVP: subprocess with timeout (local dev).
Production: Docker container with no network (Phase 3).
"""

import subprocess
import tempfile
import uuid
from pathlib import Path

from app.config import settings


class SandboxError(Exception):
    """Raised when code execution fails in the sandbox."""
    pass


class SandboxResult:
    def __init__(self, generation_id: str, stdout: str, stderr: str, files: dict[str, Path]):
        self.generation_id = generation_id
        self.stdout = stdout
        self.stderr = stderr
        self.files = files  # {"maxpat": Path, "amxd": Path}


def execute(code: str, timeout: int = 30) -> SandboxResult:
    """Run generated maxpylang code and collect output files.

    Args:
        code: Python source code to execute.
        timeout: Max execution time in seconds.

    Returns:
        SandboxResult with paths to generated .maxpat and .amxd files.

    Raises:
        SandboxError: If execution fails or times out.
    """
    generation_id = str(uuid.uuid4())
    output_dir = settings.output_path / generation_id
    output_dir.mkdir(parents=True, exist_ok=True)

    # Rewrite save paths in the code to point to our output directory
    # Replace any save("...") path with our output directory
    code = _rewrite_save_paths(code, output_dir)

    # Write code to a temp file
    code_file = output_dir / "generate.py"
    code_file.write_text(code)

    try:
        result = subprocess.run(
            ["python3", str(code_file)],
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=str(output_dir),
        )
    except subprocess.TimeoutExpired:
        raise SandboxError(f"Code execution timed out after {timeout}s")
    except FileNotFoundError:
        raise SandboxError("Python3 not found. Is it installed?")

    if result.returncode != 0:
        raise SandboxError(
            f"Code execution failed (exit {result.returncode}):\n{result.stderr}"
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
            "Code executed but no .amxd file was generated.\n"
            f"stdout: {result.stdout}\nstderr: {result.stderr}"
        )

    return SandboxResult(
        generation_id=generation_id,
        stdout=result.stdout,
        stderr=result.stderr,
        files=files,
    )


def _rewrite_save_paths(code: str, output_dir: Path) -> str:
    """Rewrite file paths in save() calls to use the output directory.

    Replaces paths like 'examples/m4l_chorus.maxpat' with '{output_dir}/device.maxpat'.
    Also handles save_amxd() calls.
    """
    import re

    # Replace patch.save("anything.maxpat") → patch.save("{output_dir}/device.maxpat")
    code = re.sub(
        r'\.save\(["\']([^"\']*\.maxpat)["\']',
        f'.save("{output_dir}/device.maxpat"',
        code,
    )

    # Replace patch.save("anything.amxd", ...) → patch.save("{output_dir}/device.amxd", ...)
    code = re.sub(
        r'\.save\(["\']([^"\']*\.amxd)["\']',
        f'.save("{output_dir}/device.amxd"',
        code,
    )

    # Replace save_amxd(..., "anything.amxd", ...) → save_amxd(..., "{output_dir}/device.amxd", ...)
    code = re.sub(
        r'save_amxd\(([^,]+),\s*["\']([^"\']*\.amxd)["\']',
        f'save_amxd(\\1, "{output_dir}/device.amxd"',
        code,
    )

    return code
