"""Extract and validate Python code from LLM responses."""

import re

# Imports and patterns that should never appear in generated code
DANGEROUS_PATTERNS = [
    r"\bos\.system\b",
    r"\bos\.popen\b",
    r"\bos\.exec",
    r"\bos\.spawn",
    r"\bos\.remove\b",
    r"\bos\.unlink\b",
    r"\bos\.rmdir\b",
    r"\bsubprocess\b",
    r"\bshutil\b",
    r"\b__import__\b",
    r"\beval\s*\(",
    r"\bexec\s*\(",
    r"\bcompile\s*\(",
    r"\bgetattr\s*\(",
    r"\bimport\s+os\b",
    r"\bfrom\s+os\b",
    r"\bimport\s+sys\b",
    r"\bimport\s+socket\b",
    r"\bimport\s+http\b",
    r"\bimport\s+urllib\b",
    r"\bimport\s+requests\b",
    r"\bimport\s+pathlib\b",
    r"\bimport\s+glob\b",
    r"\bimport\s+shlex\b",
    r"\bimport\s+ctypes\b",
    r"\bimport\s+pickle\b",
    r"\bopen\s*\([^)]*['\"]/(etc|proc|sys|dev)",  # block filesystem traversal
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

    # Check for dangerous patterns
    for pattern in DANGEROUS_PATTERNS:
        if re.search(pattern, code):
            raise ExtractionError(
                f"Generated code contains forbidden pattern: {pattern}"
            )

    # Must import maxpylang
    if "maxpylang" not in code and "import mp" not in code:
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
