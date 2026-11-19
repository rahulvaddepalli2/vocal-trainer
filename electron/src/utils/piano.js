const SAMPLE_MAP = {
  21: "A0",  24: "C1",  27: "Ds1", 30: "Fs1",
  33: "A1",  36: "C2",  39: "Ds2", 42: "Fs2",
  45: "A2",  48: "C3",  51: "Ds3", 54: "Fs3",
  57: "A3",  60: "C4",  63: "Ds4", 66: "Fs4",
  69: "A4",  72: "C5",  75: "Ds5", 78: "Fs5",
  81: "A5",  84: "C6",  87: "Ds6", 90: "Fs6",
  93: "A6",  96: "C7",  99: "Ds7", 102: "Fs7",
  105: "A7", 108: "C8",
};
const SAMPLE_MIDIS = Object.keys(SAMPLE_MAP).map(Number).sort((a, b) => a - b);
const IS_ELECTRON = /electron/i.test(navigator.userAgent);
const LOCAL_BASE = IS_ELECTRON ? "http://127.0.0.1:8000/piano/" : "/piano/";

const blobCache = new Map();

// iOS Safari blocks audio until the user has tapped. Call this from a touchstart/click handler.
let audioUnlocked = false;
export function unlockAudio() {
  if (audioUnlocked) return;
  // Silent 1-frame WAV played from a user gesture unlocks all subsequent audio
  const audio = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=");
  audio.volume = 0;
  audio.play().then(() => { audioUnlocked = true; }).catch(() => {});
}

async function warmSample(sampleMidi) {
  if (blobCache.has(sampleMidi)) return;
  try {
    const r = await fetch(`${LOCAL_BASE}${SAMPLE_MAP[sampleMidi]}.mp3`);
    if (!r.ok) return;
    const blob = await r.blob();
    blobCache.set(sampleMidi, URL.createObjectURL(blob));
  } catch (_) {}
}

// Pre-warm vocal range on import
SAMPLE_MIDIS.filter(m => m >= 36 && m <= 84).forEach(warmSample);

function closestSample(midi) {
  let best = SAMPLE_MIDIS[0];
  for (const m of SAMPLE_MIDIS) {
    if (Math.abs(m - midi) < Math.abs(best - midi)) best = m;
  }
  return { sampleMidi: best, semitones: midi - best };
}

export function playNote(midi) {
  const { sampleMidi, semitones } = closestSample(midi);
  const url = blobCache.get(sampleMidi) ?? `${LOCAL_BASE}${SAMPLE_MAP[sampleMidi]}.mp3`;
  const rate = Math.pow(2, semitones / 12);
  const audio = new Audio(url);
  audio.volume = 0.8;
  audio.preservesPitch = false;
  audio.webkitPreservesPitch = false;
  audio.playbackRate = rate;
  audio.addEventListener("loadedmetadata", () => {
    audio.preservesPitch = false;
    audio.webkitPreservesPitch = false;
    audio.playbackRate = rate;
  }, { once: true });
  audio.play().catch(() => {});
  return audio;
}

export function stopNote(audio) {
  if (!audio) return;
  audio.pause();
  audio.currentTime = 0;
}

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function midiToName(midi) {
  return NOTE_NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
}
