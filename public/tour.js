// Guided tour: dims the page and spotlights one element per step.
(() => {
  const STORAGE_KEY = 'nivel-tour-done-v1';
  const steps = [
    { target: '.metrics-grid', title: 'Seus números', text: 'Aqui ficam seguidores, alcance e interações do Instagram, com a variação em relação ao período anterior.' },
    { target: '.nav-link[data-view="campanhas"]', title: 'Campanhas UGC', text: 'Cadastre as marcas que você está mirando e as campanhas fechadas, com entregáveis, prazos, checklist e contatos.' },
    { target: '.nav-link[data-view="roteiros"]', title: 'Estúdio Criativo', text: 'Peça 3 ideias de conteúdo ou gere o roteiro de uma campanha a partir da sua opinião sobre o produto.' },
    { target: '.nav-link[data-view="planejamento"]', title: 'Planejamento', text: 'Monte sua semana, arraste conteúdos entre os dias e acompanhe a fila: ideia, roteiro, gravado e publicado.' },
    { target: '.nav-link[data-view="agente"]', title: 'Agente de marketing', text: 'Converse com a IA sobre o que postar, peça análises e novas ideias quando quiser.' },
    { target: '.nav-link[data-view="configuracoes"]', title: 'Configurações', text: 'Perfil, autorização da IA, assinatura e seus dados. Você pode rever este tutorial por aqui.' }
  ];
  let index = 0;
  let layer = null;

  function visible(element) {
    if (!element) return false;
    const box = element.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  }

  function close(done = true) {
    if (layer) layer.remove();
    layer = null;
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', place);
    if (done) { try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* Storage may be unavailable. */ } }
  }

  function onKey(event) {
    if (event.key === 'Escape') close();
    if (event.key === 'ArrowRight') go(1);
    if (event.key === 'ArrowLeft') go(-1);
  }

  function go(delta) {
    index += delta;
    if (index >= steps.length) { close(); return; }
    if (index < 0) index = 0;
    render();
  }

  function place() {
    if (!layer) return;
    const step = steps[index];
    let target = document.querySelector(step.target);
    // On phones the side menu is hidden, so point to the "Mais" tab instead.
    if (!visible(target)) target = document.querySelector('#mobile-more');
    const spot = layer.querySelector('.tour-spot');
    const card = layer.querySelector('.tour-card');
    // Use the target's box, not the spotlight's, which is still animating towards it.
    let spotBox = { left: window.innerWidth / 2, top: window.innerHeight * 0.4, width: 0, height: 0 };
    if (visible(target)) {
      target.scrollIntoView({ block: 'nearest' });
      const box = target.getBoundingClientRect();
      const pad = 8;
      spotBox = { left: box.left - pad, top: box.top - pad, width: box.width + pad * 2, height: box.height + pad * 2 };
    }
    spotBox.right = spotBox.left + spotBox.width;
    spotBox.bottom = spotBox.top + spotBox.height;
    spot.style.cssText = `left:${spotBox.left}px;top:${spotBox.top}px;width:${spotBox.width}px;height:${spotBox.height}px`;
    // Blur everything except the highlighted area by cutting a hole in the blur layer.
    const w = window.innerWidth, h = window.innerHeight;
    const hole = spotBox.width ? `M${spotBox.left} ${spotBox.top} h${spotBox.width} v${spotBox.height} h-${spotBox.width} Z` : '';
    layer.querySelector('.tour-blur').style.clipPath = `path(evenodd, 'M0 0 H${w} V${h} H0 Z ${hole}')`;
    const cardWidth = Math.min(340, window.innerWidth - 32);
    card.style.width = `${cardWidth}px`;
    let left = spotBox.right + 16;
    let top = spotBox.top;
    if (left + cardWidth > window.innerWidth - 16) {
      left = Math.max(16, Math.min(spotBox.left, window.innerWidth - cardWidth - 16));
      top = spotBox.bottom + 16;
    }
    const cardHeight = card.offsetHeight || 180;
    if (top + cardHeight > window.innerHeight - 16) top = Math.max(16, spotBox.top - cardHeight - 16);
    card.style.left = `${left}px`;
    card.style.top = `${Math.max(16, top)}px`;
  }

  function render() {
    const step = steps[index];
    layer.querySelector('.tour-count').textContent = `${index + 1} de ${steps.length}`;
    layer.querySelector('.tour-title').textContent = step.title;
    layer.querySelector('.tour-text').textContent = step.text;
    layer.querySelector('.tour-back').hidden = index === 0;
    layer.querySelector('.tour-next').textContent = index === steps.length - 1 ? 'Concluir' : 'Próximo →';
    place();
    layer.querySelector('.tour-next').focus();
  }

  function start() {
    if (layer) close(false);
    document.querySelector('.nav-link[data-view="inicio"]')?.click();
    index = 0;
    layer = document.createElement('div');
    layer.className = 'tour-layer';
    layer.setAttribute('role', 'dialog');
    layer.setAttribute('aria-modal', 'true');
    layer.setAttribute('aria-label', 'Tutorial do Nível Creator');
    layer.innerHTML = '<div class="tour-blur"></div><div class="tour-spot"></div><section class="tour-card"><small class="tour-count"></small><h2 class="tour-title"></h2><p class="tour-text"></p><div class="tour-actions"><button type="button" class="tour-skip">Pular</button><span></span><button type="button" class="tour-back">← Voltar</button><button type="button" class="tour-next">Próximo →</button></div></section>';
    layer.querySelector('.tour-skip').addEventListener('click', () => close());
    layer.querySelector('.tour-back').addEventListener('click', () => go(-1));
    layer.querySelector('.tour-next').addEventListener('click', () => go(1));
    document.body.append(layer);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    render();
  }

  window.startNivelTour = start;
  window.maybeStartNivelTour = () => {
    let done = false;
    try { done = localStorage.getItem(STORAGE_KEY) === '1'; } catch { done = true; }
    if (!done && !document.querySelector('dialog[open]')) start();
  };
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-start-tour]')) { event.preventDefault(); start(); }
  });
})();
