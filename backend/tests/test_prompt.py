"""Tests for system prompt building."""

from app.core.prompt import build_system_prompt


class TestBuildSystemPrompt:
    def test_contains_core_sections(self):
        prompt = build_system_prompt()
        assert "maxpylang" in prompt
        assert "place_raw" in prompt
        assert "plugout~" in prompt
        assert "plugin~" in prompt
        assert "live.dial" in prompt
        assert "clip~" in prompt

    def test_contains_examples(self):
        prompt = build_system_prompt()
        assert "m4l_chorus" in prompt or "chorus" in prompt.lower()
        assert "m4l_tremolo" in prompt or "tremolo" in prompt.lower()

    def test_reasonable_length(self):
        """System prompt should be < 30K chars (~7.5K tokens)."""
        prompt = build_system_prompt()
        assert len(prompt) < 30000, f"System prompt too long: {len(prompt)} chars"
        assert len(prompt) > 2000, f"System prompt too short: {len(prompt)} chars"

    def test_contains_device_types(self):
        prompt = build_system_prompt()
        assert "audio_effect" in prompt
        assert "instrument" in prompt
        assert "midi_effect" in prompt

    def test_contains_safety_rules(self):
        prompt = build_system_prompt()
        assert "clip~ -1. 1." in prompt or "clip~" in prompt
        assert "presentation" in prompt.lower()
