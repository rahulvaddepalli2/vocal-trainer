import { useEffect, useRef, useState } from "react";
import { yin, rms } from "../utils/yin";

const IS_ELECTRON = /electron/i.test(navigator.userAgent);

const ENV_API = import.meta.env.VITE_API_BASE || "";
export const API_BASE = IS_ELECTRON ? "http://127.0.0.1:8000" : ENV_API;
export const WS_BASE  = IS_ELECTRON
  ? "ws://127.0.0.1:8000"
  : ENV_API
    ? ENV_API.replace(/^https/, "wss").replace(/^http/, "ws")
    : (window.location.protocol === "https:" ? "wss" : "ws") + "://" + window.location.host;

const NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];

function hzToMidi(hz) {
  return 69 + 12 * Math.log2(hz / 440);
}

function midiToNote(midi) {
  const s = Math.round(midi);
  return NOTE_NAMES[((s % 12) + 12) % 12] + (Math.floor(s / 12) - 1);
}

const SAMPLE_RATE   = 22050;
const HOP_SIZE      = 2048;
const PITCH_HISTORY = 5;
const RMS_THRESHOLD = 0.01;
const AMP_SCALE     = 0.10; // rms ~0.10 = full volume

export function usePitch() {
  const [pitch, setPitch] = useState(null);
  const [amplitude, setAmplitude] = useState(0);
  const recentMidi = useRef([]);

  useEffect(() => {
    if (IS_ELECTRON) {
      const ws = new WebSocket(`${WS_BASE}/pitch`);
      ws.onmessage = (e) => {
        const frame = JSON.parse(e.data);
        const amp = Math.min((frame.rms ?? 0) / AMP_SCALE, 1);
        setAmplitude(amp);
        setPitch(frame.silence ? null : frame);
      };
      return () => ws.close();
    }

    // Browser (iPhone) — capture mic and run YIN in JS
    let audioCtx, source, processor, stream;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
          video: false,
        });
        audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE });
        if (audioCtx.state === "suspended") await audioCtx.resume();

        source    = audioCtx.createMediaStreamSource(stream);
        processor = audioCtx.createScriptProcessor(HOP_SIZE, 1, 1);

        processor.onaudioprocess = (e) => {
          const buf = e.inputBuffer.getChannelData(0);
          const r   = rms(buf);
          const amp = Math.min(r / AMP_SCALE, 1);
          setAmplitude(amp);

          if (r < RMS_THRESHOLD) {
            recentMidi.current = [];
            setPitch(null);
            return;
          }

          const freq = yin(buf, audioCtx.sampleRate);
          if (!freq) { recentMidi.current = []; setPitch(null); return; }

          const rawMidi = hzToMidi(freq);
          if (rawMidi < 36 || rawMidi > 84) { setPitch(null); return; }

          recentMidi.current.push(rawMidi);
          if (recentMidi.current.length > PITCH_HISTORY) recentMidi.current.shift();

          const sorted  = [...recentMidi.current].sort((a, b) => a - b);
          const midi    = sorted[Math.floor(sorted.length / 2)];
          const nearest = Math.round(midi);
          const cents   = Math.round((midi - nearest) * 100);

          setPitch({ note: midiToNote(midi), midi: Math.round(midi * 100) / 100, cents });
        };

        source.connect(processor);
        processor.connect(audioCtx.destination);
      } catch (err) {
        console.error("Mic access failed:", err);
      }
    }

    start();

    return () => {
      try { processor?.disconnect(); source?.disconnect(); audioCtx?.close(); } catch (_) {}
      stream?.getTracks().forEach(t => t.stop());
    };
  }, []);

  return { pitch, amplitude };
}
