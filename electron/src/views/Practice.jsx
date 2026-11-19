import { useEffect, useRef, useState, useCallback } from "react";
import PianoRoll from "../components/PianoRoll";
import { usePitch, API_BASE as API } from "../hooks/usePitch";
import WarmupSession from "./WarmupSession";

const PITCH_TOLERANCE_CENTS = 25;

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
function midiToNote(midi) {
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

export default function Practice({ song, onBack }) {
  const [notes, setNotes]               = useState([]);
  const [lyrics, setLyrics]             = useState([]);
  const [playing, setPlaying]           = useState(false);
  const [elapsedMs, setElapsedMs]       = useState(0);
  const { pitch: livePitch } = usePitch();
  const [sessionRange, setSessionRange] = useState({ low: Infinity, high: -Infinity });
  const [audioMode, setAudioMode]       = useState("backing");
  const [audioError, setAudioError]     = useState(null);
  const [results, setResults]           = useState(null);
  const [bestScore, setBestScore]       = useState(null);
  const [volume, setVolume]             = useState(0.8);
  const [markStart, setMarkStart]       = useState(null);
  const [pendingPhrase, setPendingPhrase] = useState(null); // {start_ms, end_ms}
  const [phraseName, setPhraseName]     = useState("");
  const [drillMode, setDrillMode]       = useState(false);

  const audioRef      = useRef(null);
  const notesRef      = useRef([]);        // always-current notes for scoring
  const hitMapRef     = useRef(new Map()); // time_ms → ms_hit
  const lastTickRef   = useRef(null);      // timestamp of last scoring tick
  const sessionRangeRef = useRef({ low: Infinity, high: -Infinity });
  const livePitchRef  = useRef(null);

  // Keep refs in sync
  useEffect(() => { notesRef.current = notes; }, [notes]);
  useEffect(() => { livePitchRef.current = livePitch; }, [livePitch]);
  useEffect(() => {
    if (!livePitch) return;
    const r = sessionRangeRef.current;
    const updated = { low: Math.min(r.low, livePitch.midi), high: Math.max(r.high, livePitch.midi) };
    sessionRangeRef.current = updated;
    setSessionRange(updated);
  }, [livePitch]);

  // Load notes + lyrics + best score
  useEffect(() => {
    fetch(`${API}/songs/${song.id}`)
      .then(r => r.json())
      .then(d => setNotes(d.notes || []));
    fetch(`${API}/songs/${song.id}/lyrics`)
      .then(r => r.json())
      .then(setLyrics)
      .catch(() => {});
    fetch(`${API}/sessions?song_id=${song.id}`)
      .then(r => r.json())
      .then(sessions => {
        if (sessions.length) {
          const best = Math.max(...sessions.map(s => s.accuracy_pct ?? 0));
          setBestScore(best);
        }
      })
      .catch(() => {});
  }, [song.id]);

  // Audio element setup
  useEffect(() => {
    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.volume = volume;
    audioRef.current = audio;

    audio.addEventListener("timeupdate", () => setElapsedMs(audio.currentTime * 1000));
    audio.addEventListener("ended", () => {
      setPlaying(false);
      finishSession();
    });
    return () => { audio.pause(); };
  }, []);

  // Audio source
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const wasPlaying = !audio.paused;
    const time = audio.currentTime;
    setAudioError(null);
    audio.src = audioMode === "backing"
      ? `${API}/songs/${song.id}/backing`
      : `${API}/songs/${song.id}/audio`;
    audio.onerror = () => setAudioError(
      audioMode === "backing" ? "Backing track not available — switch to Original." : "Could not load audio."
    );
    audio.load();
    audio.currentTime = time;
    if (wasPlaying) audio.play().catch(() => {});
  }, [audioMode, song.id]);


  // Scoring ticker — runs every 50ms while playing
  useEffect(() => {
    if (!playing) { lastTickRef.current = null; return; }
    const interval = setInterval(() => {
      const now = performance.now();
      const dt = lastTickRef.current ? now - lastTickRef.current : 50;
      lastTickRef.current = now;

      const elapsed = audioRef.current?.currentTime * 1000 ?? 0;
      const pitch = livePitchRef.current;
      if (!pitch) return;

      const activeNote = notesRef.current.find(
        n => elapsed >= n.time_ms && elapsed <= n.time_ms + n.duration_ms
      );
      if (!activeNote) return;

      const diffCents = Math.abs(pitch.midi - activeNote.pitch_midi) * 100;
      if (diffCents <= PITCH_TOLERANCE_CENTS) {
        const prev = hitMapRef.current.get(activeNote.time_ms) ?? 0;
        hitMapRef.current.set(activeNote.time_ms, prev + dt);
      }
    }, 50);
    return () => clearInterval(interval);
  }, [playing]);

  function calculateScore(notesList) {
    if (!notesList.length) return 0;
    let totalWeight = 0, totalHit = 0;
    for (const n of notesList) {
      const hitMs = Math.min(hitMapRef.current.get(n.time_ms) ?? 0, n.duration_ms);
      totalHit    += hitMs;
      totalWeight += n.duration_ms;
    }
    return totalWeight > 0 ? Math.round((totalHit / totalWeight) * 100) : 0;
  }

  function finishSession() {
    const notesList = notesRef.current;
    if (!notesList.length) return;

    const score = calculateScore(notesList);
    const notesHit = [...hitMapRef.current.entries()]
      .filter(([, ms]) => ms >= 150).length;
    const r = sessionRangeRef.current;
    const isNewBest = bestScore === null || score > bestScore;

    fetch(`${API}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        song_id:        song.id,
        accuracy_pct:   score,
        notes_hit:      notesHit,
        notes_total:    notesList.length,
        range_low_midi:  r.low === Infinity  ? null : r.low,
        range_high_midi: r.high === -Infinity ? null : r.high,
      }),
    }).catch(() => {});

    if (isNewBest) setBestScore(score);
    setResults({ score, notesHit, notesTotal: notesList.length, isNewBest });
  }

  function buildNotePool() {
    const counts = {};
    notes.forEach(n => {
      const midi = Math.round(n.pitch_midi);
      if (!isNaN(midi)) counts[midi] = (counts[midi] || 0) + 1;
    });
    const pool = [];
    Object.entries(counts).forEach(([midi, count]) => {
      for (let i = 0; i < count; i++) pool.push(Number(midi));
    });
    return pool;
  }

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play().catch(() => setAudioError("Could not play audio."));
      setPlaying(true);
    }
  }

  function handleMark() {
    if (markStart === null) {
      setMarkStart(elapsedMs);
    } else {
      const start = Math.min(markStart, elapsedMs);
      const end   = Math.max(markStart, elapsedMs);
      setPendingPhrase({ start_ms: start, end_ms: end });
      setPhraseName("");
      setMarkStart(null);
    }
  }

  async function savePhrase() {
    if (!phraseName.trim() || !pendingPhrase) return;
    await fetch(`${API}/phrases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ song_id: song.id, name: phraseName.trim(), ...pendingPhrase }),
    });
    setPendingPhrase(null);
    setPhraseName("");
  }

  function restart() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    hitMapRef.current = new Map();
    lastTickRef.current = null;
    sessionRangeRef.current = { low: Infinity, high: -Infinity };
    setPlaying(false);
    setElapsedMs(0);
    setSessionRange({ low: Infinity, high: -Infinity });
    setResults(null);
  }

  // Lyric sync
  const currentLyricIdx = lyrics.reduce((best, l, i) => l.time_ms <= elapsedMs ? i : best, -1);
  const prevLine    = currentLyricIdx > 0                  ? lyrics[currentLyricIdx - 1].line : null;
  const currentLine = currentLyricIdx >= 0                 ? lyrics[currentLyricIdx].line     : null;
  const nextLine    = currentLyricIdx < lyrics.length - 1  ? lyrics[currentLyricIdx + 1].line : null;

  const songRange = notes.length
    ? { low: Math.min(...notes.map(n => n.pitch_midi)), high: Math.max(...notes.map(n => n.pitch_midi)) }
    : null;

  if (drillMode) {
    const pool = buildNotePool();
    const midiValues = [...new Set(pool)].sort((a, b) => a - b);
    const label = midiValues.length
      ? `${song.title} · ${midiToNote(midiValues[0])}–${midiToNote(midiValues[midiValues.length - 1])}`
      : song.title;
    return (
      <WarmupSession
        mode="matching"
        notePool={pool}
        poolLabel={label}
        onBack={() => setDrillMode(false)}
      />
    );
  }

  return (
    <div className="flex flex-col h-full relative">
      {/* Transport bar */}
      <div className="flex items-center gap-4 px-6 py-3 bg-neutral-900 border-b border-neutral-800 shrink-0">
        <span className="font-semibold truncate max-w-xs">{song.title}</span>
        {bestScore !== null && (
          <span className="text-xs text-yellow-500 font-mono">Best {bestScore}%</span>
        )}
        <div className="flex rounded-lg overflow-hidden border border-neutral-700 text-xs ml-2">
          {["backing", "original"].map(mode => (
            <button key={mode} onClick={() => setAudioMode(mode)}
              className={`px-3 py-1.5 capitalize transition-colors ${audioMode === mode ? "bg-indigo-600 text-white" : "bg-neutral-800 text-neutral-400 hover:text-white"}`}>
              {mode === "backing" ? "Backing track" : "Full song"}
            </button>
          ))}
        </div>
        <div className="flex gap-2 ml-auto">
          {notes.length > 0 && (
            <button
              onClick={() => setDrillMode(true)}
              className="px-3 py-1.5 rounded text-sm bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
              title="Practice the notes of this song weighted by frequency"
            >
              🎯 Drill Notes
            </button>
          )}
          <button
            onClick={handleMark}
            className={`px-3 py-1.5 rounded text-sm transition-colors ${markStart !== null ? "bg-red-600 hover:bg-red-500 text-white animate-pulse" : "bg-neutral-800 hover:bg-neutral-700 text-neutral-300"}`}
            title={markStart !== null ? `Start marked at ${formatTime(markStart)} — tap to set end` : "Mark phrase start"}
          >
            {markStart !== null ? "⏹ Mark End" : "⏺ Mark Start"}
          </button>
          <div className="flex items-center gap-2">
            <span className="text-neutral-600 text-xs">{volume === 0 ? "🔇" : volume < 0.5 ? "🔉" : "🔊"}</span>
            <input
              type="range" min="0" max="1" step="0.01"
              value={volume}
              onChange={e => {
                const v = parseFloat(e.target.value);
                setVolume(v);
                if (audioRef.current) audioRef.current.volume = v;
              }}
              className="w-24 accent-indigo-500 cursor-pointer"
            />
          </div>
          <button onClick={restart} className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-sm">↺ Restart</button>
          {!results && (
            <button onClick={togglePlay} className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-sm font-medium">
              {playing ? "⏸ Pause" : "▶ Play"}
            </button>
          )}
          {!results && playing && (
            <button onClick={() => { audioRef.current?.pause(); setPlaying(false); finishSession(); }}
              className="px-4 py-1.5 rounded bg-neutral-700 hover:bg-neutral-600 text-sm">
              ■ Finish
            </button>
          )}
        </div>
      </div>

      {audioError && (
        <div className="px-6 py-2 bg-yellow-950 border-b border-yellow-800 text-yellow-300 text-xs">{audioError}</div>
      )}

      {lyrics.length > 0 && (
        <div className="px-6 py-4 bg-neutral-950 border-b border-neutral-800 text-center select-none shrink-0">
          <p className="text-neutral-600 text-sm h-5 truncate">{prevLine ?? ""}</p>
          <p className="text-white text-xl font-semibold mt-1 mb-1 truncate">{currentLine ?? "♪"}</p>
          <p className="text-neutral-500 text-sm h-5 truncate">{nextLine ?? ""}</p>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <PianoRoll notes={notes} elapsedMs={elapsedMs} livePitch={livePitch} playing={playing} songDurationMs={song.duration_ms} />

        <aside className="w-48 bg-neutral-950 border-l border-neutral-800 p-4 flex flex-col gap-6 shrink-0">
          <div>
            <p className="text-xs text-neutral-500 mb-2 uppercase tracking-wider">Live Note</p>
            {livePitch ? (
              <div className="text-center">
                <p className="text-3xl font-bold">{livePitch.note}</p>
                <p className={`text-sm mt-1 font-mono ${Math.abs(livePitch.cents) <= 25 ? "text-green-400" : "text-red-400"}`}>
                  {livePitch.cents > 0 ? "+" : ""}{livePitch.cents}¢
                </p>
                <div className="mt-3 relative h-2 bg-neutral-800 rounded-full overflow-hidden">
                  <div className="absolute inset-y-0 left-1/2 w-px bg-neutral-600" />
                  <div className={`absolute inset-y-0 w-2 rounded-full transition-all duration-75 ${Math.abs(livePitch.cents) <= 25 ? "bg-green-400" : "bg-red-400"}`}
                    style={{ left: `${50 + livePitch.cents}%`, transform: "translateX(-50%)" }} />
                </div>
                <div className="flex justify-between text-xs text-neutral-700 mt-1"><span>-50¢</span><span>+50¢</span></div>
              </div>
            ) : (
              <p className="text-neutral-700 text-sm text-center">Sing to detect pitch</p>
            )}
          </div>

          {sessionRange.low !== Infinity && (
            <div>
              <p className="text-xs text-neutral-500 mb-1 uppercase tracking-wider">Your Range</p>
              <p className="text-sm font-mono">{midiToNote(Math.round(sessionRange.low))} – {midiToNote(Math.round(sessionRange.high))}</p>
            </div>
          )}
          {songRange && (
            <div>
              <p className="text-xs text-neutral-500 mb-1 uppercase tracking-wider">Song Range</p>
              <p className="text-sm font-mono">{midiToNote(Math.round(songRange.low))} – {midiToNote(Math.round(songRange.high))}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-neutral-500 mb-1 uppercase tracking-wider">Position</p>
            <p className="text-sm font-mono tabular-nums">{formatTime(elapsedMs)}</p>
          </div>
        </aside>
      </div>

      {/* Phrase save dialog */}
      {pendingPhrase && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-10">
          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6 w-80">
            <p className="font-semibold mb-1">Save Phrase</p>
            <p className="text-xs text-neutral-500 mb-4">
              {formatTime(pendingPhrase.start_ms)} → {formatTime(pendingPhrase.end_ms)}
              {" "}({((pendingPhrase.end_ms - pendingPhrase.start_ms) / 1000).toFixed(1)}s)
            </p>
            <input
              autoFocus
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:border-indigo-500"
              placeholder="e.g. chorus hook"
              value={phraseName}
              onChange={e => setPhraseName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") savePhrase(); if (e.key === "Escape") setPendingPhrase(null); }}
            />
            <div className="flex gap-3">
              <button onClick={savePhrase} className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium">Save</button>
              <button onClick={() => setPendingPhrase(null)} className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Results overlay */}
      {results && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-10">
          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-8 w-80 text-center">
            {results.isNewBest && (
              <p className="text-yellow-400 text-sm font-semibold mb-2 uppercase tracking-widest">New High Score!</p>
            )}
            <div className={`text-7xl font-bold mb-1 ${scoreColor(results.score)}`}>
              {results.score}%
            </div>
            <p className="text-neutral-500 text-sm mb-6">
              {results.notesHit} / {results.notesTotal} notes hit
            </p>
            <div className="w-full bg-neutral-800 rounded-full h-3 mb-6">
              <div className={`h-3 rounded-full transition-all duration-700 ${scoreBarColor(results.score)}`}
                style={{ width: `${results.score}%` }} />
            </div>
            <div className="flex gap-3">
              <button onClick={restart}
                className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium transition-colors">
                Try Again
              </button>
              <button onClick={onBack}
                className="flex-1 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm transition-colors">
                Library
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function scoreColor(score) {
  if (score >= 80) return "text-green-400";
  if (score >= 50) return "text-yellow-400";
  return "text-red-400";
}
function scoreBarColor(score) {
  if (score >= 80) return "bg-green-500";
  if (score >= 50) return "bg-yellow-500";
  return "bg-red-500";
}
function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
