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
  const tab = (selector) => () => document.querySelector(selector)?.click();
  const pageSteps = {
    inicio: [
      { target: '.welcome-row', title: 'Seu painel', text: 'O Início junta tudo num lugar: seus números do Instagram, campanhas, próximos conteúdos e o que a IA sugere fazer agora.' },
      { target: '.instagram-heading', title: 'Conectar o Instagram', text: 'Clique em "Conectar Instagram" e entre com a sua conta profissional. Os números passam a ser coletados sozinhos todo dia. Você pode desconectar quando quiser.' },
      { target: '.metrics-grid', title: 'Seus 5 números', text: 'Seguidores, alcance (quantas contas viram), visualizações, interações (curtidas, comentários, salvamentos e compartilhamentos) e visitas ao perfil, sempre dos últimos 30 dias. A seta verde ou vermelha compara com o período anterior.' },
      { target: '#home-chart', title: 'Crescimento', text: 'O gráfico mostra seus seguidores dia a dia. Ele começa a desenhar a partir do segundo dia de coleta.' },
      { target: '#home-campaigns', title: 'Suas parcerias', text: 'Quantas campanhas estão ativas, quantas marcas você está mirando, os entregáveis pendentes, a próxima entrega e se há algo atrasado.' },
      { target: '#home-actions', title: 'Resumo da IA', text: 'Toda semana a IA lê seus números e mostra aqui o ponto forte, o ponto fraco e 3 ações práticas. Ex.: "Poste 2 Reels de rotina; eles tiveram 2x mais alcance".' },
      { target: '#home-upcoming', title: 'Próximos conteúdos', text: 'Os próximos conteúdos agendados no Planejamento. Clique no + para adicionar um.' },
      { target: '.page-guide', title: 'Ajuda em cada página', text: 'Em qualquer tela, toque neste "?" para ver de novo o que dá para fazer nela.' }
    ],
    diagnostico: [
      { target: '#view-diagnostico .studio-heading', title: 'Diagnóstico IA', text: 'Uma análise do seu perfil feita pela IA a partir dos seus números reais do Instagram. Ela não inventa dados: se faltar métrica, ela avisa.' },
      { target: '.diagnostic-evidence', title: 'Base da análise', text: 'Mostra quais números estão disponíveis. Com o Instagram conectado e pelo menos 1 dia de coleta, o botão fica liberado.' },
      { target: '#run-diagnostic', title: 'Gerar diagnóstico', text: 'Clique para receber: pontos fortes, o que está travando seu crescimento e oportunidades, cada um com a evidência usada. Ex.: "Alcance subiu 12%, mas as visitas ao perfil caíram: falta chamada para o perfil no fim dos vídeos".' },
      { target: '#diagnostic-list', title: 'Histórico', text: 'Todos os diagnósticos ficam salvos aqui para você comparar a evolução mês a mês. As 3 ações do mais recente também aparecem no Início.' }
    ],
    roteiros: [
      { target: '.studio-bar', title: 'Seu contexto', text: 'Nicho, objetivo e formato guiam tudo o que a IA cria. Troque o formato para Stories ou TikTok e as ideias se adaptam.' },
      { target: '.studio-tabs', title: 'Três jeitos de criar', text: 'Ideias: sugestões a partir de um pedido. Roteiro de campanha: 3 roteiros a partir da sua opinião sobre um produto. Meus roteiros: tudo o que você salvou.' },
      { target: '#idea-form', before: tab('[data-studio-tab="ideas"]'), title: 'Pedido rápido', text: 'Escreva o que precisa ou clique num exemplo. Ex.: "3 ideias de Reels mostrando minha rotina de skincare sem promessas". Pode deixar em branco: a IA usa seu nicho e objetivo.' },
      { target: '#idea-grid', before: tab('[data-studio-tab="ideas"]'), title: 'Ideias sugeridas', text: 'A IA traz 3 ideias diferentes. Em cada uma, "Ver roteiro" escreve o roteiro completo: gancho, cenas com fala, CTA, legenda e hashtags.' },
      { target: '#campaign-script-form', before: tab('[data-studio-tab="campaign"]'), title: 'Roteiro de campanha', text: 'Escolha a campanha e conte com as suas palavras o que achou do produto. A IA escreve 3 roteiros com ângulos diferentes (review, antes e depois, rotina...) e nunca inventa benefícios que você não relatou.' },
      { target: '#selected-script-panel', title: 'Roteiro selecionado', text: 'O roteiro aparece em 3 partes. "Copiar roteiro" leva o texto para onde quiser e "Gravar com teleprompter" abre a câmera com o texto rolando para você ler olhando para a lente.' },
      { target: '#script-list', before: tab('[data-studio-tab="saved"]'), title: 'Meus roteiros', text: 'Todos os roteiros ficam salvos aqui, fechados. Clique no título para abrir e use "Excluir" no que não for usar.', after: tab('[data-studio-tab="ideas"]') }
    ],
    planejamento: [
      { target: '.week-nav', title: 'Escolha a semana', text: 'Use as setas para ir para a semana anterior ou a próxima. "Hoje" volta para a semana atual.' },
      { target: '.week-summary', title: 'Resumo da semana', text: 'O objetivo (vem do último plano da IA), quantos conteúdos estão previstos e quantos já foram postados, com barra de progresso.' },
      { target: '#week-grid', title: 'Calendário da semana', text: 'Clique em "+ Adicionar conteúdo" em um dia. Ex.: "Rotina da manhã", formato Reels, 10h. Arraste um cartão para outro dia para remarcar, ou use o × para excluir.' },
      { target: '#week-steps', title: 'Plano da semana', text: 'Os 4 passos se marcam sozinhos conforme você avança: definir temas, gravar, agendar e acompanhar os resultados.' },
      { target: '.queue-panel', title: 'Fila de conteúdo', text: 'Cada conteúdo passa por Ideia, Em roteiro, Gravado e Publicado. Arraste o cartão para a próxima coluna (ou toque no botão de etapa no celular). Os filtros mostram uma coluna por vez.' },
      { target: '#plan-form', title: 'Plano com IA', text: 'Escreva o foco da semana e escolha a data de início. A IA monta 7 pautas com gancho e CTA. Ex.: "Mostrar minha rotina de skincare sem promessas de resultado".' },
      { target: '#plan-list', title: 'Planos salvos', text: 'Revise as pautas e clique em "Adicionar semana ao calendário" para que elas apareçam na grade. "Excluir plano" apaga só o plano; o que já foi para o calendário continua lá.' }
    ],
    calendario: [
      { target: '#calendar-form', title: 'Reservar um espaço', text: 'Anote uma ideia com título, formato e, se quiser, data, horário e observações. Ex.: "Bastidores da gravação", Stories, sexta 18h.' },
      { target: '#calendar-list', title: 'Da ideia à publicação', text: 'Todos os seus conteúdos em ordem de data. Mude a etapa de cada um (Ideia, Em roteiro, Pronto para gravar, Gravado, Aprovado, Publicado). Para ver a semana em grade e arrastar, use o Planejamento.' }
    ],
    campanhas: [
      { target: '#campaign-new', title: 'Nova campanha', text: 'Cadastre uma marca que você quer conquistar (etapa "Mirando") ou uma campanha já fechada. Ex.: Marca "Natura", produto "Sérum Chronos", entregáveis "1 Reels de 60s" e "3 stories", prazo, briefing e o contato da marca.' },
      { target: '.campaign-stats', title: 'Resumo', text: 'Quantas campanhas estão em andamento, quantos entregáveis faltam e qual é o prazo mais próximo. Você recebe aviso no celular um dia antes e no dia da entrega.' },
      { target: '#campaign-list', title: 'Suas campanhas', text: 'Filtre por etapa: Todas, Em andamento, Mirando ou Entregues. A barra mostra quanto dos entregáveis já foi feito. Clique numa campanha para ver os detalhes.' },
      { target: '#campaign-detail', title: 'Detalhes da campanha', text: 'Briefing, entregáveis (marque o que já entregou), prazo e contato. Use "Editar" para corrigir algo, "Excluir" para apagar e o seletor para mudar a etapa.' },
      { target: '#campaign-detail .ai-inline-button', title: 'Roteiro com IA', text: 'Leva para o Estúdio com a campanha já escolhida. Você conta sua opinião sobre o produto e recebe 3 roteiros prontos.' },
      { target: '#campaign-checklist', title: 'Checklist de gravação', text: 'Marque cada tarefa feita. "Gerar checklist com IA" lê o briefing e cria as tarefas com as exigências da marca. Ex.: "Mencionar @natura no primeiro story".' },
      { target: '#campaign-contacts', title: 'Contatos de marcas', text: 'Todos os contatos que você salvou nas campanhas ficam reunidos aqui para você encontrar fácil.' }
    ],
    mediakit: [
      { target: '#mk-name', title: 'Seu media kit', text: 'Uma página pública para mandar às marcas, com seus números atualizados sozinhos. Comece pelo nome que as marcas conhecem.' },
      { target: '#mk-slug', title: 'Seu link', text: 'Escolha o endereço. Ex.: "marianacosta" vira creator.nivelstudio.com.br/kit/marianacosta.' },
      { target: '#mk-bio', title: 'Bio', text: 'Conte o que você faz e para quem. Ex.: "Criadora UGC de beleza e skincare. Vídeos naturais, do jeito que eu uso no dia a dia."' },
      { target: '#mk-highlights', title: 'Destaques e marcas', text: 'Até 6 destaques (Ex.: "40 vídeos UGC entregues") e as marcas com quem já trabalhou. As marcas das campanhas entregues entram sozinhas se a opção estiver marcada.' },
      { target: '#mk-published', title: 'Publicar', text: 'Marque para deixar a página no ar e use "Ver minha página" para copiar o link. Desmarque para tirar do ar a qualquer momento.' }
    ],
    agente: [
      { target: '#agent-messages', title: 'Seu agente de marketing', text: 'Uma conversa com a IA que conhece seu perfil e seus números. O histórico fica salvo só para você.' },
      { target: '#agent-input', title: 'O que perguntar', text: 'Pergunte como para uma pessoa. Ex.: "O que posso postar essa semana?", "Por que meu alcance caiu?" ou "Como responder uma marca que pediu desconto?".' }
    ],
    configuracoes: [
      { target: '.settings-tabs', title: 'Configurações', text: 'Quatro áreas: Perfil, Segurança, Assinatura e Seus dados.' },
      { target: '#settings-profile-form', before: tab('[data-settings-tab="settings-profile-form"]'), title: 'Perfil', text: 'Nicho, objetivo e tom de voz guiam toda a IA. Use os exemplos clicáveis e marque a autorização da IA. Depois de salvar, use "Editar perfil" para mudar.' },
      { target: '.mfa-settings-panel', before: tab('[data-settings-tab="mfa-settings-panel"]'), title: 'Segurança', text: 'Ative a verificação em duas etapas com um app autenticador para proteger sua conta.' },
      { target: '.account-plan-panel', before: tab('[data-settings-tab="account-plan-panel"]'), title: 'Assinatura', text: 'Veja quando o teste grátis termina e assine o plano de R$ 29,90/mês no cartão (renova sozinho) ou no Pix (um mês por vez). Cancele quando quiser.' },
      { target: '.data-rights-panel', before: tab('[data-settings-tab="data-rights-panel"]'), title: 'Seus dados', text: 'Baixe tudo o que está salvo no seu espaço ou peça a exclusão da conta.', after: tab('[data-settings-tab="settings-profile-form"]') }
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
    steps[index]?.after?.();
    index += delta;
    if (index >= steps.length) { close(); return; }
    if (index < 0) index = 0;
    render();
  }

  function place() {
    if (!layer) return;
    const step = steps[index];
    step.before?.();
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
    steps = page ? (pageSteps[page] || overviewSteps).filter((step) => step.before || visible(document.querySelector(step.target)) || step.target.startsWith('.nav-link')) : overviewSteps;
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
  window.maybeStartPageGuide = (page) => {
    if (!pageSteps[page] || layer || document.querySelector('dialog[open]')) return;
    const key = `nivel-guide-${page}-v1`;
    try { if (localStorage.getItem(key)) return; localStorage.setItem(key, '1'); } catch { return; }
    setTimeout(() => start(page), 450);
  };
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
