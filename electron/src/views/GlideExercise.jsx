import { useEffect, useRef, useState } from "react";
import { playNote, stopNote } from "../utils/piano";
import { usePitch } from "../hooks/usePitch";

// MIDI range for trail display
const TRAIL_LOW  = 40; // E2
const TRAIL_HIGH = 84; // C6
const TRAIL_SECS = 6;

const EXERCISES = {
  siren: {
    title: "Sirens",
    icon: "🌀",
    tagline: "Smoothly connect your chest and head voice",
    goal: "Glide continuously from low to high and back down — like a siren or ambulance sound. The goal is zero 'flips' or cracks through your passaggio (break point).",
    steps: [
      { label: "Breath", text: "Take a relaxed diaphragmatic breath — ribs expand sideways, shoulders stay down." },
      { label: "Sound", text: 'Sing the vowel "wee" (or "oo" if "wee" feels tight). Keep your jaw loose.' },
      { label: "Glide up", text: "Start at the bottom of your comfortable range and slide smoothly upward — don't stop at any note, just glide." },
      { label: "Glide down", text: "Without pausing at the top, glide smoothly back down to where you started." },
      { label: "Smoothness", text: "If you feel a flip or crack, don't force through it — lighten your tone as you approach it. The goal is connecting, not powering." },
    ],
    demoPath: "up-down", // glide up then down
    repsTarget: 5,
    restSecs: 10,
    tip: "If you crack, you've found your passaggio — that's the exact spot to practise through.",
  },
  lipTrill: {
    title: "Lip Trills",
    icon: "💋",
    tagline: "Release tension and balance air pressure",
    goal: "Blow air through loosely closed lips to create a 'brrr' flutter while gliding through your pitch range. The trill releases jaw and throat tension and forces proper breath support.",
    steps: [
      { label: "Setup", text: "Relax your lips completely — they should be loose enough to flutter with very little air pressure. Don't press them tight." },
      { label: "Air", text: "Blow a steady, relaxed stream of air. If the trill stops, you're using too much tension or too little air — find the sweet spot." },
      { label: "Add voice", text: 'Add your voice to the air stream. You should feel vibration on your lips. Think "brrrr" with pitch.' },
      { label: "Glide", text: "While maintaining the trill, glide up through your range, then back down. If the trill breaks, reset and continue." },
      { label: "Why it works", text: "The back-pressure from the trill reduces hyperfunction (over-squeezing) in the larynx, letting your cords find their natural transition point." },
    ],
    demoPath: "up-down",
    repsTarget: 5,
    restSecs: 8,
    tip: "Can't keep the trill going? Lightly press your cheeks inward with two fingers — reduces the effort needed.",
  },
  ngGlide: {
    title: "NG Glide",
    icon: "〰️",
    tagline: "Blend registers using tongue-anchored resonance",
    goal: 'Sustain the "ng" sound (as in "sing" or "ring") while gliding through your range. The raised tongue-back reduces laryngeal constriction and naturally blends chest and head voice.',
    steps: [
      { label: "Find the sound", text: 'Say "sing" — hold the very end: "nggggg". Your tongue tip is down, the back of your tongue touches your soft palate. That\'s the position.' },
      { label: "Check it", text: 'Pinch your nose while making the "ng" — the sound should stop completely. That confirms you\'re in the right position.' },
      { label: "Add pitch", text: "Hold the ng sound and find a comfortable mid-range note. You should feel vibration behind your nose and upper teeth." },
      { label: "Glide up", text: "From mid-range, glide upward — keep the ng shape and don't switch to an open vowel. Stay in the ng resonance the whole time." },
      { label: "Glide down", text: "Glide back down through your range. Notice how much smoother the transition feels than singing an open vowel." },
    ],
    demoPath: "up-down",
    repsTarget: 4,
    restSecs: 10,
    tip: "The ng position naturally activates \"thinning\" of the vocal folds — exactly what you need for smooth high notes.",
  },
};

// Build a piano demo glide: steps through MIDI notes at a tempo
const DEMO_LOW  = 48; // C3
const DEMO_HIGH = 72; // C5
const DEMO_STEP_MS = 120;

export default function GlideExercise({ exerciseId, onBack }) {
  const ex = EXERCISES[exerciseId];

  const [reps, setReps]           = useState(0);
  const [resting, setResting]     = useState(false);
  const [restLeft, setRestLeft]   = useState(0);
  const [demoPlaying, setDemoPlaying] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(true);

  // Trail: array of {t (ms), midi}
  const trailRef    = useRef([]);
  const canvasRef   = useRef(null);
  const demoTimers  = useRef([]);
  const animRef     = useRef(null);

  const { pitch: livePitch } = usePitch();

  // Feed live pitch into the trail
  useEffect(() => {
    if (livePitch) trailRef.current.push({ t: performance.now(), midi: livePitch.midi });
  }, [livePitch]);

  // Canvas animation loop
  useEffect(() => {
    function draw() {
      animRef.current = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      const W = canvas.width, H = canvas.height;
      const now = performance.now();

      // Trim old trail points
      const cutoff = now - TRAIL_SECS * 1000;
      trailRef.current = trailRef.current.filter(p => p.t >= cutoff);

      ctx.clearRect(0, 0, W, H);

      // Background grid lines for each octave C
      ctx.strokeStyle = "#262626";
      ctx.lineWidth = 1;
      for (let midi = TRAIL_LOW; midi <= TRAIL_HIGH; midi++) {
        const name = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"][midi % 12];
        if (name === "C") {
          const y = midiToY(midi, H);
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
          ctx.fillStyle = "#404040";
          ctx.font = "10px monospace";
          ctx.fillText(`C${Math.floor(midi / 12) - 1}`, 4, y - 2);
        }
      }

      // Expected glide path (ghost curve)
      const archPoints = buildArchPath(W, H, ex.demoPath);
      ctx.beginPath();
      ctx.setLineDash([4, 6]);
      ctx.strokeStyle = "#3730a3";
      ctx.lineWidth = 2;
      archPoints.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.stroke();
      ctx.setLineDash([]);

      // Live pitch trail
      const pts = trailRef.current;
      if (pts.length > 1) {
        ctx.beginPath();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = "#60a5fa";
        ctx.shadowColor = "#60a5fa";
        ctx.shadowBlur = 6;
        pts.forEach((p, i) => {
          const x = ((p.t - cutoff) / (TRAIL_SECS * 1000)) * W;
          const y = midiToY(p.midi, H);
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Current pitch dot
      if (pts.length > 0) {
        const last = pts[pts.length - 1];
        const x = ((last.t - cutoff) / (TRAIL_SECS * 1000)) * W;
        const y = midiToY(last.midi, H);
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fillStyle = "#4ade80";
        ctx.shadowColor = "#4ade80";
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [ex.demoPath]);

  function midiToY(midi, H) {
    return H - ((midi - TRAIL_LOW) / (TRAIL_HIGH - TRAIL_LOW)) * H;
  }

  function buildArchPath(W, H, path) {
    const pts = [];
    const steps = 60;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // arch: t=0 → bottom, t=0.5 → top, t=1 → bottom
      const pitch = t <= 0.5 ? t * 2 : (1 - t) * 2;
      const midi = DEMO_LOW + pitch * (DEMO_HIGH - DEMO_LOW);
      pts.push({ x: t * W, y: midiToY(midi, H) });
    }
    return pts;
  }

  function playDemo() {
    if (demoPlaying) return;
    setDemoPlaying(true);
    demoTimers.current.forEach(clearTimeout);
    demoTimers.current = [];

    // Build glide: up then down
    const notes = [];
    for (let m = DEMO_LOW; m <= DEMO_HIGH; m += 2) notes.push(m);
    for (let m = DEMO_HIGH; m >= DEMO_LOW; m -= 2) notes.push(m);

    let currentAudio = null;
    notes.forEach((midi, i) => {
      const t = demoTimers.current[demoTimers.current.length] = setTimeout(() => {
        if (currentAudio) stopNote(currentAudio);
        currentAudio = playNote(midi);
      }, i * DEMO_STEP_MS);
      demoTimers.current.push(t);
    });

    const totalMs = notes.length * DEMO_STEP_MS + 400;
    const end = setTimeout(() => {
      if (currentAudio) stopNote(currentAudio);
      setDemoPlaying(false);
    }, totalMs);
    demoTimers.current.push(end);
  }

  function markRepDone() {
    const next = reps + 1;
    setReps(next);
    if (next < ex.repsTarget) {
      setResting(true);
      setRestLeft(ex.restSecs);
      const tick = setInterval(() => {
        setRestLeft(r => {
          if (r <= 1) { clearInterval(tick); setResting(false); return 0; }
          return r - 1;
        });
      }, 1000);
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-3 bg-neutral-900 border-b border-neutral-800 shrink-0">
        <button onClick={onBack} className="text-sm text-neutral-400 hover:text-white">← Back</button>
        <span className="text-lg">{ex.icon}</span>
        <div>
          <span className="font-semibold">{ex.title}</span>
          <span className="text-neutral-500 text-sm ml-2">{ex.tagline}</span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={playDemo}
            disabled={demoPlaying}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${demoPlaying ? "bg-neutral-700 text-neutral-500 cursor-not-allowed" : "bg-indigo-700 hover:bg-indigo-600 text-white"}`}
          >
            {demoPlaying ? "▶ Playing demo…" : "🔊 Hear demo"}
          </button>
          <div className="text-sm text-neutral-400">
            Reps: <span className="text-white font-bold">{reps}</span>
            <span className="text-neutral-600"> / {ex.repsTarget}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: instructions panel */}
        <div className="w-72 shrink-0 border-r border-neutral-800 overflow-y-auto">
          {/* Goal */}
          <div className="p-4 border-b border-neutral-800">
            <p className="text-xs text-neutral-500 uppercase tracking-widest mb-2">Goal</p>
            <p className="text-sm text-neutral-300 leading-relaxed">{ex.goal}</p>
          </div>

          {/* Steps */}
          <div className="p-4 border-b border-neutral-800">
            <button
              className="flex items-center justify-between w-full text-xs text-neutral-500 uppercase tracking-widest mb-3"
              onClick={() => setInstructionsOpen(o => !o)}
            >
              <span>How to do it</span>
              <span>{instructionsOpen ? "▲" : "▼"}</span>
            </button>
            {instructionsOpen && (
              <ol className="flex flex-col gap-4">
                {ex.steps.map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="w-5 h-5 rounded-full bg-indigo-900 text-indigo-300 text-xs flex items-center justify-center shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-indigo-300 mb-0.5">{step.label}</p>
                      <p className="text-xs text-neutral-400 leading-relaxed">{step.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* Tip */}
          <div className="p-4">
            <p className="text-xs text-yellow-600 uppercase tracking-widest mb-2">💡 Pro tip</p>
            <p className="text-xs text-neutral-400 leading-relaxed">{ex.tip}</p>
          </div>
        </div>

        {/* Right: pitch trail + controls */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Live pitch label */}
          <div className="flex items-center gap-4 px-4 py-2 border-b border-neutral-800 shrink-0">
            <p className="text-xs text-neutral-500 uppercase tracking-widest">Live pitch</p>
            {livePitch ? (
              <span className="text-sm font-mono font-semibold text-blue-400">
                {livePitch.note} {livePitch.cents > 0 ? "+" : ""}{Math.round(livePitch.cents)}¢
              </span>
            ) : (
              <span className="text-xs text-neutral-600">Sing to see your pitch trail</span>
            )}
            <div className="ml-auto flex items-center gap-2 text-xs text-neutral-600">
              <span className="inline-block w-6 h-0.5 bg-blue-400"></span> Your pitch
              <span className="inline-block w-6 h-0.5 bg-indigo-700 ml-2" style={{borderTop: "2px dashed #3730a3"}}></span> Target path
            </div>
          </div>

          {/* Canvas trail */}
          <div className="flex-1 relative overflow-hidden">
            <canvas
              ref={canvasRef}
              className="w-full h-full"
              width={900}
              height={500}
              style={{ width: "100%", height: "100%" }}
            />
          </div>

          {/* Rep controls */}
          <div className="border-t border-neutral-800 px-6 py-4 flex items-center gap-4 shrink-0">
            {resting ? (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full border-2 border-indigo-500 flex items-center justify-center">
                  <span className="text-sm font-bold text-indigo-400">{restLeft}</span>
                </div>
                <span className="text-sm text-neutral-400">Rest… breathe slowly through your nose</span>
              </div>
            ) : reps >= ex.repsTarget ? (
              <div className="flex items-center gap-3">
                <span className="text-green-400 font-semibold">✓ Session complete!</span>
                <button onClick={() => setReps(0)} className="text-xs text-neutral-500 hover:text-white border border-neutral-700 rounded px-3 py-1">
                  Restart
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={markRepDone}
                  className="px-6 py-2 rounded-lg bg-green-700 hover:bg-green-600 text-sm font-semibold transition-colors"
                >
                  ✓ Rep done
                </button>
                <p className="text-xs text-neutral-500">
                  Complete one full glide up and down, then tap when done.
                  {ex.repsTarget - reps} rep{ex.repsTarget - reps !== 1 ? "s" : ""} remaining.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
