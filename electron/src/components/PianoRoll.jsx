import { useEffect, useRef, useState } from "react";
import { playNote, stopNote } from "../utils/piano";

const MIDI_MIN = 36; // C2
const MIDI_MAX = 84; // C6
const PITCH_RANGE = MIDI_MAX - MIDI_MIN;
const ROW_H = 14;
const CANVAS_H = PITCH_RANGE * ROW_H;
const PX_PER_MS = 0.18;
const VIEWPORT_MS = 8000;
const LEAD_MS = 2000; // how far ahead the reference is shown

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// sustain tracking outside render
const sustainState = { midi: null, startMs: null };


function yToMidi(y) {
  return MIDI_MAX - Math.floor(y / ROW_H);
}

export default function PianoRoll({ notes, elapsedMs, livePitch, playing, songDurationMs }) {
  const canvasRef      = useRef(null);
  const keyboardRef    = useRef(null);
  const liveHistoryRef = useRef([]);
  const glowRef        = useRef({ active: false, startMs: null });
  const [clickedMidi, setClickedMidi]   = useState(null);
  const activeNoteRef = useRef(null); // current playing piano note handle

  useEffect(() => {
    if (keyboardRef.current) drawKeyboard(keyboardRef.current, clickedMidi?.midi ?? null);
  }, [clickedMidi]);

  // Release note if mouse is released anywhere outside the element
  useEffect(() => {
    function onGlobalMouseUp() {
      if (activeNoteRef.current) {
        stopNote(activeNoteRef.current);
        activeNoteRef.current = null;
      }
      setClickedMidi(null);
    }
    window.addEventListener("mouseup", onGlobalMouseUp);
    return () => window.removeEventListener("mouseup", onGlobalMouseUp);
  }, []);

  useEffect(() => {
    if (!livePitch || livePitch.silence) return;
    liveHistoryRef.current.push({ ms: elapsedMs, midi: livePitch.midi, cents: livePitch.cents });
    // keep last 30s
    const cutoff = elapsedMs - 30000;
    liveHistoryRef.current = liveHistoryRef.current.filter((p) => p.ms > cutoff);
  }, [livePitch, elapsedMs]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    // Background rows — subtle alternating
    for (let midi = MIDI_MIN; midi <= MIDI_MAX; midi++) {
      const y = midiToY(midi, H);
      const isBlack = [1, 3, 6, 8, 10].includes(midi % 12);
      ctx.fillStyle = isBlack ? "#111" : "#151515";
      ctx.fillRect(0, y, W, ROW_H);
    }

    // Grid lines at C notes
    ctx.strokeStyle = "#222";
    ctx.lineWidth = 1;
    for (let midi = MIDI_MIN; midi <= MIDI_MAX; midi++) {
      if (midi % 12 === 0) {
        const y = midiToY(midi, H);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
    }

    // Playhead X position (fixed at 30% from left)
    const playheadX = W * 0.3;

    // Reference notes — ghost white/grey
    const viewStart = elapsedMs - LEAD_MS;
    for (const note of notes) {
      const noteStart = note.time_ms;
      const noteEnd = note.time_ms + note.duration_ms;
      const x1 = playheadX + (noteStart - elapsedMs) * PX_PER_MS;
      const x2 = playheadX + (noteEnd - elapsedMs) * PX_PER_MS;
      if (x2 < 0 || x1 > W) continue;

      const y = midiToY(note.pitch_midi, H);
      const isStretch = livePitch && (note.pitch_midi > livePitch.midi + 4 || note.pitch_midi < livePitch.midi - 4);
      ctx.fillStyle = isStretch ? "rgba(251,146,60,0.55)" : "rgba(200,200,200,0.35)";
      roundRect(ctx, Math.max(0, x1), y + 2, Math.min(W, x2) - Math.max(0, x1), ROW_H - 4, 3);
    }

    // Live pitch history — blue trail, segmented (break on silence gaps > 150ms)
    const GAP_MS = 150;
    const history = liveHistoryRef.current;
    if (history.length > 1) {
      ctx.strokeStyle = "#6366f1";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      let segmentStart = true;
      ctx.beginPath();
      for (let i = 0; i < history.length; i++) {
        const p = history[i];
        const prev = history[i - 1];
        const gap = i > 0 && (p.ms - prev.ms) > GAP_MS;
        const x = playheadX + (p.ms - elapsedMs) * PX_PER_MS;
        const y = midiToY(p.midi, H) + ROW_H / 2;
        if (segmentStart || gap) {
          ctx.moveTo(x, y);
          segmentStart = false;
        } else {
          ctx.lineTo(x, y);
        }
        if (gap) ctx.moveTo(x, y);
      }
      ctx.stroke();
    }

    // Playhead line
    ctx.strokeStyle = "#ffffff22";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, H);
    ctx.stroke();

    // Green glow dot at current pitch
    if (livePitch) {
      // check sustain: find reference note at current time
      const currentRef = notes.find(
        (n) => elapsedMs >= n.time_ms && elapsedMs <= n.time_ms + n.duration_ms
      );
      const hit = currentRef && Math.abs(livePitch.midi - currentRef.pitch_midi) <= 0.5; // 50 cents

      if (hit) {
        if (!sustainState.midi || Math.abs(sustainState.midi - livePitch.midi) > 0.5) {
          sustainState.midi = livePitch.midi;
          sustainState.startMs = elapsedMs;
        }
        const sustained = elapsedMs - sustainState.startMs >= 300;
        if (sustained && !glowRef.current.active) {
          glowRef.current = { active: true, startMs: elapsedMs };
        }
      } else {
        sustainState.midi = null;
        sustainState.startMs = null;
      }

      const glowing = glowRef.current.active && elapsedMs - glowRef.current.startMs < 500;
      if (!hit && glowRef.current.active && elapsedMs - glowRef.current.startMs >= 500) {
        glowRef.current.active = false;
      }

      const dotY = midiToY(livePitch.midi, H) + ROW_H / 2;

      if (glowing) {
        ctx.shadowColor = "#4ade80";
        ctx.shadowBlur = 20;
        ctx.fillStyle = "#4ade80";
      } else {
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#6366f1";
      }
      ctx.beginPath();
      ctx.arc(playheadX, dotY, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  });

  function handleMouseDown(e) {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const y    = e.clientY - rect.top;
    const midi = Math.max(MIDI_MIN, Math.min(MIDI_MAX, yToMidi(y)));
    const name = NOTE_NAMES[midi % 12] + (Math.floor(midi / 12) - 1);

    if (activeNoteRef.current) stopNote(activeNoteRef.current);
    activeNoteRef.current = playNote(midi);
    setClickedMidi({ midi, label: name });
  }

  return (
    <div className="flex flex-1 overflow-hidden relative">
      {/* Piano keyboard sidebar */}
      <div
        className="w-12 shrink-0 relative cursor-pointer select-none"
        style={{ height: CANVAS_H }}
        onMouseDown={handleMouseDown}
      >
        <canvas
          width={48}
          height={CANVAS_H}
          ref={(c) => { keyboardRef.current = c; if (c) drawKeyboard(c, null); }}
        />
      </div>

      {/* Main roll — also clickable to audition pitch rows */}
      <div className="flex-1 overflow-hidden relative" onMouseDown={handleMouseDown}>
        <canvas
          ref={canvasRef}
          height={CANVAS_H}
          style={{ width: "100%", height: CANVAS_H, display: "block", cursor: "pointer" }}
          width={1100}
        />
      </div>

      {/* Floating note label on click */}
      {clickedMidi && (
        <div
          className="absolute left-14 pointer-events-none z-20 px-2 py-0.5 rounded bg-white text-black text-xs font-bold shadow"
          style={{ top: (MIDI_MAX - clickedMidi.midi) * ROW_H + 1 }}
        >
          {clickedMidi.label}
        </div>
      )}
    </div>
  );
}

function midiToY(midi, canvasH) {
  const row = MIDI_MAX - Math.round(midi);
  return row * ROW_H;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

function drawKeyboard(canvas, activeMidi = null) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let midi = MIDI_MIN; midi <= MIDI_MAX; midi++) {
    const y = (MIDI_MAX - midi) * ROW_H;
    const isBlack = [1, 3, 6, 8, 10].includes(midi % 12);
    const isActive = midi === activeMidi;
    ctx.fillStyle = isActive ? "#818cf8" : isBlack ? "#222" : "#ddd";
    ctx.fillRect(0, y, 44, ROW_H - 1);
    const isC = midi % 12 === 0;
    if (isC || isActive) {
      ctx.fillStyle = isActive ? "#fff" : "#666";
      ctx.font = `${isActive ? "bold " : ""}8px system-ui`;
      const label = isActive
        ? NOTE_NAMES[midi % 12] + (Math.floor(midi / 12) - 1)
        : `C${Math.floor(midi / 12) - 1}`;
      ctx.fillText(label, 2, y + ROW_H - 3);
    }
  }
}
