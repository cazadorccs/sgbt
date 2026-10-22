// ============================================================================
// CORE: WEB AUDIO & HAPTIC SYNTHESIZER (SUB-SEGUNDO & FEEDBACK TÁCTIL)
// ============================================================================

let sharedAudioCtx = null;

function getAudioContext() {
  if (!sharedAudioCtx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      sharedAudioCtx = new AudioCtx();
    }
  }
  if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

// Desbloqueo inicial al primer click o toque del usuario
window.addEventListener('pointerdown', () => {
  getAudioContext();
}, { once: true });

window.playAudioFeedback = function(type = 'success') {
  // 1. Feedback Háptico Sub-segundo (Vibración física en smartphones y terminales Android/iOS)
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      if (type === 'success') {
        // Vibración corta de confirmación (80ms - feedback táctil tipo escáner POS)
        navigator.vibrate(80);
      } else if (type === 'error') {
        // Doble pulso de alerta rejected (120ms - pausa - 120ms)
        navigator.vibrate([120, 60, 120]);
      } else if (type === 'warning') {
        navigator.vibrate(50);
      }
    }
  } catch (vibErr) {
    // Silencioso en navegadores sin permisos o hardware sin motor háptico
  }

  // 2. Síntesis Acústica Sub-segundo con Web Audio API
  try {
    const audioCtx = getAudioContext();
    if (!audioCtx) return;

    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'success') {
      // Chime sub-segundo de alta fidelidad (G5 784Hz -> C6 1046.5Hz en 180ms)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(784, now);
      osc.frequency.exponentialRampToValueAtTime(1046.5, now + 0.08);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc.start(now);
      osc.stop(now + 0.22);

    } else if (type === 'warning') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, now); // C5
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.20);

      osc.start(now);
      osc.stop(now + 0.20);

    } else {
      // Tono de anomalía / duplicado bloqueado: Frecuencia baja dual tipo buzz (220Hz -> 146Hz en 250ms)
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.linearRampToValueAtTime(146.83, now + 0.12);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

      osc.start(now);
      osc.stop(now + 0.26);
    }
  } catch (e) {
    console.warn('AudioContext no disponible o bloqueado por el navegador:', e);
  }
};
