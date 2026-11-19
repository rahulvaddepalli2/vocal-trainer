import { useEffect, useRef, useState } from "react";
import PianoRoll from "../components/PianoRoll";
import { midiToName } from "../utils/piano";
import { usePitch, API_BASE as API } from "../hooks/usePitch";

const PITCH_TOLERANCE_CENTS = 25;

export default function PhraseSession({ phrase, onBack }) {
  const [data, setData]           = useState(null);
  const [playing, setPlaying]     = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [loopCount, setLoopCount] = useState(0);
  const { pitch: livePitch } = usePitch();
  const [audioMode, setAudioMode] = useState("backing");
  const [score, setScore]         = useState(null);
  const [viewMode, setViewMode]   = useState("tuner"); // "tuner" | "roll"
  const [volume, setVolume]       = useState(0.8);

  const audioRef    = useRef(null);
  const notesRef    = useRef([]);
  const hitMapRef   = useRef(new Map());
  const lastTickRef = useRef(null);
  const livePitchRef  = useRef(null);
  const elapsedMsRef  = useRef(0);

  useEffect(() => { livePitchRef.current = livePitch; }, [livePitch]);
  useEffect(() => { if (audioRef.current) audioRef.current.volume = volume; }, [volume]);
  useEffect(() => { elapsedMsRef.current = elapsedMs; }, [elapsedMs]);
  useEffect(() => { notesRef.current = data?.notes ?? []; }, [data]);

  useEffect(() => {
    fetch(`${API}/phrases/${phrase.id}`).then(r => r.json()).then(setData);
  }, [phrase.id]);

  // Audio setup
  useEffect(() => {
    if (!data) return;
    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audioRef.current = audio;
    const startSec = data.start_ms / 1000;
    const endSec   = data.end_ms   / 1000;

    function onTimeUpdate() {
      if (audio.currentTime >= endSec) {
        audio.currentTime = startSec;
        setLoopCount(c => c + 1);
        setElapsedMs(0);
      } else {
        setElapsedMs(Math.max(0, (audio.currentTime - startSec) * 1000));
      }
    }
    audio.addEventListener("timeupdate", onTimeUpdate);
    return () => { audio.pause(); audio.removeEventListener("timeupdate", onTimeUpdate); };
  }, [data]);

  // Audio source swap
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !data) return;
    const wasPlaying = !audio.paused;
    audio.src = audioMode === "backing"
      ? `${API}/songs/${data.song_id}/backing`
      : `${API}/songs/${data.song_id}/audio`;
    audio.load();
    audio.addEventListener("loadedmetadata", () => {
      audio.currentTime = data.start_ms / 1000;
      if (wasPlaying) audio.play().catch(() => {});
    }, { once: true });
  }, [audioMode, data]);


  // Scoring ticker
  useEffect(() => {
    if (!playing) { lastTickRef.current = null; return; }
    const interval = setInterval(() => {
      const now = performance.now();
      const dt  = lastTickRef.current ? now - lastTickRef.current : 50;
      lastTickRef.current = now;
      const pitch   = livePitchRef.current;
      const elapsed = elapsedMsRef.current;
      if (!pitch) return;
      const active = notesRef.current.find(n => elapsed >= n.time_ms && elapsed <= n.time_ms + n.duration_ms);
      if (!active) return;
      if (Math.abs(pitch.midi - active.pitch_midi) * 100 <= PITCH_TOLERANCE_CENTS) {
        hitMapRef.current.set(active.time_ms, (hitMapRef.current.get(active.time_ms) ?? 0) + dt);
      }
    }, 50);
    return () => clearInterval(interval);
  }, [playing]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio || !data) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      computeScore();
    } else {
      audio.currentTime = data.start_ms / 1000;
      audio.play().catch(() => {});
      setPlaying(true);
      hitMapRef.current = new Map();
      setScore(null);
    }
  }

  function computeScore() {
    const notes = notesRef.current;
    if (!notes.length) return;
    let hit = 0, total = 0;
    for (const n of notes) {
      hit   += Math.min(hitMapRef.current.get(n.time_ms) ?? 0, n.duration_ms);
      total += n.duration_ms;
    }
    setScore(total > 0 ? Math.round((hit / total) * 100) : 0);
  }

  const phraseDurationMs = data ? data.end_ms - data.start_ms : 0;

  // Active target note at current playback position
  const activeNote = data?.notes.find(n => elapsedMs >= n.time_ms && elapsedMs <= n.time_ms + n.duration_ms) ?? null;
  const targetMidi = activeNote?.pitch_midi ?? null;
  const cents      = livePitch && targetMidi !== null ? Math.round((livePitch.midi - targetMidi) * 100) : null;
  const onTarget   = cents !== null && Math.abs(cents) <= PITCH_TOLERANCE_CENTS;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-3 bg-neutral-900 border-b border-neutral-800 shrink-0">
        <button onClick={onBack} className="text-sm text-neutral-400 hover:text-white">← Phrases</button>
        <div>
          <span className="font-semibold">{phrase.name}</span>
          <span className="text-neutral-500 text-sm ml-2">{phrase.song_title}</span>
        </div>

        {/* Audio mode */}
        <div className="flex rounded-lg overflow-hidden border border-neutral-700 text-xs ml-2">
          {["backing", "original"].map(m => (
            <button key={m} onClick={() => setAudioMode(m)}
              className={`px-3 py-1.5 transition-colors ${audioMode === m ? "bg-indigo-600 text-white" : "bg-neutral-800 text-neutral-400 hover:text-white"}`}>
              {m === "backing" ? "Backing" : "Full song"}
            </button>
          ))}
        </div>

        {/* View toggle */}
        <div className="flex rounded-lg overflow-hidden border border-neutral-700 text-xs">
          {[["tuner", "🎯 Tuner"], ["roll", "🎹 Piano Roll"]].map(([v, label]) => (
            <button key={v} onClick={() => setViewMode(v)}
              className={`px-3 py-1.5 transition-colors ${viewMode === v ? "bg-neutral-700 text-white" : "bg-neutral-800 text-neutral-400 hover:text-white"}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-4">
          {/* Volume slider */}
          <div className="flex items-center gap-2">
            <span className="text-neutral-600 text-xs">{volume === 0 ? "🔇" : volume < 0.5 ? "🔉" : "🔊"}</span>
            <input
              type="range" min="0" max="1" step="0.01"
              value={volume}
              onChange={e => setVolume(parseFloat(e.target.value))}
              className="w-24 accent-indigo-500 cursor-pointer"
            />
          </div>
          {loopCount > 0 && <span className="text-xs text-neutral-500">Loop {loopCount}</span>}
          {score !== null && (
            <span className={`text-sm font-bold ${score >= 80 ? "text-green-400" : score >= 50 ? "text-yellow-400" : "text-red-400"}`}>
              {score}%
            </span>
          )}
          <button onClick={togglePlay} className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-sm font-medium">
            {playing ? "⏸ Pause" : "▶ Loop"}
          </button>
        </div>
      </div>

      {/* Loop progress bar */}
      <div className="h-1 bg-neutral-800 shrink-0">
        <div className="h-full bg-indigo-500 transition-all duration-100"
          style={{ width: phraseDurationMs ? `${Math.min((elapsedMs / phraseDurationMs) * 100, 100)}%` : "0%" }} />
      </div>

      {!data ? (
        <div className="flex-1 flex items-center justify-center text-neutral-600">Loading…</div>
      ) : viewMode === "roll" ? (
        <PianoRoll notes={data.notes} elapsedMs={elapsedMs} livePitch={livePitch} playing={playing} songDurationMs={phraseDurationMs} />
      ) : (
        /* ── Tuner view ── */
        <div className="flex-1 flex flex-col items-center justify-center gap-8 p-8 select-none">

          {/* Target note */}
          <div className="text-center">
            <p className="text-xs text-neutral-500 uppercase tracking-widest mb-2">Target note</p>
            <div className={`text-8xl font-bold transition-all duration-100 ${onTarget ? "text-green-400 drop-shadow-[0_0_24px_#4ade80]" : "text-white"}`}>
              {targetMidi !== null ? midiToName(Math.round(targetMidi)) : "—"}
            </div>
          </div>

          {/* Phrase progress arc */}
          <div className="relative w-32 h-32">
            <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
              <circle cx="60" cy="60" r="50" fill="none" stroke="#262626" strokeWidth="10" />
              <circle cx="60" cy="60" r="50" fill="none"
                stroke={onTarget ? "#4ade80" : "#3730a3"}
                strokeWidth="10"
                strokeDasharray={`${2 * Math.PI * 50}`}
                strokeDashoffset={`${2 * Math.PI * 50 * (1 - (phraseDurationMs ? elapsedMs / phraseDurationMs : 0))}`}
                strokeLinecap="round"
                style={{ transition: "stroke-dashoffset 0.1s linear, stroke 0.1s" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xs font-mono text-neutral-400">
                {loopCount > 0 ? `×${loopCount}` : ""}
              </span>
            </div>
          </div>

          {/* Cents meter */}
          <div className="w-72">
            <div className="flex justify-between text-xs text-neutral-600 mb-1">
              <span>-50¢</span><span>in tune</span><span>+50¢</span>
            </div>
            <div className="relative h-3 bg-neutral-800 rounded-full overflow-hidden">
              <div className="absolute inset-y-0 left-1/2 w-px bg-neutral-600" />
              <div className="absolute inset-y-0 bg-green-900/40 rounded-full"
                style={{ left: "calc(50% - 25%)", width: "50%" }} />
              {livePitch && (
                <div
                  className={`absolute inset-y-0 w-3 rounded-full transition-all duration-75 ${onTarget ? "bg-green-400" : "bg-blue-400"}`}
                  style={{ left: `${Math.max(0, Math.min(100, 50 + (cents ?? 0)))}%`, transform: "translateX(-50%)" }}
                />
              )}
            </div>
            <div className="mt-2 text-center">
              {livePitch ? (
                <span className={`text-sm font-mono font-semibold ${onTarget ? "text-green-400" : "text-blue-400"}`}>
                  {livePitch.note}{cents !== null ? ` ${cents > 0 ? "+" : ""}${cents}¢` : ""}
                </span>
              ) : (
                <span className="text-sm text-neutral-600">Sing to detect pitch</span>
              )}
            </div>
          </div>

          {/* Next note preview */}
          {data.notes.length > 0 && (() => {
            const nextNote = data.notes.find(n => n.time_ms > elapsedMs);
            return nextNote ? (
              <p className="text-xs text-neutral-600">
                Next: <span className="text-neutral-400">{midiToName(Math.round(nextNote.pitch_midi))}</span>
              </p>
            ) : null;
          })()}
        </div>
      )}
    </div>
  );
}
