import { useEffect, useRef, useState } from "react";
import { API_BASE as API } from "../hooks/usePitch";

export default function Library({ onPractice }) {
  const [songs, setSongs]       = useState([]);
  const [bestScores, setBestScores] = useState({}); // song_id → best %
  const [job, setJob]           = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError]       = useState(null);
  const [pending, setPending]   = useState(null);
  const [meta, setMeta]         = useState({ title: "", artist: "" });
  const inputRef = useRef();

  useEffect(() => { fetchSongs(); }, []);

  async function fetchSongs() {
    try {
      const res = await fetch(`${API}/songs`);
      const list = await res.json();
      setSongs(list);
      // fetch best score for each song
      const scores = {};
      await Promise.all(list.map(async (s) => {
        try {
          const r = await fetch(`${API}/sessions?song_id=${s.id}`);
          const sessions = await r.json();
          if (sessions.length) scores[s.id] = Math.max(...sessions.map(x => x.accuracy_pct ?? 0));
        } catch (_) {}
      }));
      setBestScores(scores);
    } catch (_) {}
  }

  function onFilePicked(file) {
    setPending(file);
    setMeta({ title: file.name.replace(/\.[^.]+$/, ""), artist: "" });
    setError(null);
  }

  async function uploadFile() {
    const file = pending;
    setPending(null);
    setError(null);
    setJob({ pct: 0, label: "Uploading…" });

    let jobId;
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("title", meta.title || file.name.replace(/\.[^.]+$/, ""));
      if (meta.artist) form.append("artist", meta.artist);
      const res = await fetch(`${API}/songs`, { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.text();
        setJob(null);
        setError(`Upload failed (${res.status}): ${body}`);
        return;
      }
      const data = await res.json();
      jobId = data.job_id;
    } catch (e) {
      setJob(null);
      setError(`Could not reach backend: ${e.message}`);
      return;
    }

    // Stream progress via SSE
    setJob({ pct: 0, label: "Starting…" });
    const evtSource = new EventSource(`${API}/jobs/${jobId}/progress`);
    evtSource.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "progress") {
        setJob({ pct: msg.pct, label: msg.label });
      } else if (msg.type === "done") {
        evtSource.close();
        setJob(null);
        fetchSongs();
      } else if (msg.type === "error") {
        evtSource.close();
        setJob(null);
        setError(msg.message);
      }
    };
    evtSource.onerror = () => {
      evtSource.close();
      setJob(null);
      setError("Lost connection to backend during processing.");
    };
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) onFilePicked(file);
  }

  async function deleteSong(id, e) {
    e.stopPropagation();
    await fetch(`${API}/songs/${id}`, { method: "DELETE" });
    setSongs((s) => s.filter((x) => x.id !== id));
  }

  return (
    <div className="p-6 h-full overflow-y-auto">
      {/* Metadata dialog — shown after file picked, before processing */}
      {pending && (
        <div className="mb-8 bg-neutral-900 border border-neutral-700 rounded-xl p-6">
          <p className="font-semibold mb-4">Add song details <span className="text-neutral-500 text-sm font-normal">(used to find synced lyrics)</span></p>
          <div className="flex flex-col gap-3 mb-5">
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">Song title</label>
              <input
                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                value={meta.title}
                onChange={e => setMeta(m => ({ ...m, title: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">Artist name</label>
              <input
                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                placeholder="e.g. Drake"
                value={meta.artist}
                onChange={e => setMeta(m => ({ ...m, artist: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={uploadFile}
              className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium transition-colors"
            >
              Process Song
            </button>
            <button
              onClick={() => setPending(null)}
              className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Drop zone */}
      {!pending && (
        <div
          className={`border-2 border-dashed rounded-xl p-10 text-center mb-8 transition-colors ${
            job ? "border-indigo-500 bg-indigo-900/10 cursor-default" :
            dragOver ? "border-indigo-400 bg-indigo-900/20 cursor-copy" :
            "border-neutral-700 hover:border-neutral-500 cursor-pointer"
          }`}
          onDragOver={(e) => { if (!job) { e.preventDefault(); setDragOver(true); } }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => !job && inputRef.current.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".mp3,.wav,.flac,.m4a"
            className="hidden"
            onChange={(e) => e.target.files[0] && onFilePicked(e.target.files[0])}
          />
          {job ? (
            <div className="w-full max-w-sm mx-auto">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Spinner />
                  <span className="text-neutral-300 text-sm font-medium">{job.label}</span>
                </div>
                <span className="text-neutral-500 text-sm tabular-nums">{job.pct}%</span>
              </div>
              <div className="w-full bg-neutral-800 rounded-full h-2">
                <div
                  className="bg-indigo-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${job.pct}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="text-neutral-500">
              <div className="text-3xl mb-2">🎵</div>
              <p className="font-medium text-neutral-300">Drop a song here</p>
              <p className="text-sm mt-1">MP3, WAV, FLAC, M4A</p>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-950 border border-red-800 text-red-300 text-sm">
          <div className="flex justify-between items-start">
            <p className="font-semibold mb-1">Error processing song</p>
            <button className="text-red-600 hover:text-red-400 ml-4" onClick={() => setError(null)}>✕</button>
          </div>
          <p className="font-mono whitespace-pre-wrap break-all text-xs">{error}</p>
        </div>
      )}

      {songs.length === 0 && !job && (
        <p className="text-center text-neutral-600 mt-20">No songs yet — drop one above to get started.</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {songs.map((song) => (
          <div
            key={song.id}
            className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 cursor-pointer hover:border-indigo-500 transition-colors group"
            onClick={() => onPractice(song)}
          >
            <div className="flex justify-between items-start">
              <div className="min-w-0 flex-1">
                <p className="font-semibold truncate">{song.title}</p>
                <p className="text-sm text-neutral-500">{song.artist || "Unknown artist"}</p>
              </div>
              <div className="flex items-center gap-2 ml-2 shrink-0">
                {bestScores[song.id] != null && (
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${scoreBadge(bestScores[song.id])}`}>
                    {Math.round(bestScores[song.id])}%
                  </span>
                )}
                <button
                  className="text-neutral-700 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => deleteSong(song.id, e)}
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <span className="text-xs text-neutral-600">
                {song.duration_ms ? formatDuration(song.duration_ms) : "—"}
              </span>
              {song.processed_at && (
                <span className="text-xs text-green-700">● processed</span>
              )}
            </div>
            <button className="mt-4 w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium transition-colors">
              Practice
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 text-indigo-400" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function scoreBadge(score) {
  if (score >= 80) return "bg-green-900 text-green-300";
  if (score >= 50) return "bg-yellow-900 text-yellow-300";
  return "bg-red-900 text-red-300";
}
