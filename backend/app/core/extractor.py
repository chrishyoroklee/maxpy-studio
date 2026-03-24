"""Extract and validate Python code from LLM responses."""

import re

# Only these import patterns are allowed in generated code
ALLOWED_IMPORTS = re.compile(
    r"^(?:"
    r"import maxpylang"
    r"|from maxpylang[.\s].*"
    r"|import maxpylang\s+as\s+\w+"
    r"|import json"
    r"|from amxd\s+import.*"
    r"|import struct"
    r"|import numpy"
    r"|from numpy.*"
    r")$"
)

# Additional dangerous patterns beyond imports
DANGEROUS_PATTERNS = [
    r"\beval\s*\(",
    r"\bexec\s*\(",
    r"\bcompile\s*\(",
    r"\bgetattr\s*\(",
    r"\b__import__\b",
    r"\b__builtins__\b",
    r"\bglobals\s*\(",
    r"\blocals\s*\(",
]


class ExtractionError(Exception):
    """Raised when code cannot be extracted or validated."""
    pass


def extract_code(llm_response: str) -> str:
    """Extract Python code from a markdown-formatted LLM response.

    Looks for ```python ... ``` code fences and validates the content.

    Args:
        llm_response: Full text response from the LLM.

    Returns:
        The extracted Python code string.

    Raises:
        ExtractionError: If no code found or validation fails.
    """
    # Find all python code blocks
    pattern = r"```python\s*\n(.*?)```"
    matches = re.findall(pattern, llm_response, re.DOTALL)

    if not matches:
        raise ExtractionError(
            "No Python code block found in the response. "
            "Expected ```python ... ``` fence."
        )

    # Use the longest code block (likely the main script)
    code = max(matches, key=len).strip()

    _validate(code)
    return code


def _validate(code: str) -> None:
    """Validate that extracted code is safe and structurally correct."""

    # Check imports against allowlist
    for line in code.splitlines():
        stripped = line.strip()
        if stripped.startswith(("import ", "from ")):
            # Remove trailing comments
            import_stmt = stripped.split("#")[0].strip()
            if not ALLOWED_IMPORTS.match(import_stmt):
                raise ExtractionError(
                    f"Forbidden import: {import_stmt}. "
                    f"Only maxpylang, json, amxd, struct, and numpy imports are allowed."
                )

    # Check for dangerous runtime patterns
    for pattern in DANGEROUS_PATTERNS:
        if re.search(pattern, code):
            raise ExtractionError(
                f"Generated code contains forbidden pattern: {pattern}"
            )

    # Must import maxpylang
    if "maxpylang" not in code:
        raise ExtractionError(
            "Generated code does not import maxpylang."
        )

    # Must create a patch
    if "MaxPatch" not in code:
        raise ExtractionError(
            "Generated code does not create a MaxPatch."
        )

    # Must have M4L output
    if "plugout~" not in code and "midiout" not in code:
        raise ExtractionError(
            "Generated code has no M4L output (plugout~ or midiout)."
        )

    # Must save the file
    if ".save(" not in code and "save_amxd" not in code:
        raise ExtractionError(
            "Generated code does not save the patch."
        )
