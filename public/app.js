const dialog = document.querySelector('#onboarding');
const toast = document.querySelector('#toast');
const viewLinks = [...document.querySelectorAll('[data-view]')];
const contentWrap = document.querySelector('.content-wrap');
const moduleViews = {
  roteiros: document.querySelector('#view-roteiros'),
  diagnostico: document.querySelector('#view-diagnostico'),
  calendario: document.querySelector('#view-calendario'),
  campanhas: document.querySelector('#view-campanhas'),
  agente: document.querySelector('#view-agente')
};
const homeSections = [...contentWrap.children].filter((element) => !Object.values(moduleViews).includes(element));
let toastTimer;

document.querySelector('#today-label').textContent = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Sao_Paulo'
}).format(new Date()).toLocaleUpperCase('pt-BR');

function announce(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function openOnboarding() {
  dialog.showModal();
}

document.querySelectorAll('[data-open-onboarding]').forEach((button) => button.addEventListener('click', openOnboarding));
document.querySelector('#cancel-onboarding').addEventListener('click', () => dialog.close());

document.querySelector('#save-onboarding').addEventListener('click', () => {
  const profile = {
    niche: document.querySelector('#niche').value.trim(),
    goal: document.querySelector('#goal').value,
    voice: document.querySelector('#voice').value.trim(),
    ai_consent: document.querySelector('#ai-consent').checked
  };
  if (!profile.niche || !profile.goal || !profile.voice) {
    announce('Preencha nicho, objetivo e voz para concluir o perfil.');
    return;
  }
  fetch('/api/profile', {
    method: 'PUT', credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(profile)
  }).then(async (result) => {
    const data = await result.json();
    if (result.status === 401) {
      location.href = '/entrar.html?redirect=%2F';
      return;
    }
    if (!result.ok) throw new Error(data.error || 'Não foi possível salvar o perfil.');
    announce('Perfil salvo no seu espaço.');
    dialog.close();
    loadAccount();
  }).catch((error) => announce(error.message || 'Não foi possível salvar o perfil.'));
});

document.querySelector('#menu-toggle').addEventListener('click', () => {
  document.querySelector('#sidebar').classList.toggle('open');
});

viewLinks.forEach((link) => link.addEventListener('click', (event) => {
  const view = link.dataset.view;
  if (moduleViews[view]) {
    event.preventDefault();
    showModule(view);
  } else if (view === 'inicio') {
    event.preventDefault();
    Object.values(moduleViews).forEach((element) => { element.hidden = true; });
    homeSections.forEach((element) => { element.hidden = false; });
    document.querySelector('.crumb').innerHTML = 'Seu espaço <span>/</span> Início';
  } else {
    event.preventDefault();
    announce('Esta área entra na próxima etapa do produto.');
  }
  document.querySelector('#sidebar').classList.remove('open');
  if (link.classList.contains('nav-link')) {
    document.querySelectorAll('.nav-link[data-view]').forEach((item) => item.classList.toggle('active', item === link));
  }
}));

const moduleLoaded = { roteiros: false, diagnostico: false, calendario: false, campanhas: false, agente: false };
function showModule(name) {
  homeSections.forEach((element) => { element.hidden = true; });
  Object.entries(moduleViews).forEach(([key, element]) => { element.hidden = key !== name; });
  const labels = { roteiros: 'Estúdio Criativo', diagnostico: 'Diagnóstico IA', calendario: 'Calendário', campanhas: 'Campanhas UGC', agente: 'Agente pessoal' };
  document.querySelector('.crumb').innerHTML = `Seu espaço <span>/</span> ${labels[name]}`;
  if (moduleLoaded[name]) return;
  if (name === 'roteiros') loadScripts();
  if (name === 'diagnostico') loadDiagnostics();
  if (name === 'calendario') loadCalendar();
  if (name === 'campanhas') loadCampaigns();
  if (name === 'agente') loadAgent();
}

function updateQuota(quota) {
  document.querySelector('#quota-count').textContent = quota.plan === 'expired'
    ? 'Acesso à geração inativo'
    : `${Math.max(0, quota.limit - quota.used - quota.reserved)} de ${quota.limit} roteiros disponíveis`;
  document.querySelector('#quota-plan').textContent = quota.plan === 'trial' ? 'Limite do período de teste' : quota.plan === 'paid' ? 'Limite do ciclo da assinatura' : 'Seus roteiros continuam disponíveis para consulta';
}

function renderScripts(scripts) {
  const list = document.querySelector('#script-list');
  list.replaceChildren();
  if (!scripts.length) {
    const empty = document.createElement('div');
    empty.className = 'script-empty';
    empty.innerHTML = '<span>✧</span><b>Seu próximo roteiro começa com uma ideia.</b><p>Preencha o briefing ao lado para criar um rascunho personalizado.</p>';
    list.append(empty);
    return;
  }
  for (const script of scripts) {
    const card = document.createElement('article');
    card.className = 'script-card';
    const badge = document.createElement('span');
    badge.className = 'script-badge';
    badge.textContent = `${script.format} · Rascunho`;
    const title = document.createElement('h3');
    title.textContent = script.title;
    const hookLabel = document.createElement('b');
    hookLabel.textContent = 'Hook';
    const hook = document.createElement('p');
    hook.textContent = script.hook;
    const scenesTitle = document.createElement('b');
    scenesTitle.textContent = 'Cenas';
    const scenes = document.createElement('ol');
    for (const scene of script.scenes || []) {
      const item = document.createElement('li');
      item.textContent = `${scene.moment}: ${scene.visual} ${scene.speech}`;
      scenes.append(item);
    }
    const cta = document.createElement('p');
    cta.textContent = `CTA: ${script.cta}`;
    const captionTitle = document.createElement('b');
    captionTitle.textContent = 'Legenda sugerida';
    const caption = document.createElement('p');
    caption.textContent = script.caption;
    card.append(badge, title, hookLabel, hook, scenesTitle, scenes, cta, captionTitle, caption);
    if (script.hashtags?.length) {
      const tags = document.createElement('small');
      tags.className = 'script-tags';
      tags.textContent = script.hashtags.join(' ');
      card.append(tags);
    }
    list.append(card);
  }
}

async function loadScripts() {
  const list = document.querySelector('#script-list');
  try {
    const result = await fetch('/api/creative/scripts', { credentials: 'same-origin' });
    const data = await result.json();
    if (result.status === 401) { location.href = '/entrar.html?redirect=%2F'; return; }
    if (!result.ok) throw new Error(data.error || 'Não foi possível carregar seus roteiros.');
    updateQuota(data.quota);
    renderScripts(data.scripts);
    moduleLoaded.roteiros = true;
  } catch (error) {
    announce(error.message || 'Entre na sua conta para acessar seus roteiros.');
  }
}

function setDiagnosticQuota(quota) {
  document.querySelector('#diagnostic-quota').textContent = quota.plan === 'expired'
    ? 'Geração de diagnóstico inativa'
    : `${Math.max(0, quota.limit - quota.used - quota.reserved)} de ${quota.limit} análises disponíveis`;
  document.querySelector('#diagnostic-plan').textContent = quota.plan === 'trial' ? 'Limite do período de teste' : quota.plan === 'paid' ? 'Limite do ciclo da assinatura' : 'Análises salvas continuam acessíveis';
}

function renderDiagnosticEvidence(evidence) {
  const list = document.querySelector('#diagnostic-evidence-list');
  const heading = document.querySelector('#diagnostic-evidence-title');
  const copy = document.querySelector('#diagnostic-evidence-copy');
  const button = document.querySelector('#run-diagnostic');
  list.replaceChildren();
  const usable = evidence.filter((item) => item.availability === 'available' && Number.isFinite(item.value));
  heading.textContent = usable.length ? `${usable.length} métricas disponíveis` : 'Ainda não há métricas autorizadas';
  copy.textContent = usable.length
    ? 'O diagnóstico vai citar a fonte e o período de cada observação. Métricas limitadas ou indisponíveis não serão tratadas como zero.'
    : 'Conecte uma conta profissional autorizada ou continue usando o produto manualmente. Sem dados disponíveis, score e conclusões ficam desativados.';
  button.disabled = !usable.length;
  for (const item of evidence.slice(0, 12)) {
    const row = document.createElement('div');
    row.className = 'evidence-row';
    const name = document.createElement('b');
    name.textContent = item.metric;
    const value = document.createElement('span');
    value.textContent = item.availability === 'available' && Number.isFinite(item.value) ? new Intl.NumberFormat('pt-BR').format(item.value) : `Dado ${item.availability === 'limited' ? 'limitado' : 'indisponível'}`;
    const detail = document.createElement('small');
    detail.textContent = `${item.source} · ${item.period_start} a ${item.period_end} · atualizado ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(item.fetched_at))}`;
    row.append(name, value, detail);
    list.append(row);
  }
}

function renderDiagnostics(diagnostics) {
  const list = document.querySelector('#diagnostic-list');
  list.replaceChildren();
  if (!diagnostics.length) {
    const empty = document.createElement('div');
    empty.className = 'script-empty';
    empty.innerHTML = '<span>⌕</span><b>Seu diagnóstico aparece aqui quando houver dados.</b><p>Sem métricas disponíveis, não calculamos score nem sugerimos causas.</p>';
    list.append(empty);
    return;
  }
  for (const item of diagnostics) {
    const card = document.createElement('article');
    card.className = 'panel diagnostic-card';
    const date = document.createElement('small');
    date.className = 'script-badge';
    date.textContent = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.created_at));
    const summary = document.createElement('p');
    summary.className = 'diagnostic-summary';
    summary.textContent = item.summary;
    card.append(date, summary);
    for (const [key, title] of [['strengths', 'Pontos fortes'], ['gaps', 'Pontos a observar'], ['opportunities', 'Oportunidades']]) {
      if (!item[key]?.length) continue;
      const heading = document.createElement('h3');
      heading.textContent = title;
      card.append(heading);
      for (const point of item[key]) {
        const entry = document.createElement('div');
        entry.className = 'diagnostic-point';
        const name = document.createElement('b');
        name.textContent = point.title;
        const evidence = document.createElement('p');
        evidence.textContent = `Evidência: ${point.evidence}`;
        const action = document.createElement('p');
        action.textContent = `Sugestão: ${point.action}`;
        entry.append(name, evidence, action);
        card.append(entry);
      }
    }
    list.append(card);
  }
}

async function loadDiagnostics() {
  try {
    const result = await fetch('/api/diagnostics', { credentials: 'same-origin' });
    const data = await result.json();
    if (result.status === 401) { location.href = '/entrar.html?redirect=%2F'; return; }
    if (!result.ok) throw new Error(data.error || 'Não foi possível carregar o diagnóstico.');
    setDiagnosticQuota(data.quota);
    renderDiagnosticEvidence(data.evidence);
    renderDiagnostics(data.diagnostics);
    moduleLoaded.diagnostico = true;
  } catch (error) { announce(error.message || 'Entre na sua conta para consultar diagnósticos.'); }
}

document.querySelector('#run-diagnostic').addEventListener('click', async () => {
  const button = document.querySelector('#run-diagnostic');
  button.disabled = true;
  button.textContent = 'Analisando dados…';
  try {
    const result = await fetch('/api/diagnostics/run', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: '{}' });
    const data = await result.json();
    if (result.status === 401) { location.href = '/entrar.html?redirect=%2F'; return; }
    if (!result.ok) throw new Error(data.error || 'Não foi possível gerar o diagnóstico.');
    moduleLoaded.diagnostico = false;
    await loadDiagnostics();
    announce('Diagnóstico salvo com as evidências disponíveis.');
  } catch (error) { announce(error.message || 'Não foi possível gerar o diagnóstico.'); }
  finally { button.textContent = 'Gerar diagnóstico →'; button.disabled = false; }
});

const briefInput = document.querySelector('#creative-brief');
briefInput.addEventListener('input', () => { document.querySelector('#brief-count').textContent = briefInput.value.length; });
document.querySelector('#creative-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = document.querySelector('#generate-script');
  button.disabled = true;
  button.textContent = 'Criando seu roteiro…';
  try {
    const result = await fetch('/api/creative/generate', {
      method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ brief: briefInput.value, format: document.querySelector('#creative-format').value })
    });
    const data = await result.json();
    if (result.status === 401) { location.href = '/entrar.html?redirect=%2F'; return; }
    if (!result.ok) throw new Error(data.error || 'Não foi possível gerar o roteiro.');
    moduleLoaded.roteiros = false;
    announce('Roteiro salvo no seu espaço para revisão.');
    await loadScripts();
  } catch (error) {
    announce(error.message || 'Não foi possível gerar o roteiro.');
  } finally {
    button.disabled = false;
    button.innerHTML = '<span>✦</span> Gerar meu roteiro <span>→</span>';
  }
});

const workflow = ['idea', 'draft', 'ready_to_record', 'recorded', 'approved', 'published'];
const workflowLabels = { idea: 'Ideia', draft: 'Em roteiro', ready_to_record: 'Pronto para gravar', recorded: 'Gravado', approved: 'Aprovado', published: 'Publicado' };

async function loadCalendar() {
  try {
    const result = await fetch('/api/calendar/events', { credentials: 'same-origin' });
    const data = await result.json();
    if (result.status === 401) { location.href = '/entrar.html?redirect=%2F'; return; }
    if (!result.ok) throw new Error(data.error || 'Não foi possível carregar a agenda.');
    renderCalendar(data.events);
    document.querySelector('#calendar-count').textContent = `${data.events.length} conteúdos na agenda`;
    moduleLoaded.calendario = true;
  } catch (error) { announce(error.message || 'Entre na sua conta para acessar o calendário.'); }
}

function renderCalendar(events) {
  const list = document.querySelector('#calendar-list');
  list.replaceChildren();
  if (!events.length) {
    const empty = document.createElement('div');
    empty.className = 'script-empty';
    empty.innerHTML = '<span>▦</span><b>Seu calendário está livre.</b><p>Adicione sua primeira ideia, sem precisar conectar o Instagram.</p>';
    list.append(empty);
    return;
  }
  for (const event of events) {
    const card = document.createElement('article');
    card.className = 'calendar-event';
    const heading = document.createElement('div');
    heading.className = 'calendar-event-heading';
    const title = document.createElement('b');
    title.textContent = event.title;
    const detail = document.createElement('small');
    detail.textContent = event.scheduled_at ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.scheduled_at)) : 'Sem data definida';
    heading.append(title, detail);
    const meta = document.createElement('small');
    meta.className = 'calendar-event-format';
    meta.textContent = event.format;
    const controls = document.createElement('div');
    controls.className = 'calendar-event-bottom';
    const status = document.createElement('select');
    status.setAttribute('aria-label', `Status de ${event.title}`);
    const index = workflow.indexOf(event.status);
    [Math.max(0, index - 1), index, Math.min(workflow.length - 1, index + 1)].filter((value, position, values) => values.indexOf(value) === position).forEach((value) => {
      const option = document.createElement('option');
      option.value = workflow[value];
      option.textContent = workflowLabels[workflow[value]];
      option.selected = workflow[value] === event.status;
      status.append(option);
    });
    status.addEventListener('change', () => updateEvent(event.id, { status: status.value }));
    const notes = document.createElement('p');
    notes.textContent = event.notes || '';
    controls.append(status);
    card.append(heading, meta, notes, controls);
    list.append(card);
  }
}

async function updateEvent(id, changes) {
  try {
    const result = await fetch(`/api/calendar/events/${id}`, { method: 'PUT', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(changes) });
    const data = await result.json();
    if (!result.ok) throw new Error(data.error || 'Não foi possível atualizar o conteúdo.');
    await loadCalendar();
    announce('Etapa atualizada.');
  } catch (error) { announce(error.message || 'Não foi possível atualizar.'); await loadCalendar(); }
}

document.querySelector('#calendar-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const title = document.querySelector('#event-title');
  const localDate = document.querySelector('#event-date').value;
  const body = {
    title: title.value.trim(), format: document.querySelector('#event-format').value,
    scheduled_at: localDate ? new Date(localDate).toISOString() : null,
    notes: document.querySelector('#event-notes').value.trim(), status: 'idea'
  };
  try {
    const result = await fetch('/api/calendar/events', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await result.json();
    if (result.status === 401) { location.href = '/entrar.html?redirect=%2F'; return; }
    if (!result.ok) throw new Error(data.error || 'Não foi possível adicionar à agenda.');
    document.querySelector('#calendar-form').reset();
    moduleLoaded.calendario = false;
    await loadCalendar();
    announce('Conteúdo adicionado à agenda.');
  } catch (error) { announce(error.message || 'Não foi possível adicionar à agenda.'); }
});

const campaignStatuses = ['draft', 'submitted', 'negotiation', 'in_progress', 'delivered', 'completed', 'archived'];
const campaignStatusLabels = { draft: 'Rascunho', submitted: 'Enviada', negotiation: 'Em negociação', in_progress: 'Em andamento', delivered: 'Entregue', completed: 'Concluída', archived: 'Arquivada' };

async function loadCampaigns() {
  try {
    const result = await fetch('/api/campaigns', { credentials: 'same-origin' });
    const data = await result.json();
    if (result.status === 401) { location.href = '/entrar.html?redirect=%2F'; return; }
    if (!result.ok) throw new Error(data.error || 'Não foi possível carregar as campanhas.');
    renderCampaigns(data.campaigns);
    document.querySelector('#campaign-count').textContent = `${data.campaigns.length} campanhas registradas`;
    moduleLoaded.campanhas = true;
  } catch (error) { announce(error.message || 'Entre na sua conta para acessar campanhas.'); }
}

function renderCampaigns(campaigns) {
  const list = document.querySelector('#campaign-list');
  list.replaceChildren();
  if (!campaigns.length) {
    const empty = document.createElement('div');
    empty.className = 'script-empty';
    empty.innerHTML = '<span>◇</span><b>As parcerias começam com um briefing.</b><p>Nenhuma campanha registrada neste espaço.</p>';
    list.append(empty);
    return;
  }
  for (const campaign of campaigns) {
    const card = document.createElement('article');
    card.className = 'calendar-event';
    const heading = document.createElement('div');
    heading.className = 'calendar-event-heading';
    const title = document.createElement('b');
    title.textContent = campaign.title;
    const brand = document.createElement('small');
    brand.textContent = campaign.brand_name;
    heading.append(title, brand);
    const due = document.createElement('small');
    due.className = 'calendar-event-format';
    due.textContent = campaign.due_at ? `Prazo: ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(`${campaign.due_at}T12:00:00`))}` : 'Sem prazo definido';
    const deliverables = document.createElement('ul');
    for (const item of campaign.deliverables || []) {
      const li = document.createElement('li');
      li.textContent = item;
      deliverables.append(li);
    }
    const notes = document.createElement('p');
    notes.textContent = campaign.notes || '';
    const status = document.createElement('select');
    status.setAttribute('aria-label', `Status de ${campaign.title}`);
    for (const value of campaignStatuses) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = campaignStatusLabels[value];
      option.selected = value === campaign.status;
      status.append(option);
    }
    status.addEventListener('change', async () => {
      try {
        const result = await fetch(`/api/campaigns/${campaign.id}`, { method: 'PUT', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: status.value }) });
        const payload = await result.json();
        if (!result.ok) throw new Error(payload.error || 'Não foi possível atualizar a campanha.');
        announce('Status da campanha atualizado.');
      } catch (error) { announce(error.message || 'Não foi possível atualizar.'); await loadCampaigns(); }
    });
    card.append(heading, due, deliverables, notes, status);
    list.append(card);
  }
}

document.querySelector('#campaign-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const due = document.querySelector('#campaign-due').value;
  const body = {
    brand_name: document.querySelector('#campaign-brand').value.trim(),
    title: document.querySelector('#campaign-title').value.trim(),
    deliverables: document.querySelector('#campaign-deliverables').value.split('\n').map((item) => item.trim()).filter(Boolean),
    due_at: due || null, notes: document.querySelector('#campaign-notes').value.trim()
  };
  try {
    const result = await fetch('/api/campaigns', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await result.json();
    if (result.status === 401) { location.href = '/entrar.html?redirect=%2F'; return; }
    if (!result.ok) throw new Error(data.error || 'Não foi possível salvar a campanha.');
    document.querySelector('#campaign-form').reset();
    moduleLoaded.campanhas = false;
    await loadCampaigns();
    announce('Campanha registrada no seu espaço.');
  } catch (error) { announce(error.message || 'Não foi possível salvar.'); }
});

function updateAgentQuota(quota) {
  document.querySelector('#agent-quota').textContent = quota.plan === 'expired'
    ? 'Acesso à geração inativo'
    : `${Math.max(0, quota.limit - quota.used - quota.reserved)} de ${quota.limit} mensagens disponíveis`;
  document.querySelector('#agent-plan').textContent = quota.plan === 'trial' ? 'Limite do período de teste' : quota.plan === 'paid' ? 'Limite do ciclo da assinatura' : 'Seu histórico continua acessível';
}

function renderAgentMessages(messages) {
  const area = document.querySelector('#agent-messages');
  area.replaceChildren();
  if (!messages.length) {
    const empty = document.createElement('div');
    empty.className = 'script-empty';
    empty.innerHTML = '<span>✧</span><b>Por onde você quer começar?</b><p>Conte um desafio, uma ideia de conteúdo ou uma dúvida sobre o seu perfil.</p>';
    area.append(empty);
    return;
  }
  for (const message of messages) {
    const bubble = document.createElement('article');
    bubble.className = `message-bubble ${message.role === 'user' ? 'message-user' : 'message-assistant'}`;
    const author = document.createElement('b');
    author.textContent = message.role === 'user' ? 'Você' : 'Agente Nivel';
    const content = document.createElement('p');
    content.textContent = message.content;
    bubble.append(author, content);
    area.append(bubble);
  }
  area.scrollTop = area.scrollHeight;
}

async function loadAgent() {
  try {
    const result = await fetch('/api/agent/messages', { credentials: 'same-origin' });
    const data = await result.json();
    if (result.status === 401) { location.href = '/entrar.html?redirect=%2F'; return; }
    if (!result.ok) throw new Error(data.error || 'Não foi possível carregar sua conversa.');
    updateAgentQuota(data.quota);
    renderAgentMessages(data.messages);
    moduleLoaded.agente = true;
  } catch (error) { announce(error.message || 'Entre na sua conta para usar o agente.'); }
}

document.querySelector('#agent-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = document.querySelector('#agent-input');
  const button = document.querySelector('#agent-send');
  button.disabled = true;
  button.textContent = 'Pensando…';
  try {
    const result = await fetch('/api/agent/messages', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: input.value.trim() }) });
    const data = await result.json();
    if (result.status === 401) { location.href = '/entrar.html?redirect=%2F'; return; }
    if (!result.ok) throw new Error(data.error || 'Não foi possível enviar sua mensagem.');
    input.value = '';
    moduleLoaded.agente = false;
    await loadAgent();
  } catch (error) { announce(error.message || 'Não foi possível enviar sua mensagem.'); }
  finally { button.disabled = false; button.innerHTML = 'Enviar <span>↑</span>'; }
});

async function loadAccount() {
  try {
    const statusResult = await fetch('/api/auth/status', { credentials: 'same-origin' });
    const status = await statusResult.json();
    if (status.configured) {
      const accountResult = await fetch('/api/me', { credentials: 'same-origin' });
      if (accountResult.status === 401) {
        location.replace('/entrar.html?redirect=%2F');
        return;
      }
      if (!accountResult.ok) throw new Error('Não foi possível carregar sua conta.');
      const data = await accountResult.json();
      document.querySelector('#current-user').textContent = data.user.email;
      document.querySelector('#current-workspace').textContent = data.workspace.name;
      document.querySelector('#logout').hidden = false;
      document.querySelector('.login-link').hidden = true;
      document.querySelector('#trial-badge').textContent = data.trial.status === 'trialing' ? 'Trial ativo' : 'Conta';
      if (data.profile.completed) {
        document.querySelector('#niche').value = data.profile.niche || '';
        document.querySelector('#voice').value = data.profile.voice || '';
        document.querySelector('#goal').value = data.profile.goals[0] || '';
        document.querySelector('#ai-consent').checked = data.profile.ai_consent;
      } else {
        openOnboarding();
      }
      return;
    }
    document.querySelector('#current-workspace').textContent = 'Prévia do painel';
  } catch {
    // The dashboard remains a non-personalized empty state while offline.
  }
}

loadAccount();

document.querySelector('#logout').addEventListener('click', async () => {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: '{}' });
  } finally {
    location.href = '/entrar.html';
  }
});
