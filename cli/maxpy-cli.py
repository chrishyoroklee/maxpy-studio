#!/usr/bin/env python3
"""
MaxPy Studio CLI — generate Max for Live plugins from the command line.

Usage:
    python maxpy-cli.py "Make a chorus effect with rate and depth"
    python maxpy-cli.py --model claude-opus-4-20250514 "Build a reverb"
    python maxpy-cli.py -o my_effect.amxd "Create a tremolo"

Environment:
    MAXPY_API_KEY   — Your Claude/OpenAI API key (or pass --key)
    MAXPY_API_BASE  — Backend URL (default: https://maxpylang-studio-api.onrender.com/api)
"""

import argparse
import base64
import json
import os
import sys

try:
    import requests
except ImportError:
    print("Install requests: pip install requests")
    sys.exit(1)

DEFAULT_API_BASE = "https://maxpylang-studio-api.onrender.com/api"
DEFAULT_MODEL = "claude-sonnet-4-20250514"


def stream_generate(prompt: str, api_key: str, model: str, api_base: str):
    """Stream SSE events from the generate endpoint."""
    resp = requests.post(
        f"{api_base}/generate",
        headers={"Content-Type": "application/json", "X-API-Key": api_key},
        json={"prompt": prompt, "model": model, "messages": []},
        stream=True,
        timeout=120,
    )
    resp.raise_for_status()

    for line in resp.iter_lines(decode_unicode=True):
        if line and line.startswith("data: "):
            try:
                yield json.loads(line[6:])
            except json.JSONDecodeError:
                pass


def main():
    parser = argparse.ArgumentParser(
        description="Generate Max for Live plugins from text descriptions."
    )
    parser.add_argument("prompt", help="Describe the plugin you want")
    parser.add_argument("--key", default=os.environ.get("MAXPY_API_KEY", ""), help="API key (or set MAXPY_API_KEY)")
    parser.add_argument("--model", default=DEFAULT_MODEL, help=f"Model (default: {DEFAULT_MODEL})")
    parser.add_argument("--api", default=os.environ.get("MAXPY_API_BASE", DEFAULT_API_BASE), help="Backend URL")
    parser.add_argument("-o", "--output", default="device.amxd", help="Output filename (default: device.amxd)")
    args = parser.parse_args()

    if not args.key:
        args.key = input("API key: ").strip()
        if not args.key:
            print("Error: API key required", file=sys.stderr)
            sys.exit(1)

    print(f"\033[90mModel: {args.model}\033[0m")
    print(f"\033[90mPrompt: {args.prompt}\033[0m")
    print()

    amxd_b64 = None
    error = None

    for event in stream_generate(args.prompt, args.key, args.model, args.api):
        t = event.get("type")

        if t == "chunk":
            sys.stdout.write(event.get("content", ""))
            sys.stdout.flush()

        elif t == "status":
            print(f"\n\033[33m{event.get('content', '')}\033[0m")

        elif t == "code_extracted":
            print(f"\n\033[90m--- code extracted ---\033[0m")

        elif t == "success":
            amxd_b64 = event.get("amxd_b64")

        elif t == "error":
            error = event.get("content")

    print()

    if error:
        print(f"\033[31mError: {error}\033[0m", file=sys.stderr)
        sys.exit(1)

    if amxd_b64:
        data = base64.b64decode(amxd_b64)
        if not args.output.endswith(".amxd"):
            args.output += ".amxd"
        with open(args.output, "wb") as f:
            f.write(data)
        print(f"\033[32mSaved: {args.output} ({len(data)} bytes)\033[0m")
    else:
        print("\033[31mNo .amxd generated\033[0m", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
