"""
Stem separation (Demucs) + melody extraction (librosa pYIN) pipeline.
Runs synchronously — called from a thread executor in main.py.
"""

import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import librosa
import numpy as np

from db import get_conn
from lyrics import fetch_lrc, parse_lrc

STEMS_DIR = Path(__file__).parent / "stems"
STEMS_DIR.mkdir(exist_ok=True)

MIN_NOTE_DURATION_MS = 80

# Pipeline stages and their progress range (start%, end%)
STAGE_LOADING  = (0,  10)
STAGE_DEMUCS   = (10, 75)
STAGE_PYIN     = (75, 95)
STAGE_SAVING   = (95, 100)


def _emit_pct(job_id, jobs, pct: int, label: str):
    print(f"[{pct}%] {label}")
    if job_id and jobs is not None:
        jobs[job_id]["pct"] = pct
        jobs[job_id]["label"] = label


def separate_vocals(audio_path: str, job_id=None, jobs=None) -> str:
    song_stem = Path(audio_path).stem
    _emit_pct(job_id, jobs, STAGE_DEMUCS[0], "Separating vocals…")

    proc = subprocess.Popen(
        ["python", "-m", "demucs", "--two-stems=vocals", "-o", str(STEMS_DIR), audio_path],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        bufsize=0,
    )
    buf = b""
    while True:
        chunk = proc.stdout.read(64)
        if not chunk:
            break
        buf += chunk
        # tqdm uses \r to overwrite — split on both \r and \n
        parts = re.split(rb"[\r\n]", buf)
        buf = parts[-1]
        for part in parts[:-1]:
            text = part.decode("utf-8", errors="replace").strip()
            m = re.search(r"(\d+)%", text)
            if m:
                demucs_pct = int(m.group(1))
                overall = STAGE_DEMUCS[0] + int(demucs_pct / 100 * (STAGE_DEMUCS[1] - STAGE_DEMUCS[0]))
                _emit_pct(job_id, jobs, overall, f"Separating vocals… {demucs_pct}%")
    proc.wait()
    if proc.returncode != 0:
        raise subprocess.CalledProcessError(proc.returncode, proc.args)

    matches = list(STEMS_DIR.rglob(f"{song_stem}/vocals.wav"))
    if not matches:
        raise FileNotFoundError(f"Demucs did not produce vocals.wav under {STEMS_DIR}")
    _emit_pct(job_id, jobs, STAGE_DEMUCS[1], "Vocals separated.")
    return str(matches[0])


def extract_note_timeline(vocals_path: str, job_id=None, jobs=None) -> list[dict]:
    _emit_pct(job_id, jobs, STAGE_PYIN[0], "Extracting vocal melody…")
    y, sr = librosa.load(vocals_path, sr=22050, mono=True)

    f0, voiced_flag, _ = librosa.pyin(
        y, fmin=librosa.note_to_hz("C2"), fmax=librosa.note_to_hz("C6"), sr=sr
    )
    times = librosa.times_like(f0, sr=sr)

    _emit_pct(job_id, jobs, STAGE_PYIN[1], "Melody extracted.")

    notes = []
    i = 0
    while i < len(f0):
        if not voiced_flag[i]:
            i += 1
            continue
        j = i
        while j < len(f0) and voiced_flag[j]:
            j += 1
        segment_f0 = f0[i:j]
        segment_times = times[i:j]
        voiced_hz = segment_f0[segment_f0 > 0]
        if len(voiced_hz) == 0:
            i = j
            continue
        median_hz = float(np.median(voiced_hz))
        midi = 69 + 12 * np.log2(median_hz / 440.0)
        start_ms = int(segment_times[0] * 1000)
        dur_ms = int((segment_times[-1] - segment_times[0]) * 1000)
        if dur_ms >= MIN_NOTE_DURATION_MS:
            notes.append({"time_ms": start_ms, "pitch_midi": round(float(midi), 2), "duration_ms": dur_ms})
        i = j

    return notes


def process_song(file_path: str, title: str, artist: Optional[str], job_id=None, jobs=None) -> int:
    """Full pipeline: load → separate → extract → store. Returns song id."""
    _emit_pct(job_id, jobs, STAGE_LOADING[0], "Loading audio…")
    y, sr = librosa.load(file_path, sr=None, mono=True)
    duration_ms = int(len(y) / sr * 1000)
    _emit_pct(job_id, jobs, STAGE_LOADING[1], f"Audio loaded ({duration_ms // 1000}s).")

    vocals_path = separate_vocals(file_path, job_id, jobs)
    notes = extract_note_timeline(vocals_path, job_id, jobs)

    _emit_pct(job_id, jobs, STAGE_SAVING[0], "Fetching lyrics…")
    lrc_lines = []
    lrc_raw = fetch_lrc(title, artist)
    if lrc_raw:
        lrc_lines = parse_lrc(lrc_raw)
        _emit_pct(job_id, jobs, 97, f"Lyrics found — {len(lrc_lines)} lines.")
    else:
        _emit_pct(job_id, jobs, 97, "No synced lyrics found for this song.")

    _emit_pct(job_id, jobs, 98, "Saving to library…")
    with get_conn() as conn:
        cur = conn.execute(
            """INSERT INTO songs (title, artist, file_path, stem_path, duration_ms, processed_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (title, artist, file_path, vocals_path, duration_ms, datetime.now(timezone.utc).isoformat()),
        )
        song_id = cur.lastrowid
        conn.executemany(
            "INSERT INTO note_timeline (song_id, time_ms, pitch_midi, duration_ms) VALUES (?, ?, ?, ?)",
            [(song_id, n["time_ms"], n["pitch_midi"], n["duration_ms"]) for n in notes],
        )
        if lrc_lines:
            conn.executemany(
                "INSERT INTO lyrics (song_id, time_ms, line) VALUES (?, ?, ?)",
                [(song_id, l["time_ms"], l["line"]) for l in lrc_lines],
            )
    _emit_pct(job_id, jobs, 100, f"Done! {len(notes)} notes found.")
    return song_id
