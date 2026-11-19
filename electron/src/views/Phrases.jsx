import { useEffect, useState } from "react";
import PhraseSession from "./PhraseSession";
import { API_BASE as API } from "../hooks/usePitch";

function formatDuration(ms) {
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

export default function Phrases({ onBack }) {
  const [phrases, setPhrases]   = useState([]);
  const [active, setActive]     = useState(null);

  useEffect(() => { fetchPhrases(); }, []);

  async function fetchPhrases() {
    const r = await fetch(`${API}/phrases`);
    setPhrases(await r.json());
  }

  async function deletePhrase(id, e) {
    e.stopPropagation();
    await fetch(`${API}/phrases/${id}`, { method: "DELETE" });
    setPhrases(p => p.filter(x => x.id !== id));
  }

  if (active) {
    return <PhraseSession phrase={active} onBack={() => { setActive(null); fetchPhrases(); }} />;
  }

  // Group by song
  const grouped = phrases.reduce((acc, p) => {
    const key = p.song_id;
    if (!acc[key]) acc[key] = { title: p.song_title, artist: p.song_artist, items: [] };
    acc[key].items.push(p);
    return acc;
  }, {});

  return (
    <div className="p-6 h-full overflow-y-auto">
      <div className="max-w-lg mx-auto">
        <h2 className="text-xl font-semibold mb-1">Phrases</h2>
        <p className="text-neutral-500 text-sm mb-8">
          Saved from your practice sessions. Mark phrases in Practice using ⏺ Mark Start / ⏹ Mark End.
        </p>

        {phrases.length === 0 && (
          <p className="text-neutral-600 text-center mt-20">No phrases saved yet — mark one while practicing a song.</p>
        )}

        {Object.values(grouped).map(group => (
          <div key={group.title} className="mb-8">
            <p className="text-xs text-neutral-500 uppercase tracking-widest mb-3">
              {group.title}{group.artist ? ` · ${group.artist}` : ""}
            </p>
            <div className="flex flex-col gap-3">
              {group.items.map(phrase => (
                <div
                  key={phrase.id}
                  className="bg-neutral-900 border border-neutral-800 hover:border-indigo-500 rounded-xl p-4 cursor-pointer transition-colors group"
                  onClick={() => setActive(phrase)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{phrase.name}</p>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        {formatDuration(phrase.end_ms - phrase.start_ms)}
                        {" · "}starts at {formatDuration(phrase.start_ms)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs bg-indigo-900/50 text-indigo-300 px-2 py-0.5 rounded-full">Practice</span>
                      <button
                        className="text-neutral-700 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={e => deletePhrase(phrase.id, e)}
                      >✕</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
