// ============================================================================
// CORE: WEB AUDIO & INDUSTRIAL HAPTIC SYNTHESIZER
// Diseñado para operadores de almacén en entornos ruidosos y terminales móviles
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

// Desbloqueo inicial al primer click o toque del operador
window.addEventListener('pointerdown', () => {
  getAudioContext();
}, { once: true });

/**
 * Disparador de Vibración Háptica Industrial (Táctil)
 * Calibrado para operadores con guantes y terminales rugged (Zebra, Honeywell, móviles)
 */
window.triggerHaptic = function(pattern = 'success') {
  try {
    if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;

    if (pattern === 'tick' || pattern === 'tap') {
      // Micro-pulso imperceptible para confirmación de toque en pantalla (18ms)
      navigator.vibrate(18);
    } else if (pattern === 'success') {
      // Pulso firme de confirmación estándar (70ms)
      navigator.vibrate(70);
    } else if (pattern === 'delivery_approved' || pattern === 'heavy') {
      // Pulso doble de alta confirmación para despacho exitoso en almacén ruidoso
      navigator.vibrate([90, 40, 110]);
    } else if (pattern === 'warning') {
      // Pulso doble preventivo (70ms - 40ms - 70ms)
      navigator.vibrate([70, 40, 70]);
    } else if (pattern === 'error' || pattern === 'blocked' || pattern === 'duplicate') {
      // Triple pulso intenso y prolongado para alerta de beneficio duplicado / no autorizado
      navigator.vibrate([160, 50, 160, 50, 180]);
    } else if (Array.isArray(pattern)) {
      navigator.vibrate(pattern);
    } else if (typeof pattern === 'number') {
      navigator.vibrate(pattern);
    }
  } catch (err) {
    // Silencioso si el navegador o hardware no soporta vibración
  }
};

/**
 * Síntesis Acústica Sub-segundo con Web Audio API + Feedback Háptico Sincronizado
 */
window.playAudioFeedback = function(type = 'success') {
  // 1. Ejecutar vibración háptica sincronizada
  window.triggerHaptic(type);

  // 2. Síntesis Acústica de Alta Fidelidad
  try {
    const audioCtx = getAudioContext();
    if (!audioCtx) return;

    const now = audioCtx.currentTime;

    if (type === 'tick' || type === 'tap') {
      // Micro-click sutil (1200Hz por 25ms)
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, now);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
      osc.start(now);
      osc.stop(now + 0.025);

    } else if (type === 'delivery_approved' || type === 'heavy') {
      // Acorde triunfal ministerial: Arpegio C5 -> E5 -> G5 -> C6
      const freqs = [523.25, 659.25, 783.99, 1046.50];
      freqs.forEach((freq, idx) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        const noteStart = now + idx * 0.045;
        const noteDuration = 0.28;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, noteStart);
        gain.gain.setValueAtTime(0.001, noteStart);
        gain.gain.linearRampToValueAtTime(0.28, noteStart + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, noteStart + noteDuration);

        osc.start(noteStart);
        osc.stop(noteStart + noteDuration);
      });

    } else if (type === 'success') {
      // Chime sub-segundo estándar (G5 784Hz -> C6 1046.5Hz en 180ms)
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(784, now);
      osc.frequency.exponentialRampToValueAtTime(1046.5, now + 0.08);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc.start(now);
      osc.stop(now + 0.22);

    } else if (type === 'warning') {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, now); // C5
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.20);

      osc.start(now);
      osc.stop(now + 0.20);

    } else {
      // Tono de anomalía / duplicado bloqueado: Frecuencia baja dual tipo buzz (220Hz -> 146Hz)
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

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

