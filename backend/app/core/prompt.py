"""System prompt builder — loads and assembles the LLM system prompt."""

from pathlib import Path

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"


def build_system_prompt() -> str:
    """Build the full system prompt from template + examples."""
    system = (PROMPTS_DIR / "system_prompt.md").read_text()

    # Append example scripts as few-shot demonstrations
    examples_dir = PROMPTS_DIR / "examples"
    for example_file in sorted(examples_dir.glob("*.py")):
        system += f"\n\n## Complete Example: {example_file.stem}\n"
        system += f"```python\n{example_file.read_text()}```\n"

    return system
