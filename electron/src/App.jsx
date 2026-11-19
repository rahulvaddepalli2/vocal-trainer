import { useState, useEffect } from "react";
import Library from "./views/Library";
import Practice from "./views/Practice";
import Warmups from "./views/Warmups";
import Phrases from "./views/Phrases";
import { unlockAudio } from "./utils/piano";

export default function App() {
  const [view, setView] = useState("library");
  const [activeSong, setActiveSong] = useState(null);

  useEffect(() => {
    const handler = () => { unlockAudio(); document.removeEventListener("touchstart", handler); };
    document.addEventListener("touchstart", handler);
    return () => document.removeEventListener("touchstart", handler);
  }, []);

  function openPractice(song) {
    setActiveSong(song);
    setView("practice");
  }

  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center gap-4 px-6 py-3 bg-neutral-900 border-b border-neutral-800">
        <span className="text-lg font-semibold tracking-tight">Vocal Trainer</span>
        {(view === "practice" || view === "warmups" || view === "phrases") && (
          <button
            className="text-sm text-neutral-400 hover:text-white"
            onClick={() => setView("library")}
          >
            ← Library
          </button>
        )}
        {view === "library" && (
          <div className="ml-auto flex gap-2">
            <button
              className="text-sm text-neutral-500 hover:text-white border border-neutral-800 hover:border-neutral-600 rounded-lg px-3 py-1.5 transition-colors"
              onClick={() => setView("phrases")}
            >
              ✂️ Phrases
            </button>
            <button
              className="text-sm text-neutral-500 hover:text-white border border-neutral-800 hover:border-neutral-600 rounded-lg px-3 py-1.5 transition-colors"
              onClick={() => setView("warmups")}
            >
              🎤 Warmups
            </button>
          </div>
        )}
      </header>
      <main className="flex-1 overflow-hidden">
        {view === "library"  && <Library onPractice={openPractice} />}
        {view === "practice" && activeSong && <Practice song={activeSong} onBack={() => setView("library")} />}
        {view === "warmups"  && <Warmups onBack={() => setView("library")} />}
        {view === "phrases"  && <Phrases onBack={() => setView("library")} />}
      </main>
    </div>
  );
}
