"""Fetch and parse timed lyrics from LRClib (free, no auth)."""

import re
import urllib.parse
import urllib.request
import json
from typing import Optional


def fetch_lrc(title: str, artist: Optional[str]) -> Optional[str]:
    """Return raw LRC string or None if not found."""
    params = {"track_name": title}
    if artist:
        params["artist_name"] = artist

    url = "https://lrclib.net/api/get?" + urllib.parse.urlencode(params)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "VocalTrainer/1.0"})
        with urllib.request.urlopen(req, timeout=8) as resp:
            if resp.status != 200:
                return None
            data = json.loads(resp.read())
            return data.get("syncedLyrics") or None
    except Exception:
        return None


def parse_lrc(lrc: str) -> list[dict]:
    """Parse LRC into [{time_ms, line}], sorted by time."""
    pattern = re.compile(r"\[(\d+):(\d+)\.(\d+)\](.*)")
    lines = []
    for raw in lrc.splitlines():
        m = pattern.match(raw.strip())
        if not m:
            continue
        mins, secs, centis, text = m.groups()
        time_ms = int(mins) * 60_000 + int(secs) * 1000 + int(centis) * 10
        text = text.strip()
        if text:
            lines.append({"time_ms": time_ms, "line": text})
    return sorted(lines, key=lambda x: x["time_ms"])
