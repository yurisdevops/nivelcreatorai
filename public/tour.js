// Guided tour: dims the page and spotlights one element per step.
(() => {
  const STORAGE_KEY = 'nivel-tour-done-v1';
  const overviewSteps = [
    { target: '.metrics-grid', title: 'Seus números', text: 'Aqui ficam seguidores, alcance e interações do Instagram, com a variação em relação ao período anterior.' },
    { target: '.nav-link[data-view="campanhas"]', title: 'Campanhas UGC', text: 'Cadastre as marcas que você está mirando e as campanhas fechadas, com entregáveis, prazos, checklist e contatos.' },
    { target: '.nav-link[data-view="roteiros"]', title: 'Estúdio Criativo', text: 'Peça 3 ideias de conteúdo ou gere o roteiro de uma campanha a partir da sua opinião sobre o produto.' },
    { target: '.nav-link[data-view="planejamento"]', title: 'Planejamento', text: 'Monte sua semana, arraste conteúdos entre os dias e acompanhe a fila: ideia, roteiro, gravado e publicado.' },
    { target: '.nav-link[data-view="agente"]', title: 'Agente de marketing', text: 'Converse com a IA sobre o que postar, peça análises e novas ideias quando quiser.' },
    { target: '.nav-link[data-view="configuracoes"]', title: 'Configurações', text: 'Perfil, autorização da IA, assinatura e seus dados. Você pode rever este tutorial por aqui.' }
  ];
  const pageSteps = {
    inicio: [
      { target: '.metrics-grid', title: 'Seus números', text: 'Seguidores, alcance, interações e visitas do Instagram. A seta verde ou vermelha compara com o período anterior. Aparecem depois que você conecta o Instagram.' },
      { target: '.home-performance', title: 'Crescimento e parcerias', text: 'O gráfico mostra seus seguidores nos últimos 30 dias. Ao lado, quantas campanhas estão ativas, quantas você está mirando e a próxima entrega.' },
      { target: '#home-actions', title: 'Próximos passos', text: 'Depois de gerar um Diagnóstico IA, aparecem aqui 3 ações práticas. Ex.: "Criar 2 Reels com o tema rotina de UGC".' }
    ],
    campanhas: [
      { target: '#campaign-new', title: 'Nova campanha', text: 'Cadastre uma marca que você quer conquistar (etapa "Mirando") ou uma campanha já fechada. Ex.: Marca "Natura", produto "Sérum Chronos", entregáveis "1 Reels de 60s" e "3 stories".' },
      { target: '.campaign-stats', title: 'Resumo', text: 'Quantas campanhas estão em andamento, quantos entregáveis faltam e qual é o prazo mais próximo.' },
      { target: '#campaign-list', title: 'Suas campanhas', text: 'Filtre por etapa e clique numa campanha para ver os detalhes. A barra mostra quanto dos entregáveis já foi feito.' },
      { target: '#campaign-detail', title: 'Detalhes, IA e edição', text: 'Aqui ficam o briefing, os entregáveis (marque o que já entregou), o prazo e o contato da marca. Use "Gerar roteiro com IA", "Editar" ou "Excluir".' },
      { target: '#campaign-checklist-ai', title: 'Checklist com IA', text: 'A IA lê o briefing e monta as tarefas para gravar e entregar, com as exigências da marca. Ex.: "Mencionar @natura no primeiro story".' }
    ],
    roteiros: [
      { target: '.studio-bar', title: 'Seu contexto', text: 'Nicho, objetivo e formato guiam a IA. Troque o formato para Stories ou TikTok e as ideias mudam.' },
      { target: '.studio-tabs', title: 'Três jeitos de criar', text: 'Ideias: 3 sugestões a partir de um pedido. Roteiro de campanha: 3 roteiros com a sua opinião sobre o produto. Meus roteiros: tudo o que você salvou.' },
      { target: '#idea-form', title: 'Pedido rápido', text: 'Escreva o que precisa ou use um exemplo. Ex.: "3 ideias de Reels mostrando minha rotina de skincare sem promessas".' },
      { target: '#idea-grid', title: 'Ideias e roteiro', text: 'Clique em "Ver roteiro" numa ideia para receber gancho, cenas, fala e CTA. O roteiro fica salvo para você revisar.' }
    ],
    planejamento: [
      { target: '.week-summary', title: 'Sua semana', text: 'Objetivo, quantos conteúdos estão previstos e quantos já foram postados.' },
      { target: '#week-grid', title: 'Calendário da semana', text: 'Clique em "Adicionar conteúdo" num dia. Ex.: "Rotina da manhã", formato Reels, 10h. Arraste um conteúdo para outro dia para remarcar.' },
      { target: '.queue-panel', title: 'Fila de conteúdo', text: 'Cada conteúdo passa por Ideia, Em roteiro, Gravado e Publicado. Arraste o cartão entre as colunas ou use o botão da próxima etapa.' },
      { target: '#plan-form', title: 'Plano com IA', text: 'A IA monta uma semana de pautas a partir do seu objetivo. Ex.: "Mostrar minha rotina de skincare sem promessas de resultado". Depois mande o plano para o calendário.' }
    ],
    mediakit: [
      { target: '#mk-slug', title: 'Seu link', text: 'Escolha o endereço da sua página. Ex.: "marianacosta" vira creator.nivelstudio.com.br/kit/marianacosta.' },
      { target: '#mk-bio', title: 'Bio e destaques', text: 'Conte o que você faz e para quem. Ex.: "Criadora UGC de beleza. Vídeos naturais, do jeito que eu uso no dia a dia."' },
      { target: '#mk-published', title: 'Publicar', text: 'Marque para deixar a página no ar e mande o link para as marcas. Desmarque quando quiser tirar do ar.' }
    ],
    agente: [
      { target: '#agent-input', title: 'Seu agente de marketing', text: 'Pergunte como para uma pessoa. Ex.: "O que posso postar essa semana sobre skincare?" ou "Como responder uma marca que pediu desconto?"' }
    ],
    configuracoes: [
      { target: '.settings-tabs', title: 'Configurações', text: 'Perfil (nicho, objetivo, voz e autorização da IA), segurança da conta, assinatura e seus dados.' },
      { target: '#settings-profile-form', title: 'Perfil', text: 'Quanto mais claro o tom de voz, melhores os roteiros. Use os exemplos clicáveis como ponto de partida.' }
    ]
  };
  let steps = overviewSteps;
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
    if (done && steps === overviewSteps) { try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* Storage may be unavailable. */ } }
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
      target.scrollIntoView({ block: 'nearest', behavior: 'instant' });
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

  function currentPage() {
    const open = [...document.querySelectorAll('.studio-view')].find((view) => !view.hidden);
    return open ? open.id.replace('view-', '') : 'inicio';
  }

  function start(page = null) {
    if (layer) close(false);
    steps = page ? (pageSteps[page] || overviewSteps).filter((step) => visible(document.querySelector(step.target)) || step.target.startsWith('.nav-link')) : overviewSteps;
    if (!steps.length) steps = overviewSteps;
    if (!page) document.querySelector('.nav-link[data-view="inicio"]')?.click();
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
    if (event.target.closest('[data-page-guide]')) { event.preventDefault(); start(currentPage()); }
  });
})();
