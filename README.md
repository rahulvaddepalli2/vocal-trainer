# Vocal Trainer

Real-time vocal training app. Drop a song, sing along, see your pitch on a piano roll.

## Prerequisites

- Python 3.11+
- Node.js 18+
- `ffmpeg` on PATH (required by Demucs) — install via `winget install ffmpeg`

## Setup

### 1. Backend

```bash
cd backend
pip install -r requirements.txt
```

### 2. Frontend

```bash
cd electron
npm install
```

## Running

Open **two terminals**:

**Terminal 1 — backend:**
```bash
cd backend
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

**Terminal 2 — Electron app:**
```bash
cd electron
npx vite  # starts Vite dev server on :5173
# then in a third terminal:
npx electron .
```

Or run both Vite + Electron together:
```bash
cd electron
npm run dev
```

## Usage

1. Open the app — you'll see the Library screen
2. Drag a song (MP3/WAV/FLAC) onto the drop zone
3. Wait ~60s while vocals are separated and the melody is extracted
4. Click **Practice** on any processed song
5. Click **▶ Play** — the reference melody scrolls as a ghost line
6. Sing into your mic — your pitch appears as a blue trail
7. Hold the right note for 300ms → green glow

## Vocal range sidebar

- **Song Range** — full range of the reference vocal
- **Your Range** — range you've hit in the current session
- Orange reference notes = notes above/below your current session range (stretch goals)

## Architecture

See [SPEC.md](SPEC.md) for full details.
