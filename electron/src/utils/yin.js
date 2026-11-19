// YIN fundamental frequency estimator
// De Cheveigné & Kawahara (2002) — same algorithm as librosa.yin

const THRESHOLD = 0.15;

export function yin(buffer, sampleRate, fmin = 65.4, fmax = 2093) {
  const half = Math.floor(buffer.length / 2);
  const tauMin = Math.max(1, Math.floor(sampleRate / fmax));
  const tauMax = Math.min(half - 1, Math.floor(sampleRate / fmin));

  // Step 2: difference function
  const diff = new Float32Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) {
    for (let j = 0; j < half; j++) {
      const d = buffer[j] - buffer[j + tau];
      diff[tau] += d * d;
    }
  }

  // Step 3: cumulative mean normalized difference
  const cmnd = new Float32Array(tauMax + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    running += diff[tau];
    cmnd[tau] = running === 0 ? 0 : diff[tau] * tau / running;
  }

  // Step 4: absolute threshold — first dip below THRESHOLD
  let tau = tauMin;
  while (tau <= tauMax) {
    if (cmnd[tau] < THRESHOLD) {
      while (tau + 1 <= tauMax && cmnd[tau + 1] < cmnd[tau]) tau++;
      break;
    }
    tau++;
  }
  if (tau > tauMax || cmnd[tau] >= THRESHOLD) return null;

  // Step 5: parabolic interpolation for sub-sample precision
  let best = tau;
  if (tau > 1 && tau < tauMax) {
    const s0 = cmnd[tau - 1], s1 = cmnd[tau], s2 = cmnd[tau + 1];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (denom !== 0) best = tau + (s2 - s0) / denom;
  }

  return sampleRate / best;
}

export function rms(buffer) {
  let s = 0;
  for (let i = 0; i < buffer.length; i++) s += buffer[i] * buffer[i];
  return Math.sqrt(s / buffer.length);
}
