# Tasks

## Phase 1 — Standalone Electron App

### Slice 1 — Backend skeleton
- [ ] Create `backend/requirements.txt`
- [ ] Create `backend/main.py` — FastAPI app with health check
- [ ] Create `backend/db.py` — SQLite schema init
- [ ] Create `backend/models.py` — dataclasses for Song, NoteEvent, Session
- [ ] Verify `uvicorn backend.main:app` starts

### Slice 2 — Song ingestion pipeline
- [ ] `backend/ingest.py` — accept file path, run Demucs, extract vocals stem
- [ ] `backend/melody.py` — parselmouth pYIN on vocal stem → note timeline
- [ ] `POST /songs` API route stores song + note_timeline rows
- [ ] `GET /songs` returns library list
- [ ] `GET /songs/:id` returns metadata + note timeline

### Slice 3 — Real-time pitch WebSocket
- [ ] `backend/pitch.py` — sounddevice mic input → aubio YIN → pitch + cents
- [ ] `WS /pitch` streams `{note, midi, cents, confidence}` at ~20ms
- [ ] Test with a simple Python client before wiring Electron

### Slice 4 — Electron shell + Library view
- [ ] Scaffold Electron + React + Tailwind (`electron/`)
- [ ] Library view: song cards, drop zone for new songs
- [ ] Wire `GET /songs` to populate cards
- [ ] File drop → `POST /songs` → progress spinner while processing

### Slice 5 — Piano roll + Practice view
- [ ] Practice view layout: piano keyboard sidebar, scrolling canvas, transport bar
- [ ] Render reference note timeline as ghost line on canvas
- [ ] Connect WebSocket `/pitch` → draw live blue trail
- [ ] Green glow logic: ±25 cents + 300ms sustain
- [ ] Vocal range sidebar: session low/high + song range comparison (orange stretch notes)

### Slice 6 — Session saving + history
- [ ] `POST /sessions` — save accuracy, notes hit/total, range
- [ ] `GET /sessions?song_id=` — history for a song
- [ ] Library card shows last practiced + accuracy trend sparkline

## Phase 2 — Ableton VST3
- [ ] JUCE project scaffold
- [ ] Backend auto-spawn logic
- [ ] Minimal plugin UI (pitch needle + green glow)
