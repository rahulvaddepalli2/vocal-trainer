import { useEffect, useRef, useState } from "react";
import { playNote, midiToName } from "../utils/piano";
import { usePitch } from "../hooks/usePitch";

const ATTACKS_PER_NOTE = 6;
const TEMPO_MS = 750;          // 80 bpm
const REST_MS  = 2000;
const TOLERANCE_CENTS = 35;

const BASE_LOW  = 48; // C3
const BASE_HIGH = 60; // C4

function randomInt(lo, hi) {
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

function speak(text, onEnd) {
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.85;
  if (onEnd) u.onend = onEnd;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

export default function GlottalOnsets({ onBack }) {
  const [phase, setPhase] = useState("intro"); // intro | demo | practice
  const [targetMidi, setTargetMidi] = useState(null);
  const [pulseIdx, setPulseIdx] = useState(-1);
  const [setCount, setSetCount] = useState(0);
  const [onPitch, setOnPitch] = useState(false);

  const { pitch: livePitch } = usePitch();
  const timerRef = useRef(null);
  const livePitchRef = useRef(null);

  useEffect(() => { livePitchRef.current = livePitch; }, [livePitch]);

  useEffect(() => () => {
    clearInterval(timerRef.current);
    clearTimeout(timerRef.current);
    window.speechSynthesis.cancel();
  }, []);

  useEffect(() => {
    if (targetMidi === null || phase !== "practice") { setOnPitch(false); return; }
    const cents = livePitch ? Math.abs((livePitch.midi - targetMidi) * 100) : Infinity;
    setOnPitch(cents <= TOLERANCE_CENTS);
  }, [livePitch, targetMidi, phase]);

  function runPulses(midi, onDone) {
    let count = 0;
    timerRef.current = setInterval(() => {
      playNote(midi);
      setPulseIdx(count);
      count++;
      if (count >= ATTACKS_PER_NOTE) {
        clearInterval(timerRef.current);
        setPulseIdx(-1);
        onDone();
      }
    }, TEMPO_MS);
  }

  function startDemo() {
    setPhase("demo");
    const demoMidi = 60; // C4
    speak(`Here's how glottal onsets sound on C 4. Six clean attacks.`, () => {
      setTimeout(() => {
        runPulses(demoMidi, () => {
          setTimeout(() => setPhase("intro"), 800);
        });
      }, 300);
    });
  }

  function startPractice() {
    setSetCount(0);
    setPhase("practice");
    nextNote();
  }

  function nextNote() {
    const midi = randomInt(BASE_LOW, BASE_HIGH);
    setTargetMidi(midi);
    setPulseIdx(-1);

    playNote(midi);
    setTimeout(() => {
      runPulses(midi, () => {
        setSetCount(s => {
          const next = s + 1;
          setTimeout(() => nextNote(), REST_MS);
          return next;
        });
      });
    }, 1200);
  }

  function stop() {
    clearInterval(timerRef.current);
    window.speechSynthesis.cancel();
    setPulseIdx(-1);
    setTargetMidi(null);
    setOnPitch(false);
    setSetCount(0);
    setPhase("intro");
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-4 px-6 py-3 bg-neutral-900 border-b border-neutral-800 shrink-0">
        <button onClick={phase === "practice" ? stop : onBack} className="text-sm text-neutral-400 hover:text-white">
          {phase === "practice" ? "✕ Stop" : "← Back"}
        </button>
        <span className="font-semibold">Glottal Onsets</span>
        {phase === "practice" && (
          <span className="ml-auto text-sm text-neutral-500">{setCount} sets completed</span>
        )}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-8 p-8 overflow-y-auto">

        {phase === "intro" && (
          <div className="max-w-md w-full flex flex-col gap-6">
            <div className="bg-neutral-800/60 rounded-2xl p-6 border border-neutral-700 flex flex-col gap-4">
              <h2 className="text-xl font-bold text-white">Why this matters</h2>
              <p className="text-neutral-300 text-sm leading-relaxed">
                Your vocal cords must close cleanly at the start of each note. A sloppy onset lets air escape
                before the tone begins — causing breathiness, pitch instability, and faster fatigue.
                Mastering this motion makes every note you sing cleaner.
              </p>
              <div className="border-t border-neutral-700 pt-4">
                <p className="text-xs text-neutral-500 uppercase tracking-widest mb-2 font-semibold">Tips</p>
                <ul className="text-sm text-neutral-400 flex flex-col gap-1.5 list-disc list-inside">
                  <li>Think of a tiny silent "k" click right before each "ah" — precise, not forceful</li>
                  <li>Keep your throat wide and relaxed; only the cords close</li>
                  <li>Each attack should feel identical — like pressing the same key 6 times</li>
                </ul>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={startDemo}
                className="flex-1 py-3 rounded-xl border border-neutral-600 text-neutral-300 hover:text-white hover:border-neutral-400 transition-colors text-sm font-medium"
              >
                Hear Demo
              </button>
              <button
                onClick={startPractice}
                className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors"
              >
                Start
              </button>
            </div>
          </div>
        )}

        {phase === "demo" && (
          <div className="flex flex-col items-center gap-6">
            <p className="text-neutral-400 text-sm animate-pulse">Playing demo…</p>
            <div className="flex gap-3">
              {Array.from({ length: ATTACKS_PER_NOTE }).map((_, i) => (
                <div key={i} className={`w-10 h-10 rounded-full border-2 flex items-center justify-center font-bold transition-all duration-75 ${
                  i === pulseIdx ? "bg-indigo-500 border-indigo-400 text-white scale-110" : "border-neutral-700 text-neutral-700"
                }`}>{i + 1}</div>
              ))}
            </div>
          </div>
        )}

        {phase === "practice" && targetMidi !== null && (
          <div className="flex flex-col items-center gap-8 w-full max-w-sm">
            <div className="text-center">
              <p className="text-xs text-neutral-500 uppercase tracking-widest mb-2">Sing with the beats</p>
              <div className={`text-7xl font-bold transition-colors duration-100 ${onPitch ? "text-green-400 drop-shadow-[0_0_20px_#4ade80]" : "text-white"}`}>
                {midiToName(targetMidi)}
              </div>
              <p className="text-sm text-neutral-500 mt-2">
                {livePitch ? <span className="text-blue-400">{livePitch.note}</span> : "Sing to detect pitch"}
              </p>
            </div>

            {/* Attack circles */}
            <div className="flex gap-3">
              {Array.from({ length: ATTACKS_PER_NOTE }).map((_, i) => (
                <div key={i} className={`w-12 h-12 rounded-full border-2 flex items-center justify-center font-bold text-lg transition-all duration-75 ${
                  i === pulseIdx
                    ? onPitch
                      ? "bg-green-500 border-green-400 text-white scale-125"
                      : "bg-indigo-500 border-indigo-400 text-white scale-125"
                    : "border-neutral-700 text-neutral-700"
                }`}>{i + 1}</div>
              ))}
            </div>

            <p className="text-xs text-neutral-600">Sing "ah" on each beat — clean attacks, same pitch</p>
          </div>
        )}
      </div>
    </div>
  );
}
