// Teleprompter: front camera with the script scrolling on top, so the creator reads while looking at the lens.
(() => {
  let layer = null;
  let stream = null;
  let recorder = null;
  let chunks = [];
  let frame = null;
  let playing = false;
  let speed = 1;
  let lastTime = 0;

  function scriptLines(script) {
    const lines = [];
    if (script.hook) lines.push(['Gancho', script.hook]);
    (script.scenes || []).forEach((scene, index) => lines.push([scene.moment || `Cena ${index + 1}`, scene.speech]));
    if (script.cta) lines.push(['CTA', script.cta]);
    return lines.filter(([, text]) => text);
  }

  function step(time) {
    if (!layer) return;
    const scroller = layer.querySelector('.tp-text');
    if (playing && lastTime) scroller.scrollTop += (time - lastTime) * 0.03 * speed;
    lastTime = time;
    if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) setPlaying(false);
    frame = requestAnimationFrame(step);
  }

  function setPlaying(value) {
    playing = value;
    lastTime = 0;
    layer.querySelector('.tp-play').textContent = playing ? '❚❚ Pausar' : '▶ Rolar';
  }

  async function startCamera() {
    const video = layer.querySelector('video');
    const note = layer.querySelector('.tp-note');
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true });
      video.srcObject = stream;
      note.textContent = '';
      layer.querySelector('.tp-record').disabled = typeof MediaRecorder === 'undefined';
    } catch {
      note.textContent = 'Não foi possível abrir a câmera. Você ainda pode usar o texto rolando e gravar pelo app de câmera.';
    }
  }

  function toggleRecording() {
    const button = layer.querySelector('.tp-record');
    if (recorder && recorder.state === 'recording') { recorder.stop(); return; }
    if (!stream) return;
    chunks = [];
    const type = ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find((item) => MediaRecorder.isTypeSupported?.(item)) || '';
    recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
      const link = layer.querySelector('.tp-download');
      link.href = URL.createObjectURL(blob);
      link.download = `gravacao-nivel-creator.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`;
      link.hidden = false;
      button.textContent = '● Gravar';
      button.classList.remove('recording');
    };
    recorder.start();
    button.textContent = '■ Parar';
    button.classList.add('recording');
    layer.querySelector('.tp-text').scrollTop = 0;
    setPlaying(true);
  }

  function close() {
    if (recorder && recorder.state === 'recording') recorder.stop();
    stream?.getTracks().forEach((track) => track.stop());
    cancelAnimationFrame(frame);
    layer?.remove();
    layer = null;
    stream = null;
    document.removeEventListener('keydown', onKey);
  }

  function onKey(event) {
    if (event.key === 'Escape') close();
    if (event.key === ' ') { event.preventDefault(); setPlaying(!playing); }
  }

  function open(script) {
    if (layer) close();
    speed = 1;
    layer = document.createElement('div');
    layer.className = 'tp-layer';
    layer.setAttribute('role', 'dialog');
    layer.setAttribute('aria-modal', 'true');
    layer.setAttribute('aria-label', 'Teleprompter');
    layer.innerHTML = `<video class="tp-video" autoplay playsinline muted></video>
      <div class="tp-top"><b class="tp-title"></b><button type="button" class="tp-close" aria-label="Fechar">×</button></div>
      <div class="tp-text" tabindex="0"><div class="tp-spacer"></div><div class="tp-lines"></div><div class="tp-spacer"></div></div>
      <p class="tp-note" role="status"></p>
      <div class="tp-controls">
        <button type="button" class="tp-restart" aria-label="Voltar ao início">↺</button>
        <button type="button" class="tp-slower" aria-label="Mais devagar">−</button>
        <span class="tp-speed">1x</span>
        <button type="button" class="tp-faster" aria-label="Mais rápido">+</button>
        <button type="button" class="tp-play">▶ Rolar</button>
        <button type="button" class="tp-record" disabled>● Gravar</button>
        <a class="tp-download" hidden>⇩ Baixar vídeo</a>
      </div>`;
    layer.querySelector('.tp-title').textContent = script.title || 'Roteiro';
    const box = layer.querySelector('.tp-lines');
    for (const [label, text] of scriptLines(script)) {
      const block = document.createElement('p');
      const tag = document.createElement('small');
      tag.textContent = label;
      block.append(tag, document.createTextNode(text));
      box.append(block);
    }
    const speedLabel = layer.querySelector('.tp-speed');
    const setSpeed = (value) => { speed = Math.min(3, Math.max(0.5, Math.round(value * 10) / 10)); speedLabel.textContent = `${speed}x`; };
    layer.querySelector('.tp-close').addEventListener('click', close);
    layer.querySelector('.tp-play').addEventListener('click', () => setPlaying(!playing));
    layer.querySelector('.tp-restart').addEventListener('click', () => { layer.querySelector('.tp-text').scrollTop = 0; setPlaying(false); });
    layer.querySelector('.tp-slower').addEventListener('click', () => setSpeed(speed - 0.25));
    layer.querySelector('.tp-faster').addEventListener('click', () => setSpeed(speed + 0.25));
    layer.querySelector('.tp-record').addEventListener('click', toggleRecording);
    layer.querySelector('.tp-text').addEventListener('click', () => setPlaying(!playing));
    document.body.append(layer);
    document.addEventListener('keydown', onKey);
    frame = requestAnimationFrame(step);
    startCamera();
  }

  window.openTeleprompter = open;
})();
