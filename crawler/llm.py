"""Language model calls for the crawler: DeepSeek V3 on Featherless (fast, no reasoning) when a key is in .env,
the local Ollama model otherwise and whenever the hosted call fails. Used for reading text only."""

import json
import re
import urllib.request

import ytapi

FEATHERLESS = "https://api.featherless.ai/v1/chat/completions"
FAST = "deepseek-ai/DeepSeek-V3-0324"
OLLAMA = "http://localhost:11434/api/chat"
LOCAL = "qwen3:8b"


def _key() -> str | None:
    env = ytapi.ROOT / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            if line.startswith("FEATHERLESS_API_KEY="):
                return line.split("=", 1)[1].strip() or None
    return None


def _json(text: str) -> dict:
    text = re.sub(r"<think>[\s\S]*?</think>", "", text).strip()
    a, b = text.find("{"), text.rfind("}")
    return json.loads(text[a:b + 1] if a >= 0 and b > a else text)


def ask_json(prompt: str, schema: dict, timeout: float = 90) -> dict:
    """One prompt, one JSON object back matching `schema`."""
    key = _key()
    if key:
        body = json.dumps({
            "model": FAST, "temperature": 0, "max_tokens": 800,
            "messages": [{"role": "user", "content": prompt},
                         {"role": "system", "content": f"Reply with one JSON object only, matching this JSON schema:\n{json.dumps(schema)}"}],
        }).encode()
        # Featherless sits behind Cloudflare, which rejects clients without a recognisable user agent.
        req = urllib.request.Request(FEATHERLESS, data=body, headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json", "User-Agent": "prenew-scout/1.0"})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return _json(json.loads(r.read())["choices"][0]["message"]["content"] or "{}")
        except Exception:  # noqa: BLE001
            pass
    body = json.dumps({"model": LOCAL, "stream": False, "think": False, "format": schema,
                       "options": {"temperature": 0}, "messages": [{"role": "user", "content": prompt}]}).encode()
    with urllib.request.urlopen(urllib.request.Request(OLLAMA, data=body, headers={"content-type": "application/json"}), timeout=timeout) as r:
        return _json(json.loads(r.read())["message"]["content"])
