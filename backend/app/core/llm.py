"""LLM client — unified Claude + OpenAI via litellm."""

from collections.abc import AsyncGenerator

import litellm

from app.core.prompt import build_system_prompt


async def generate_code(
    messages: list[dict],
    api_key: str,
    model: str = "claude-sonnet-4-20250514",
) -> AsyncGenerator[str, None]:
    """Stream an LLM response for plugin generation.

    Args:
        messages: Conversation history [{"role": "user", "content": "..."}]
        api_key: User's API key (Claude or OpenAI)
        model: Model identifier (litellm format)

    Yields:
        Text chunks as they arrive from the LLM.
    """
    system_prompt = build_system_prompt()

    # litellm determines the provider from the model name
    response = await litellm.acompletion(
        model=model,
        messages=[{"role": "system", "content": system_prompt}] + messages,
        api_key=api_key,
        stream=True,
        max_tokens=8192,
        temperature=0.3,
    )

    async for chunk in response:
        content = chunk.choices[0].delta.content
        if content:
            yield content
