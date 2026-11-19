# Vocal Trainer — Product Spec v1

## Goal

A desktop app (Electron + Python backend) that lets a singer drop in a song, see the vocal melody on a piano roll, sing along in real time, and receive visual feedback on pitch accuracy and note sustain. A song library tracks practice history. A future Ableton VST3 plugin connects to the same backend.

## User flow

1. Open the app
2. Drop a song file (MP3/WAV/FLAC) into the library
3. App separates the vocal stem (Demucs, CPU, ~60s) and extracts the note timeline (librosa)
4. User selects a song from their library and clicks Practice
5. Piano roll loads — reference vocal line scrolls as a ghost (white/grey)
6. User sings into their mic — live pitch trails behind the reference in a distinct color (blue)
7. When pitch matches reference within ±25 cents AND is held for ≥300ms, the live note glows green
8. After the session, a summary is saved (accuracy %, notes hit, range covered)
9. Library view shows per-song practice history over time

## Non-goals (v1)

- No lyrics display
- No MIDI export
- No cloud sync
- No mobile
- No real-time stem separation (always pre-processed on drop)
- No multi-user / login
- No metronome / tempo guidance
- Ableton VST3 is phase 2, not v1

## Architecture

### Backend (Python + FastAPI)
- `POST /songs` — accept audio file, run Demucs stem sep, extract melody, store in SQLite
- `GET /songs` — list library
- `GET /songs/:id` — song metadata + note timeline
- `DELETE /songs/:id` — remove from library
- `POST /sessions` — save practice session result
- `GET /sessions?song_id=` — practice history for a song
- `WS /pitch` — stream real-time mic pitch (note + cents) at ~20ms intervals

### Frontend (Electron + React)
- **Library view** — song cards with waveform thumbnail, last practiced, accuracy trend
- **Practice view** — piano roll canvas, transport controls (play/pause/restart), mic level indicator
- **Piano roll** — Canvas2D, time on X (scrolling), MIDI pitch on Y (C2–C6), reference ghost line, live blue trail, green glow on hit

### Database (SQLite)
```
songs: id, title, artist, file_path, stem_path, duration, processed_at
note_timeline: id, song_id, time_ms, pitch_midi, duration_ms
sessions: id, song_id, practiced_at, accuracy_pct, notes_hit, notes_total, range_low, range_high
```

## Pitch detection

- Library: `aubio` (YIN algorithm)
- Latency target: < 20ms
- Confidence threshold: 0.8 (below = silence / noise, skip)
- Accuracy window: ±25 cents = hit

## Sustain rule

- Note must be held within ±25 cents of target for ≥300ms continuously
- Green glow activates on sustain achieved, fades 500ms after leaving the note

## Vocal range

- Displayed as a sidebar label: "Your range this session: E2–A4"
- Compared against song range: highlights notes above/below current range in the reference line (orange = stretch goal)

## Tech stack

| Layer | Choice |
|---|---|
| Backend language | Python 3.11+ |
| API framework | FastAPI + uvicorn |
| Stem separation | demucs (htdemucs model, CPU) |
| Melody extraction | librosa + parselmouth (pYIN) |
| Pitch detection | aubio (YIN, real-time) |
| Audio I/O | sounddevice |
| Database | SQLite (stdlib sqlite3) |
| Frontend shell | Electron 28 |
| Frontend UI | React 18 + Tailwind |
| Piano roll | Canvas2D |
| Real-time bridge | WebSocket (websockets lib) |

## Phase 2 — Ableton VST3

- JUCE C++ plugin shell
- On load, checks if Python backend is running on localhost:8765; if not, spawns it
- Plugin UI: minimal — just pitch needle + green glow + "open full app" button
- All heavy logic stays in Python backend
