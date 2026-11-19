import { useState } from "react";
import WarmupSession from "./WarmupSession";
import GlideExercise from "./GlideExercise";
import GlottalOnsets from "./GlottalOnsets";
import MessaDiVoce from "./MessaDiVoce";

const SECTIONS = [
  {
    heading: "Pitch & Accuracy",
    exercises: [
      { id: "matching",  type: "session", title: "Note Matching",  icon: "🎯", description: "Hear a note, sing it back. Range widens as your streak grows." },
      { id: "sustain",   type: "session", title: "Sustain",        icon: "🌬️", description: "Hold each note for 3 seconds to build breath control and steady tone." },
      { id: "scales",    type: "session", title: "Scales",         icon: "🎼", description: "Follow a major or minor scale up and down, one note at a time." },
    ],
  },
  {
    heading: "Daily Foundations",
    subheading: "Core technique exercises recommended every practice session.",
    exercises: [
      { id: "glottalOnsets", type: "glottal", title: "Glottal Onsets",  icon: "🎙️", description: "Six clean attacks per note at 80 bpm. Trains precise cord closure for clear, efficient tone." },
      { id: "messaDiVoce",   type: "messa",   title: "Messa di Voce",   icon: "〰️", description: "Hold one note for 6 seconds: start soft, grow loud, then fade back. Builds dynamic control and breath management." },
    ],
  },
  {
    heading: "Register Transitions",
    subheading: "Train your voice to move smoothly through your passaggio (break point) without flipping or cracking.",
    exercises: [
      { id: "siren",    type: "glide", title: "Sirens",     icon: "🌀", description: "Glide continuously from low to high and back on 'wee' or 'oo'. The fundamental register-blending exercise." },
      { id: "lipTrill", type: "glide", title: "Lip Trills", icon: "💋", description: "Blow air through loosely closed lips while gliding through your range. Releases tension and balances breath pressure." },
      { id: "ngGlide",  type: "glide", title: "NG Glide",   icon: "〰️", description: "Hold the 'ng' sound (as in 'sing') while gliding. Anchors resonance and naturally thins the folds for high notes." },
    ],
  },
];

export default function Warmups({ onBack }) {
  const [active, setActive] = useState(null); // { id, type }

  if (active?.type === "session") {
    return <WarmupSession mode={active.id} onBack={() => setActive(null)} />;
  }
  if (active?.type === "glide") {
    return <GlideExercise exerciseId={active.id} onBack={() => setActive(null)} />;
  }
  if (active?.type === "glottal") {
    return <GlottalOnsets onBack={() => setActive(null)} />;
  }
  if (active?.type === "messa") {
    return <MessaDiVoce onBack={() => setActive(null)} />;
  }

  return (
    <div className="p-6 h-full overflow-y-auto">
      <div className="max-w-lg mx-auto">
        <h2 className="text-xl font-semibold mb-1">Vocal Warmups</h2>
        <p className="text-neutral-500 text-sm mb-8">Pick an exercise. Pitch exercises adapt to your range; glide exercises train smooth register transitions.</p>

        {SECTIONS.map(section => (
          <div key={section.heading} className="mb-8">
            <p className="text-xs text-neutral-500 uppercase tracking-widest mb-1">{section.heading}</p>
            {section.subheading && (
              <p className="text-xs text-neutral-600 mb-4 leading-relaxed">{section.subheading}</p>
            )}
            <div className="flex flex-col gap-3">
              {section.exercises.map(ex => (
                <button
                  key={ex.id}
                  onClick={() => setActive({ id: ex.id, type: ex.type })}
                  className="text-left bg-neutral-900 border border-neutral-800 hover:border-indigo-500 rounded-xl p-5 transition-colors group"
                >
                  <div className="flex items-center gap-3 mb-1.5">
                    <span className="text-xl">{ex.icon}</span>
                    <span className="font-semibold text-white group-hover:text-indigo-300 transition-colors">{ex.title}</span>
                  </div>
                  <p className="text-sm text-neutral-500 leading-relaxed">{ex.description}</p>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
