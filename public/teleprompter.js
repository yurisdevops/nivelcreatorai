// Teleprompter: front camera full screen and the script in a band at the bottom, one scene at a time,
// so the text never covers the creator's face.
(() => {
  let layer = null;
  let stream = null;
  let recorder = null;
  let chunks = [];
  let timer = null;
  let playing = false;
  let speed = 1;
  let scenes = [];
  let current = 0;
  let sceneStartedAt = 0;
  let elapsedBefore = 0;

  function scriptScenes(script) {
    const list = [];
    if (script.hook) list.push(['Gancho', script.hook]);
    (script.scenes || []).forEach((scene, index) => list.push([scene.moment || `Cena ${index + 1}`, scene.speech]));
    if (script.cta) list.push(['CTA', script.cta]);
    return list.filter(([, text]) => text && String(text).trim());
  }

  // About 2.5 spoken words per second at 1x, with a small pause between scenes.
  function sceneDuration(text) {
    const words = String(text).trim().split(/\s+/).length;
    return Math.max(2500, (words / (2.5 * speed)) * 1000 + 600);
  }

  function renderScene() {
    const [label, text] = scenes[current] || ['', ''];
    layer.querySelector('.tp-label').textContent = `${label} · ${current + 1} de ${scenes.length}`;
    layer.querySelector('.tp-line').textContent = text;
    const next = scenes[current + 1];
    layer.querySelector('.tp-next-line').textContent = next ? `Próxima: ${next[1]}` : 'Última cena';
    layer.querySelector('.tp-progress i').style.width = '0%';
  }

  function tick() {
    if (!layer || !playing) return;
    const elapsed = elapsedBefore + (performance.now() - sceneStartedAt);
    const total = sceneDuration(scenes[current][1]);
    layer.querySelector('.tp-progress i').style.width = `${Math.min(100, (elapsed / total) * 100)}%`;
    if (elapsed >= total) {
      if (current < scenes.length - 1) { goTo(current + 1, true); }
      else { setPlaying(false); return; }
    }
    timer = requestAnimationFrame(tick);
  }

  function goTo(index, keepPlaying = playing) {
    current = Math.max(0, Math.min(scenes.length - 1, index));
    elapsedBefore = 0;
    sceneStartedAt = performance.now();
    renderScene();
    if (keepPlaying && !playing) setPlaying(true);
  }

  function setPlaying(value) {
    if (value && !playing) { sceneStartedAt = performance.now(); }
    if (!value && playing) { elapsedBefore += performance.now() - sceneStartedAt; }
    playing = value;
    layer.querySelector('.tp-play').textContent = playing ? '❚❚' : '▶';
    layer.querySelector('.tp-play').setAttribute('aria-label', playing ? 'Pausar' : 'Começar');
    cancelAnimationFrame(timer);
    if (playing) timer = requestAnimationFrame(tick);
  }

  async function startCamera() {
    const video = layer.querySelector('video');
    const note = layer.querySelector('.tp-note');
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1080 }, height: { ideal: 1920 } },
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      video.srcObject = stream;
      note.textContent = stream.getAudioTracks().length ? '' : 'O microfone não foi liberado: o vídeo vai gravar sem som.';
      layer.querySelector('.tp-record').disabled = typeof MediaRecorder === 'undefined';
    } catch {
      try {
        // Retry with camera only, so the creator can still use the prompter if the microphone is blocked.
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        video.srcObject = stream;
        note.textContent = 'O microfone está bloqueado. Libere no cadeado ao lado do endereço para gravar com som.';
        layer.querySelector('.tp-record').disabled = typeof MediaRecorder === 'undefined';
      } catch {
        note.textContent = 'Não foi possível abrir a câmera. Libere câmera e microfone no cadeado ao lado do endereço do site.';
      }
    }
  }

  function recordingType() {
    // Explicit audio codecs: some browsers drop the sound with a bare "video/mp4" or "video/webm".
    const options = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=h264,aac', 'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus', 'video/mp4', 'video/webm'];
    return options.find((type) => window.MediaRecorder?.isTypeSupported?.(type)) || '';
  }

  function toggleRecording() {
    const button = layer.querySelector('.tp-record');
    if (recorder && recorder.state === 'recording') { recorder.stop(); return; }
    if (!stream) return;
    chunks = [];
    const type = recordingType();
    recorder = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 128000 } : undefined);
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
      const link = layer.querySelector('.tp-download');
      link.href = URL.createObjectURL(blob);
      link.download = `gravacao-nivel-creator.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`;
      link.hidden = false;
      button.textContent = '● Gravar';
      button.classList.remove('recording');
      setPlaying(false);
    };
    recorder.start(1000);
    button.textContent = '■ Parar';
    button.classList.add('recording');
    layer.querySelector('.tp-download').hidden = true;
    goTo(0);
    setPlaying(true);
  }

  function close() {
    if (recorder && recorder.state === 'recording') recorder.stop();
    stream?.getTracks().forEach((track) => track.stop());
    cancelAnimationFrame(timer);
    layer?.remove();
    layer = null;
    stream = null;
    playing = false;
    document.removeEventListener('keydown', onKey);
  }

  function onKey(event) {
    if (event.key === 'Escape') close();
    if (event.key === ' ') { event.preventDefault(); setPlaying(!playing); }
    if (event.key === 'ArrowRight') goTo(current + 1);
    if (event.key === 'ArrowLeft') goTo(current - 1);
  }

  function open(script) {
    if (layer) close();
    scenes = scriptScenes(script);
    if (!scenes.length) return;
    speed = 1;
    current = 0;
    elapsedBefore = 0;
    playing = false;
    layer = document.createElement('div');
    layer.className = 'tp-layer';
    layer.setAttribute('role', 'dialog');
    layer.setAttribute('aria-modal', 'true');
    layer.setAttribute('aria-label', 'Teleprompter');
    layer.innerHTML = `<video class="tp-video" autoplay playsinline muted></video>
      <div class="tp-top"><b class="tp-title"></b><button type="button" class="tp-close" aria-label="Fechar">×</button></div>
      <div class="tp-band">
        <p class="tp-note" role="status"></p>
        <div class="tp-progress"><i></i></div>
        <small class="tp-label"></small>
        <p class="tp-line" aria-live="polite"></p>
        <p class="tp-next-line"></p>
        <div class="tp-controls">
          <button type="button" class="tp-prev" aria-label="Cena anterior">⏮</button>
          <button type="button" class="tp-slower" aria-label="Mais devagar">−</button>
          <button type="button" class="tp-play" aria-label="Começar">▶</button>
          <button type="button" class="tp-faster" aria-label="Mais rápido">+</button>
          <button type="button" class="tp-next" aria-label="Próxima cena">⏭</button>
          <span class="tp-speed">1x</span>
          <button type="button" class="tp-mirror" aria-pressed="false" title="Espelhar a imagem (só na tela)">⇋</button>
          <button type="button" class="tp-record" disabled>● Gravar</button>
          <a class="tp-download" hidden>⇩ Baixar</a>
        </div>
      </div>`;
    layer.querySelector('.tp-title').textContent = script.title || 'Roteiro';
    const speedLabel = layer.querySelector('.tp-speed');
    const setSpeed = (value) => { speed = Math.min(2.5, Math.max(0.5, Math.round(value * 100) / 100)); speedLabel.textContent = `${speed}x`; };
    // The preview matches the saved video by default; mirroring is optional and only changes the screen.
    layer.querySelector('.tp-mirror').addEventListener('click', (event) => {
      const mirrored = layer.classList.toggle('mirrored');
      event.currentTarget.setAttribute('aria-pressed', String(mirrored));
    });
    layer.querySelector('.tp-close').addEventListener('click', close);
    layer.querySelector('.tp-play').addEventListener('click', () => setPlaying(!playing));
    layer.querySelector('.tp-prev').addEventListener('click', () => goTo(current - 1));
    layer.querySelector('.tp-next').addEventListener('click', () => goTo(current + 1));
    layer.querySelector('.tp-slower').addEventListener('click', () => setSpeed(speed - 0.25));
    layer.querySelector('.tp-faster').addEventListener('click', () => setSpeed(speed + 0.25));
    layer.querySelector('.tp-record').addEventListener('click', toggleRecording);
    layer.querySelector('.tp-line').addEventListener('click', () => setPlaying(!playing));
    document.body.append(layer);
    document.addEventListener('keydown', onKey);
    renderScene();
    startCamera();
  }

  window.openTeleprompter = open;
})();
