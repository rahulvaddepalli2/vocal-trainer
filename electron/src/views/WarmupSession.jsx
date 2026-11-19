import { useEffect, useRef, useState } from "react";
import { playNote, stopNote, midiToName } from "../utils/piano";
import { usePitch } from "../hooks/usePitch";

const TOLERANCE_CENTS = 25;
const STREAK_EXPAND_EVERY = 5;

const BASE_LOW  = 43; // G2
const BASE_HIGH = 55; // G3
const ABS_LOW   = 43;
const ABS_HIGH  = 96;

const MAJOR = [0, 2, 4, 5, 7, 9, 11, 12];
const MINOR = [0, 2, 3, 5, 7, 8, 10, 12];

const SUSTAIN_MS = { matching: 300, sustain: 3000, scales: 400 };
const MODE_LABELS = { matching: "Note Matching", sustain: "Sustain", scales: "Scales" };

const VOWELS = [
  { symbol: "EE", word: "see"    },
  { symbol: "EH", word: "bed"    },
  { symbol: "AH", word: "father" },
  { symbol: "OH", word: "go"     },
  { symbol: "OO", word: "moon"   },
];

function getRange(expansions) {
  return {
    low:  Math.max(ABS_LOW,  BASE_LOW  - expansions),
    high: Math.min(ABS_HIGH, BASE_HIGH + expansions),
  };
}

function randomInt(lo, hi) {
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

function buildScale(root, type) {
  const intervals = type === "major" ? MAJOR : MINOR;
  const up   = intervals.map(i => root + i);
  const down = [...intervals].reverse().slice(1).map(i => root + i);
  return [...up, ...down];
}

// notePool: optional array of MIDI ints (with duplicates = weighted). When provided,
// overrides adaptive range and uses weighted random selection from the song's notes.
export default function WarmupSession({ mode, onBack, notePool = null, poolLabel = null }) {
  const { pitch: livePitch } = usePitch();
  const [streak, setStreak]         = useState(0);
  const [expansions, setExpansions] = useState(0);
  const [targetMidi, setTargetMidi] = useState(null);
  const [heldMs, setHeldMs]         = useState(0);
  const [glowing, setGlowing]       = useState(false);
  const [noteHit, setNoteHit]       = useState(false);
  const [feedback, setFeedback]     = useState(null);

  // Scale-specific
  const [scaleNotes, setScaleNotes] = useState([]);
  const [scaleIdx, setScaleIdx]     = useState(0);
  const [scaleType, setScaleType]   = useState("major");
  const [scaleRoot, setScaleRoot]   = useState(null);

  // Blind mode — hides note name until confirmed
  const [blindMode, setBlindMode]     = useState(false);
  const [revealed, setRevealed]       = useState(false);

  // Vowel mode (scales only)
  const [vowelMode, setVowelMode]     = useState(false);
  const [vowelIdx, setVowelIdx]       = useState(0);
  const [waitingSilence, setWaitingSilence] = useState(false);
  const vowelIdxRef                   = useRef(0);
  const vowelModeRef                  = useRef(false);
  const waitingSilenceRef             = useRef(false);
  const silenceMsRef                  = useRef(0);

  const livePitchRef  = useRef(null);
  const heldRef       = useRef(0);
  const lastTickRef   = useRef(null);
  const activeNoteRef = useRef(null);
  const streakRef     = useRef(0);
  const expansionsRef = useRef(0);
  const targetRef     = useRef(null);
  const scaleRef      = useRef({ notes: [], idx: 0 });
  const noteHitRef    = useRef(false);

  useEffect(() => { livePitchRef.current = livePitch; }, [livePitch]);
  useEffect(() => { streakRef.current = streak; }, [streak]);
  useEffect(() => { noteHitRef.current = noteHit; }, [noteHit]);
  useEffect(() => { expansionsRef.current = expansions; }, [expansions]);
  useEffect(() => { targetRef.current = targetMidi; }, [targetMidi]);
  useEffect(() => { scaleRef.current = { notes: scaleNotes, idx: scaleIdx }; }, [scaleNotes, scaleIdx]);
  useEffect(() => { vowelIdxRef.current = vowelIdx; }, [vowelIdx]);
  useEffect(() => { vowelModeRef.current = vowelMode; }, [vowelMode]);
  useEffect(() => { waitingSilenceRef.current = waitingSilence; }, [waitingSilence]);

  function playTarget(midi) {
    if (activeNoteRef.current) stopNote(activeNoteRef.current);
    activeNoteRef.current = playNote(midi);
    setTimeout(() => { stopNote(activeNoteRef.current); activeNoteRef.current = null; }, 1500);
  }

  function nextRandomNote() {
    const midi = notePool
      ? notePool[Math.floor(Math.random() * notePool.length)]
      : randomInt(getRange(expansionsRef.current).low, getRange(expansionsRef.current).high);
    setTargetMidi(midi);
    targetRef.current = midi;
    heldRef.current = 0;
    setHeldMs(0);
    setGlowing(false);
    setNoteHit(false);
    noteHitRef.current = false;
    setRevealed(false);
    playTarget(midi);
  }

  function nextScaleNote(notes, idx) {
    if (idx >= notes.length) { startNewScale(); return; }
    const midi = notes[idx];
    setTargetMidi(midi);
    targetRef.current = midi;
    heldRef.current = 0;
    setHeldMs(0);
    setGlowing(false);
    setVowelIdx(0);
    vowelIdxRef.current = 0;
    setWaitingSilence(false);
    waitingSilenceRef.current = false;
    silenceMsRef.current = 0;
    setRevealed(false);
    playTarget(midi);
  }

  function startNewScale() {
    const { low, high } = getRange(expansionsRef.current);
    const rootHigh = Math.min(high - 12, high);
    const root = low >= rootHigh ? low : randomInt(low, rootHigh);
    const type = Math.random() > 0.5 ? "major" : "minor";
    const notes = buildScale(root, type);
    setScaleRoot(root);
    setScaleType(type);
    setScaleNotes(notes);
    setScaleIdx(0);
    setVowelIdx(0);
    vowelIdxRef.current = 0;
    scaleRef.current = { notes, idx: 0 };
    setTimeout(() => nextScaleNote(notes, 0), 300);
  }

  function confirmHit() {
    const newStreak = streakRef.current + 1;
    setStreak(newStreak);
    streakRef.current = newStreak;

    if (newStreak % STREAK_EXPAND_EVERY === 0) {
      const exp = expansionsRef.current + 1;
      setExpansions(exp);
      expansionsRef.current = exp;
      showFeedback("Range expanded! 🎉");
    } else {
      showFeedback(newStreak % 3 === 0 ? "Nice! 🔥" : null);
    }

    heldRef.current = 0;
    setHeldMs(0);
    setGlowing(false);
    setRevealed(true);

    if (mode === "matching") {
      setNoteHit(true);
      noteHitRef.current = true;
    } else if (mode === "scales") {
      if (vowelModeRef.current) {
        const nextVowel = vowelIdxRef.current + 1;
        if (nextVowel < VOWELS.length) {
          showFeedback(`✓ ${VOWELS[vowelIdxRef.current].symbol}`);
          setVowelIdx(nextVowel);
          vowelIdxRef.current = nextVowel;
          // Wait for silence before accepting the next vowel
          silenceMsRef.current = 0;
          setWaitingSilence(true);
          waitingSilenceRef.current = true;
        } else {
          showFeedback("All vowels! ✓");
          const { notes, idx } = scaleRef.current;
          const nextIdx = idx + 1;
          setScaleIdx(nextIdx);
          scaleRef.current = { notes, idx: nextIdx };
          setTimeout(() => nextScaleNote(notes, nextIdx), 600);
        }
      } else {
        const { notes, idx } = scaleRef.current;
        const nextIdx = idx + 1;
        setScaleIdx(nextIdx);
        scaleRef.current = { notes, idx: nextIdx };
        setTimeout(() => nextScaleNote(notes, nextIdx), 400);
      }
    } else {
      setTimeout(nextRandomNote, 400);
    }
  }

  function handleNextNote() {
    nextRandomNote();
  }

  function showFeedback(msg) {
    if (!msg) return;
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 1200);
  }

  function toggleVowelMode() {
    const next = !vowelMode;
    setVowelMode(next);
    vowelModeRef.current = next;
    setVowelIdx(0);
    vowelIdxRef.current = 0;
  }

  // Scoring ticker
  useEffect(() => {
    const interval = setInterval(() => {
      const now = performance.now();
      const dt = lastTickRef.current ? now - lastTickRef.current : 50;
      lastTickRef.current = now;

      const pitch  = livePitchRef.current;
      const target = targetRef.current;
      if (target === null) return;

      const cents = pitch ? Math.abs(pitch.midi - target) * 100 : Infinity;
      const onTarget = cents <= TOLERANCE_CENTS;

      // Waiting for silence between vowels — don't start hold timer until voice drops
      if (waitingSilenceRef.current) {
        if (!onTarget) {
          silenceMsRef.current += dt;
          if (silenceMsRef.current >= 300) {
            setWaitingSilence(false);
            waitingSilenceRef.current = false;
            silenceMsRef.current = 0;
          }
        } else {
          silenceMsRef.current = 0; // reset if still singing
        }
        setGlowing(false);
        return;
      }

      if (onTarget) {
        heldRef.current += dt;
        setHeldMs(heldRef.current);
        setGlowing(true);
        if (heldRef.current >= SUSTAIN_MS[mode] && !noteHitRef.current) confirmHit();
      } else {
        heldRef.current = 0;
        setHeldMs(0);
        setGlowing(false);
      }
    }, 50);
    return () => clearInterval(interval);
  }, [mode]);

  // Start first note
  useEffect(() => {
    if (mode === "scales") startNewScale();
    else setTimeout(nextRandomNote, 500);
    return () => { if (activeNoteRef.current) stopNote(activeNoteRef.current); };
  }, []);

  const sustainNeeded = SUSTAIN_MS[mode];
  const progress = targetMidi !== null ? Math.min(heldMs / sustainNeeded, 1) : 0;
  const cents = livePitch && targetMidi !== null ? Math.round((livePitch.midi - targetMidi) * 100) : null;
  const scaleLabel = scaleRoot !== null ? `${midiToName(scaleRoot)} ${scaleType}` : null;
  const { low, high } = getRange(expansions);
  const currentVowel = VOWELS[vowelIdx];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-3 bg-neutral-900 border-b border-neutral-800 shrink-0">
        <button onClick={onBack} className="text-sm text-neutral-400 hover:text-white">← Back</button>
        <span className="font-semibold">{MODE_LABELS[mode]}</span>
        {mode === "scales" && scaleLabel && (
          <span className="text-sm text-neutral-500 ml-1">{scaleLabel}</span>
        )}
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={() => setBlindMode(b => !b)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              blindMode
                ? "bg-amber-600 border-amber-500 text-white"
                : "border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500"
            }`}
          >
            Blind Mode
          </button>
          {mode === "scales" && (
            <button
              onClick={toggleVowelMode}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                vowelMode
                  ? "bg-indigo-600 border-indigo-500 text-white"
                  : "border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500"
              }`}
            >
              Vowel Mode
            </button>
          )}
          {notePool
            ? <span className="text-xs text-neutral-500">{poolLabel ?? "Song range"}</span>
            : <span className="text-xs text-neutral-500">Range: {midiToName(low)}–{midiToName(high)}</span>
          }
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-neutral-500">Streak</span>
            <span className="text-lg font-bold text-indigo-400 tabular-nums w-8 text-center">{streak}</span>
          </div>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col items-center justify-center gap-8 p-8 select-none">

        {feedback && (
          <div className="absolute top-24 text-green-400 font-semibold text-lg animate-pulse">
            {feedback}
          </div>
        )}

        {/* Target note */}
        <div className="text-center">
          <p className="text-xs text-neutral-500 uppercase tracking-widest mb-2">Target note</p>
          <div className={`text-8xl font-bold transition-all duration-150 ${glowing ? "text-green-400 drop-shadow-[0_0_24px_#4ade80]" : revealed ? "text-amber-400" : "text-white"}`}>
            {targetMidi === null ? "—" : (blindMode && !revealed) ? "?" : midiToName(targetMidi)}
          </div>
          {blindMode && revealed && (
            <p className="text-xs text-amber-400 mt-1 uppercase tracking-widest">that was {midiToName(targetMidi)}</p>
          )}
        </div>

        {/* Vowel display (scales + vowel mode only) */}
        {mode === "scales" && vowelMode && currentVowel && (
          <div className="flex flex-col items-center gap-2">
            <div className={`text-5xl font-bold tracking-widest transition-colors ${glowing ? "text-green-400" : "text-indigo-400"}`}>
              {currentVowel.symbol}
            </div>
            <p className="text-sm text-neutral-500">as in <span className="text-neutral-300 font-medium">"{currentVowel.word}"</span></p>
            {waitingSilence && (
              <p className="text-xs text-amber-400 animate-pulse mt-1">stop singing to continue</p>
            )}
            {/* Vowel progress dots */}
            <div className="flex gap-2 mt-1">
              {VOWELS.map((v, i) => (
                <div key={v.symbol} className={`w-2 h-2 rounded-full transition-colors ${
                  i < vowelIdx ? "bg-green-500" : i === vowelIdx ? "bg-indigo-400" : "bg-neutral-700"
                }`} />
              ))}
            </div>
          </div>
        )}

        {/* Sustain progress arc */}
        <div className="relative w-32 h-32">
          <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
            <circle cx="60" cy="60" r="50" fill="none" stroke="#262626" strokeWidth="10" />
            <circle
              cx="60" cy="60" r="50" fill="none"
              stroke={glowing ? "#4ade80" : "#3730a3"}
              strokeWidth="10"
              strokeDasharray={`${2 * Math.PI * 50}`}
              strokeDashoffset={`${2 * Math.PI * 50 * (1 - progress)}`}
              strokeLinecap="round"
              style={{ transition: "stroke-dashoffset 0.05s linear, stroke 0.1s" }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-mono text-neutral-400">{Math.round(progress * 100)}%</span>
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
                className={`absolute inset-y-0 w-3 rounded-full transition-all duration-75 ${glowing ? "bg-green-400" : "bg-blue-400"}`}
                style={{ left: `${Math.max(0, Math.min(100, 50 + (cents ?? 0)))}%`, transform: "translateX(-50%)" }}
              />
            )}
          </div>
          <div className="mt-2 text-center">
            {livePitch ? (
              <span className={`text-sm font-mono font-semibold ${glowing ? "text-green-400" : Math.abs(cents) <= 50 ? "text-blue-400" : "text-neutral-500"}`}>
                {livePitch.note} {cents !== null ? `${cents > 0 ? "+" : ""}${cents}¢` : ""}
              </span>
            ) : (
              <span className="text-sm text-neutral-600">Sing to detect pitch</span>
            )}
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => { if (targetMidi !== null) playTarget(targetMidi); }}
            className="text-xs text-neutral-500 hover:text-white border border-neutral-700 hover:border-neutral-500 rounded-lg px-4 py-2 transition-colors"
          >
            ↺ Replay note
          </button>
          {mode === "matching" && noteHit && (
            <button
              onClick={handleNextNote}
              className="text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg px-6 py-2 transition-colors"
            >
              Next Note →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
