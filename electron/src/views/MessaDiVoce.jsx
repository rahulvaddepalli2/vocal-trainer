import { useEffect, useRef, useState } from "react";
import { playNote, midiToName } from "../utils/piano";
import { usePitch } from "../hooks/usePitch";

const DURATION_MS = 6000;
const BASE_LOW  = 48; // C3
const BASE_HIGH = 67; // G4

function randomInt(lo, hi) {
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

// Ideal amplitude at time t (0–DURATION_MS): a sine arc from 0 → 1 → 0
function idealAmp(t) {
  return Math.sin(Math.PI * (t / DURATION_MS));
}

function speak(text, onEnd) {
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.85;
  if (onEnd) u.onend = onEnd;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

export default function MessaDiVoce({ onBack }) {
  const [phase, setPhase] = useState("intro"); // intro | demo | practice
  const [targetMidi, setTargetMidi] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [ampTrace, setAmpTrace] = useState([]); // [{t, amp}]
  const [done, setDone] = useState(false);

  const { pitch: livePitch, amplitude } = usePitch();
  const amplitudeRef = useRef(0);
  const timerRef     = useRef(null);
  const startRef     = useRef(null);

  useEffect(() => { amplitudeRef.current = amplitude; }, [amplitude]);

  useEffect(() => () => {
    clearInterval(timerRef.current);
    window.speechSynthesis.cancel();
  }, []);

  function startDemo() {
    setPhase("demo");
    speak(
      "Start soft, grow louder through the middle, then fade back to soft. " +
      "One smooth breath, same note the whole time.",
      () => setTimeout(() => setPhase("intro"), 400),
    );
  }

  function beginNote(midi = null) {
    if (midi === null) midi = randomInt(BASE_LOW, BASE_HIGH);
    setTargetMidi(midi);
    setElapsed(0);
    setAmpTrace([]);
    setDone(false);
    playNote(midi);

    startRef.current = performance.now();
    timerRef.current = setInterval(() => {
      const t = performance.now() - startRef.current;
      const amp = amplitudeRef.current;
      setElapsed(t);
      setAmpTrace(prev => [...prev, { t, amp }]);

      if (t >= DURATION_MS) {
        clearInterval(timerRef.current);
        setDone(true);
      }
    }, 50);
  }

  function startPractice() {
    setPhase("practice");
    beginNote();
  }

  function tryAgain() {
    clearInterval(timerRef.current);
    beginNote(targetMidi);
  }

  function nextNote() {
    clearInterval(timerRef.current);
    beginNote();
  }

  const W = 320;
  const H = 120;
  const progress = Math.min(elapsed / DURATION_MS, 1);

  // Build ideal arc path (SVG)
  const STEPS = 60;
  const idealPoints = Array.from({ length: STEPS + 1 }, (_, i) => {
    const t = i / STEPS;
    const x = t * W;
    const y = H - idealAmp(t * DURATION_MS) * (H - 12);
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  // Build actual trace path
  let tracePath = "";
  if (ampTrace.length > 1) {
    tracePath = ampTrace.map((p, i) => {
      const x = (p.t / DURATION_MS) * W;
      const y = H - p.amp * (H - 12);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-4 px-6 py-3 bg-neutral-900 border-b border-neutral-800 shrink-0">
        <button onClick={phase === "practice" ? () => { clearInterval(timerRef.current); setPhase("intro"); setTargetMidi(null); setDone(false); } : onBack}
          className="text-sm text-neutral-400 hover:text-white">
          {phase === "practice" ? "← Exit" : "← Back"}
        </button>
        <span className="font-semibold">Messa di Voce</span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-8 p-8 overflow-y-auto">

        {phase === "intro" && (
          <div className="max-w-md w-full flex flex-col gap-6">
            <div className="bg-neutral-800/60 rounded-2xl p-6 border border-neutral-700 flex flex-col gap-4">
              <h2 className="text-xl font-bold text-white">Why this matters</h2>
              <p className="text-neutral-300 text-sm leading-relaxed">
                Most singers can only sing at one dynamic — everything loud or everything soft.
                This exercise teaches continuous breath-pressure control, separating volume from pitch.
                The skill transfers directly to expression, emotional delivery, and vocal stamina.
              </p>
              <div className="border-t border-neutral-700 pt-4">
                <p className="text-xs text-neutral-500 uppercase tracking-widest mb-2 font-semibold">Tips</p>
                <ul className="text-sm text-neutral-400 flex flex-col gap-1.5 list-disc list-inside">
                  <li>Crescendo by increasing breath support from below — not by pushing from the throat</li>
                  <li>On the fade, resist the urge to let pitch sag — stay engaged as volume drops</li>
                  <li>Start softer than feels natural; you need room to grow</li>
                </ul>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={startDemo}
                className="flex-1 py-3 rounded-xl border border-neutral-600 text-neutral-300 hover:text-white hover:border-neutral-400 transition-colors text-sm font-medium"
              >
                Hear Instructions
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
          <p className="text-neutral-400 text-sm animate-pulse">Listening to instructions…</p>
        )}

        {phase === "practice" && targetMidi !== null && (
          <div className="flex flex-col items-center gap-6 w-full max-w-sm">
            <div className="text-center">
              <p className="text-xs text-neutral-500 uppercase tracking-widest mb-2">Hold this note</p>
              <div className="text-7xl font-bold text-white">{midiToName(targetMidi)}</div>
              <p className="text-sm text-neutral-500 mt-1">
                {livePitch ? <span className="text-blue-400">{livePitch.note}</span> : "Sing to detect pitch"}
              </p>
            </div>

            {/* Timer bar */}
            <div className="w-full">
              <div className="flex justify-between text-xs text-neutral-600 mb-1">
                <span>soft</span>
                <span>loud</span>
                <span>soft</span>
              </div>
              <div className="relative h-2 bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-indigo-500 rounded-full transition-none"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
            </div>

            {/* Volume arc chart */}
            <div className="w-full">
              <svg width={W} height={H + 8} viewBox={`0 0 ${W} ${H + 8}`} className="w-full">
                {/* Ideal arc */}
                <path d={idealPoints} fill="none" stroke="#3730a3" strokeWidth="2" strokeDasharray="4 3" opacity="0.6" />
                {/* Actual trace */}
                {tracePath && (
                  <path d={tracePath} fill="none" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                )}
                {/* Playhead */}
                {!done && (
                  <line
                    x1={progress * W} y1={0} x2={progress * W} y2={H}
                    stroke="#6b7280" strokeWidth="1" strokeDasharray="2 2"
                  />
                )}
              </svg>
              <div className="flex justify-between text-xs text-neutral-700 mt-1">
                <span>0s</span><span>3s</span><span>6s</span>
              </div>
            </div>

            {/* Live amplitude bar */}
            <div className="w-full flex flex-col gap-1">
              <p className="text-xs text-neutral-600 text-center">Live volume</p>
              <div className="relative h-4 bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-none"
                  style={{
                    width: `${amplitude * 100}%`,
                    background: `hsl(${120 * amplitude}, 80%, 50%)`,
                  }}
                />
              </div>
            </div>

            {done && (
              <div className="flex flex-col items-center gap-4 mt-2">
                <p className="text-green-400 font-semibold text-lg">Done!</p>
                <div className="flex gap-3">
                  <button onClick={tryAgain} className="px-5 py-2 rounded-xl border border-neutral-600 text-neutral-300 hover:text-white text-sm">
                    Try Again
                  </button>
                  <button onClick={nextNote} className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold">
                    Next Note →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
