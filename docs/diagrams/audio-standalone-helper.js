// Audio Standalone Helper for Archify Diagrams
// Automatically shows a floating narration HUD if the diagram is opened directly (outside the iframe)
(function() {
  if (window.self !== window.top) {
    // We are inside index.html iframe; the parent index.html controls the narration
    return;
  }

  const AUDIO_MAP = {
    'c4-containers': {
      audio: 'audio/c4-containers.mp3',
      title: 'C4 Arquitectura de Contenedores'
    },
    'user-journey-sequence': {
      audio: 'audio/user-journey-sequence.mp3',
      title: 'Handshake Criptográfico QR & NFC'
    },
    'modelo-datos-erd': {
      audio: 'audio/modelo-datos-erd.mp3',
      title: 'Modelo de Datos Relacional ERD'
    },
    'distribucion-movil-twa': {
      audio: 'audio/distribucion-movil-twa.mp3',
      title: 'Distribución Móvil Dual TWA & PWA'
    }
  };

  const path = window.location.pathname;
  let matchedConfig = null;
  for (const [key, conf] of Object.entries(AUDIO_MAP)) {
    if (path.includes(key)) {
      matchedConfig = conf;
      break;
    }
  }

  if (!matchedConfig) {
    matchedConfig = AUDIO_MAP['c4-containers'];
  }

  // Create floating HUD
  const style = document.createElement('style');
  style.textContent = `
    .archify-floating-audio-hud {
      position: fixed;
      top: 14px;
      right: 18px;
      z-index: 999999;
      display: inline-flex;
      align-items: center;
      gap: 0.65rem;
      background: rgba(15, 23, 42, 0.88);
      border: 1px solid rgba(56, 189, 248, 0.4);
      padding: 0.35rem 0.85rem;
      border-radius: 9999px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(12px);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #f8fafc;
    }
    .archify-floating-audio-hud button {
      cursor: pointer;
    }
    .archify-play-btn {
      background: linear-gradient(135deg, #0284c7, #2563eb);
      color: white;
      border: none;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 0 10px rgba(2, 132, 199, 0.4);
      transition: all 0.2s ease;
    }
    .archify-play-btn:hover {
      transform: scale(1.08);
      box-shadow: 0 0 16px rgba(2, 132, 199, 0.7);
    }
    .archify-audio-waves {
      display: flex;
      align-items: center;
      gap: 3px;
      height: 14px;
    }
    .archify-audio-bar {
      width: 3px;
      height: 4px;
      background: #38bdf8;
      border-radius: 2px;
      transition: height 0.2s ease;
    }
    .archify-floating-audio-hud.playing .archify-audio-bar {
      animation: archifySoundWave 1.2s infinite ease-in-out;
    }
    .archify-floating-audio-hud.playing .archify-audio-bar:nth-child(1) { animation-delay: 0.0s; }
    .archify-floating-audio-hud.playing .archify-audio-bar:nth-child(2) { animation-delay: 0.2s; }
    .archify-floating-audio-hud.playing .archify-audio-bar:nth-child(3) { animation-delay: 0.4s; }
    .archify-floating-audio-hud.playing .archify-audio-bar:nth-child(4) { animation-delay: 0.1s; }
    @keyframes archifySoundWave {
      0%, 100% { height: 3px; }
      50% { height: 14px; }
    }
    .archify-audio-label {
      font-size: 0.76rem;
      font-weight: 600;
      color: #94a3b8;
    }
    .archify-audio-label strong {
      color: #38bdf8;
    }
    .archify-time-badge {
      font-family: monospace;
      font-size: 0.72rem;
      color: #38bdf8;
      background: rgba(56, 189, 248, 0.12);
      border: 1px solid rgba(56, 189, 248, 0.2);
      padding: 0.15rem 0.45rem;
      border-radius: 6px;
    }
    .archify-rate-btn {
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #94a3b8;
      border-radius: 6px;
      font-size: 0.7rem;
      font-family: monospace;
      padding: 0.15rem 0.35rem;
    }
    .archify-back-btn {
      background: rgba(30, 41, 59, 0.8);
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #e2e8f0;
      border-radius: 6px;
      font-size: 0.72rem;
      padding: 0.2rem 0.5rem;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
    }
    .archify-back-btn:hover {
      background: #24344d;
      color: #38bdf8;
      border-color: #38bdf8;
    }
  `;
  document.head.appendChild(style);

  const hud = document.createElement('div');
  hud.className = 'archify-floating-audio-hud';
  hud.innerHTML = `
    <button id="sa-play-btn" class="archify-play-btn" title="Reproducir / Pausar Narración">
      <svg id="sa-play-icon" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
      <svg id="sa-pause-icon" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="display:none;"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
    </button>
    <div class="archify-audio-waves">
      <span class="archify-audio-bar"></span>
      <span class="archify-audio-bar"></span>
      <span class="archify-audio-bar"></span>
      <span class="archify-audio-bar"></span>
    </div>
    <div class="archify-audio-label">
      Voz Neuronal: <strong>${matchedConfig.title}</strong>
    </div>
    <span id="sa-time-badge" class="archify-time-badge">0:00 / 0:00</span>
    <button id="sa-rate-btn" class="archify-rate-btn" title="Velocidad">1.0x</button>
    <a href="index.html" class="archify-back-btn" title="Volver al Centro de Diagramas">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
      Centro Hub
    </a>
  `;

  const audio = document.createElement('audio');
  audio.src = matchedConfig.audio;
  audio.preload = 'metadata';

  document.body.appendChild(hud);
  document.body.appendChild(audio);

  const playBtn = hud.querySelector('#sa-play-btn');
  const playIcon = hud.querySelector('#sa-play-icon');
  const pauseIcon = hud.querySelector('#sa-pause-icon');
  const timeBadge = hud.querySelector('#sa-time-badge');
  const rateBtn = hud.querySelector('#sa-rate-btn');
  const rates = [1.0, 1.25, 1.5];
  let rateIdx = 0;

  function fmt(sec) {
    if (!sec || isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  function setUI(playing) {
    if (playing) {
      hud.classList.add('playing');
      playIcon.style.display = 'none';
      pauseIcon.style.display = 'block';
    } else {
      hud.classList.remove('playing');
      playIcon.style.display = 'block';
      pauseIcon.style.display = 'none';
    }
  }

  playBtn.addEventListener('click', () => {
    if (audio.paused) {
      audio.play().then(() => setUI(true)).catch(() => setUI(false));
    } else {
      audio.pause();
      setUI(false);
    }
  });

  rateBtn.addEventListener('click', () => {
    rateIdx = (rateIdx + 1) % rates.length;
    audio.playbackRate = rates[rateIdx];
    rateBtn.textContent = `${rates[rateIdx].toFixed(1).replace('.0', '')}x`;
  });

  audio.addEventListener('timeupdate', () => {
    timeBadge.textContent = `${fmt(audio.currentTime)} / ${fmt(audio.duration)}`;
  });
  audio.addEventListener('ended', () => {
    setUI(false);
    timeBadge.textContent = `0:00 / ${fmt(audio.duration)}`;
  });
  audio.addEventListener('loadedmetadata', () => {
    timeBadge.textContent = `0:00 / ${fmt(audio.duration)}`;
  });
})();

