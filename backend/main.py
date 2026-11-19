import asyncio
import json
import shutil
import ssl
import traceback
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import sounddevice as sd
import librosa
import numpy as np
from fastapi import FastAPI, File, Form, UploadFile, WebSocket, WebSocketDisconnect, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse, FileResponse

from db import get_conn, init_db
from ingest import process_song

UPLOADS_DIR = Path(__file__).parent / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)

PIANO_DIR = Path(__file__).parent / "piano_samples"
PIANO_DIR.mkdir(exist_ok=True)
SALAMANDER_BASE = "https://tonejs.github.io/audio/salamander/"

app = FastAPI(title="Vocal Trainer")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "*",
    "Access-Control-Allow-Headers": "*",
}

# job_id → {"status": "running"|"done"|"error", "steps": [...], "song_id": int|None, "error": str|None}
jobs: dict[str, dict] = {}


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    tb = traceback.format_exc()
    print(tb)
    return JSONResponse(status_code=500, content={"detail": tb}, headers=CORS_HEADERS)

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail}, headers=CORS_HEADERS)


@app.on_event("startup")
def startup():
    init_db()


@app.get("/health")
def health():
    return {"status": "ok"}


_ssl_ctx = ssl.create_default_context()
_ssl_ctx.check_hostname = False
_ssl_ctx.verify_mode = ssl.CERT_NONE

@app.get("/piano/{note}")
def piano_sample(note: str):
    """Serve Salamander Grand Piano samples, downloading and caching on first request."""
    safe = note.replace("/", "").replace("..", "")
    local = PIANO_DIR / f"{safe}.mp3"
    if not local.exists():
        url = f"{SALAMANDER_BASE}{safe}"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, context=_ssl_ctx) as r, open(local, "wb") as f:
                f.write(r.read())
        except Exception as e:
            print(f"[piano] failed to download {url}: {e}")
            raise HTTPException(404, f"Sample {safe} not found")
    return FileResponse(str(local), media_type="audio/mpeg", headers=CORS_HEADERS)


# ── Songs ──────────────────────────────────────────────────────────────────────

@app.post("/songs")
async def add_song(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    artist: Optional[str] = Form(None),
):
    ext = Path(file.filename).suffix
    dest = UPLOADS_DIR / f"{uuid.uuid4()}{ext}"
    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    job_id = str(uuid.uuid4())
    song_title = title or Path(file.filename).stem
    jobs[job_id] = {"status": "running", "pct": 0, "label": "Starting…", "song_id": None, "error": None}

    async def run():
        loop = asyncio.get_event_loop()
        try:
            song_id = await loop.run_in_executor(
                None, process_song, str(dest), song_title, artist, job_id, jobs
            )
            jobs[job_id]["song_id"] = song_id
            jobs[job_id]["status"] = "done"
        except Exception:
            jobs[job_id]["error"] = traceback.format_exc()
            jobs[job_id]["status"] = "error"

    asyncio.create_task(run())
    return {"job_id": job_id}
    return {"id": song_id}


@app.get("/jobs/{job_id}/progress")
async def job_progress(job_id: str):
    if job_id not in jobs:
        raise HTTPException(404, "Job not found")

    async def event_stream():
        last_pct = -1
        while True:
            job = jobs.get(job_id, {})
            pct = job.get("pct", 0)
            label = job.get("label", "")
            if pct != last_pct:
                yield f"data: {json.dumps({'type': 'progress', 'pct': pct, 'label': label})}\n\n"
                last_pct = pct
            if job.get("status") == "done":
                yield f"data: {json.dumps({'type': 'done', 'song_id': job['song_id']})}\n\n"
                break
            if job.get("status") == "error":
                yield f"data: {json.dumps({'type': 'error', 'message': job['error']})}\n\n"
                break
            await asyncio.sleep(0.25)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={**CORS_HEADERS, "Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/songs")
def list_songs():
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, title, artist, duration_ms, processed_at FROM songs ORDER BY id DESC"
        ).fetchall()
    return [dict(r) for r in rows]


@app.get("/songs/{song_id}")
def get_song(song_id: int):
    with get_conn() as conn:
        song = conn.execute("SELECT * FROM songs WHERE id = ?", (song_id,)).fetchone()
        if not song:
            raise HTTPException(404, "Song not found")
        notes = conn.execute(
            "SELECT time_ms, pitch_midi, duration_ms FROM note_timeline WHERE song_id = ? ORDER BY time_ms",
            (song_id,),
        ).fetchall()
    return {**dict(song), "notes": [dict(n) for n in notes]}


@app.delete("/songs/{song_id}")
def delete_song(song_id: int):
    with get_conn() as conn:
        conn.execute("DELETE FROM songs WHERE id = ?", (song_id,))
    return {"ok": True}


@app.get("/songs/{song_id}/lyrics")
def song_lyrics(song_id: int):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT time_ms, line FROM lyrics WHERE song_id = ? ORDER BY time_ms",
            (song_id,),
        ).fetchall()
    return [dict(r) for r in rows]


@app.get("/songs/{song_id}/audio")
def song_audio(song_id: int):
    with get_conn() as conn:
        row = conn.execute("SELECT file_path FROM songs WHERE id = ?", (song_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Song not found")
    return FileResponse(row["file_path"], media_type="audio/mpeg", headers=CORS_HEADERS)


@app.get("/songs/{song_id}/backing")
def song_backing(song_id: int):
    """Serve the no-vocals stem (backing track) produced by Demucs."""
    with get_conn() as conn:
        row = conn.execute("SELECT stem_path FROM songs WHERE id = ?", (song_id,)).fetchone()
    if not row or not row["stem_path"]:
        raise HTTPException(404, "Stem not found")
    vocals_path = Path(row["stem_path"])
    backing_path = vocals_path.parent / "no_vocals.wav"
    if not backing_path.exists():
        raise HTTPException(404, "Backing track not found — re-process the song")
    return FileResponse(str(backing_path), media_type="audio/wav", headers=CORS_HEADERS)


# ── Phrases ────────────────────────────────────────────────────────────────────

@app.post("/phrases")
def save_phrase(body: dict):
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO phrases (song_id, name, start_ms, end_ms) VALUES (?, ?, ?, ?)",
            (body["song_id"], body["name"], body["start_ms"], body["end_ms"]),
        )
    return {"id": cur.lastrowid}


@app.get("/phrases")
def list_phrases():
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT p.id, p.song_id, p.name, p.start_ms, p.end_ms,
                   s.title AS song_title, s.artist AS song_artist
            FROM phrases p
            JOIN songs s ON s.id = p.song_id
            ORDER BY p.song_id, p.id
        """).fetchall()
    return [dict(r) for r in rows]


@app.get("/phrases/{phrase_id}")
def get_phrase(phrase_id: int):
    with get_conn() as conn:
        phrase = conn.execute("""
            SELECT p.*, s.title AS song_title, s.artist AS song_artist,
                   s.file_path, s.stem_path
            FROM phrases p JOIN songs s ON s.id = p.song_id
            WHERE p.id = ?
        """, (phrase_id,)).fetchone()
        if not phrase:
            raise HTTPException(404, "Phrase not found")
        notes = conn.execute("""
            SELECT time_ms, pitch_midi, duration_ms
            FROM note_timeline
            WHERE song_id = ? AND time_ms >= ? AND time_ms <= ?
            ORDER BY time_ms
        """, (phrase["song_id"], phrase["start_ms"], phrase["end_ms"])).fetchall()
    p = dict(phrase)
    offset = p["start_ms"]
    p["notes"] = [{"time_ms": n["time_ms"] - offset, "pitch_midi": n["pitch_midi"], "duration_ms": n["duration_ms"]} for n in notes]
    return p


@app.delete("/phrases/{phrase_id}")
def delete_phrase(phrase_id: int):
    with get_conn() as conn:
        conn.execute("DELETE FROM phrases WHERE id = ?", (phrase_id,))
    return {"ok": True}


# ── Sessions ───────────────────────────────────────────────────────────────────

@app.post("/sessions")
def save_session(body: dict):
    with get_conn() as conn:
        cur = conn.execute(
            """INSERT INTO sessions (song_id, practiced_at, accuracy_pct, notes_hit, notes_total, range_low_midi, range_high_midi)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                body["song_id"],
                datetime.now(timezone.utc).isoformat(),
                body.get("accuracy_pct"),
                body.get("notes_hit"),
                body.get("notes_total"),
                body.get("range_low_midi"),
                body.get("range_high_midi"),
            ),
        )
    return {"id": cur.lastrowid}


@app.get("/sessions")
def list_sessions(song_id: int):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM sessions WHERE song_id = ? ORDER BY practiced_at DESC",
            (song_id,),
        ).fetchall()
    return [dict(r) for r in rows]


# ── Real-time pitch WebSocket ──────────────────────────────────────────────────

SAMPLE_RATE = 22050
HOP_SIZE = 2048  # ~93ms per frame
RMS_SILENCE_THRESHOLD = 0.01  # below this = not singing
PITCH_HISTORY = 5             # frames to median-smooth over


def midi_to_note(midi: float) -> str:
    names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    semitone = round(midi)
    return f"{names[semitone % 12]}{semitone // 12 - 1}"


def hz_to_midi(hz: float) -> float:
    return 69 + 12 * np.log2(hz / 440.0)


@app.websocket("/pitch")
async def pitch_ws(websocket: WebSocket):
    await websocket.accept()

    loop = asyncio.get_event_loop()
    queue: asyncio.Queue = asyncio.Queue()

    def audio_callback(indata, frames, time, status):
        samples = indata[:, 0].astype(np.float32)
        loop.call_soon_threadsafe(queue.put_nowait, samples.copy())

    async def process_frames():
        buffer = np.zeros(0, dtype=np.float32)
        recent_midi: list[float] = []  # sliding window for smoothing

        while True:
            chunk = await queue.get()
            buffer = np.concatenate([buffer, chunk])
            if len(buffer) < HOP_SIZE:
                continue
            frame = buffer[:HOP_SIZE]
            buffer = buffer[HOP_SIZE:]

            # Gate 1: RMS silence — don't even run pitch detection on quiet frames
            rms = float(np.sqrt(np.mean(frame ** 2)))
            if rms < RMS_SILENCE_THRESHOLD:
                recent_midi.clear()
                await websocket.send_text(json.dumps({"silence": True, "rms": round(rms, 4)}))
                continue

            freq = librosa.yin(
                frame,
                fmin=librosa.note_to_hz("C2"),
                fmax=librosa.note_to_hz("C6"),
                sr=SAMPLE_RATE,
                frame_length=HOP_SIZE,
                trough_threshold=0.15,  # stricter voiced/unvoiced — higher = more selective
            )
            freq = float(freq[0]) if hasattr(freq, "__len__") else float(freq)

            # Gate 2: out-of-range result means yin found no clear pitch
            fmin = librosa.note_to_hz("C2")
            fmax = librosa.note_to_hz("C6")
            if freq <= fmin or freq >= fmax:
                recent_midi.clear()
                await websocket.send_text(json.dumps({"silence": True}))
                continue

            # Smooth: median over recent frames to kill jitter
            raw_midi = hz_to_midi(freq)
            recent_midi.append(raw_midi)
            if len(recent_midi) > PITCH_HISTORY:
                recent_midi.pop(0)
            midi = float(np.median(recent_midi))

            nearest = round(midi)
            cents = (midi - nearest) * 100
            await websocket.send_text(json.dumps({
                "note": midi_to_note(midi),
                "midi": round(midi, 2),
                "cents": round(cents, 1),
                "rms": round(rms, 4),
            }))

    try:
        with sd.InputStream(
            samplerate=SAMPLE_RATE,
            blocksize=HOP_SIZE,
            channels=1,
            dtype="float32",
            callback=audio_callback,
        ):
            await process_frames()
    except WebSocketDisconnect:
        pass
