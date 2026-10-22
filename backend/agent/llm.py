"""Power layer: NVIDIA Nemotron via Meterless (Option A) or NVIDIA free API (Option B).
OpenAI-compatible client; all three settings from ONE route, read from .env."""
import json
import os

from openai import OpenAI

_client = OpenAI(
    base_url=os.environ["MODEL_BASE_URL"],
    api_key=os.environ["MODEL_API_KEY"],
)
MODEL = os.environ["NEMOTRON_MODEL"]


def chat(system: str, user: str, tools: list | None = None) -> str:
    """One Nemotron call. If tools are supplied, runs the tool-call loop once and returns
    the assistant's final text. The agent loop in agent.py decides when to stop."""
    messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    reply = _client.chat.completions.create(model=MODEL, messages=messages, tools=tools)
    msg = reply.choices[0].message
    if msg.tool_calls:
        return json.dumps([{"name": tc.function.name, "args": tc.function.arguments}
                           for tc in msg.tool_calls])
    return msg.content or ""
