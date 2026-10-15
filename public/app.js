const dialog = document.querySelector('#onboarding');
const toast = document.querySelector('#toast');
const viewLinks = [...document.querySelectorAll('[data-view]')];
const contentWrap = document.querySelector('.content-wrap');
const moduleViews = {
  roteiros: document.querySelector('#view-roteiros'),
  diagnostico: document.querySelector('#view-diagnostico'),
  planejamento: document.querySelector('#view-planejamento'),
  calendario: document.querySelector('#view-calendario'),
  campanhas: document.querySelector('#view-campanhas'),
  agente: document.querySelector('#view-agente'),
  configuracoes: document.querySelector('#view-configuracoes')
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

const notificationPopover = document.querySelector('#notification-popover');

function renderNotifications(notifications, unreadCount) {
  const list = document.querySelector('#notification-list');
  list.replaceChildren();
  document.querySelector('#notification-badge').hidden = unreadCount === 0;
  document.querySelector('#notification-badge').textContent = unreadCount > 9 ? '9+' : String(unreadCount);
  if (!notifications.length) {
    const empty = document.createElement('p');
    empty.className = 'notification-empty';
    empty.textContent = 'Você está em dia.';
    list.append(empty);
    return;
  }
  for (const item of notifications) {
    const card = document.createElement('article');
    card.className = `notification-item${item.read_at ? '' : ' notification-unread'}`;
    const title = document.createElement('b');
    title.textContent = item.content.title || 'Atualização da sua conta';
    const body = document.createElement('p');
    body.textContent = item.content.body || '';
    const time = document.createElement('small');
    time.textContent = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(item.created_at));
    card.append(title, body, time);
    if (!item.read_at) {
      const read = document.createElement('button');
      read.className = 'notification-read';
      read.type = 'button';
      read.textContent = 'Marcar como lida';
      read.addEventListener('click', () => markNotificationRead(item.id));
      card.append(read);
    }
    list.append(card);
  }
}

async function loadNotifications() {
  try {
    const result = await fetch('/api/notifications', { credentials: 'same-origin' });
    if (!result.ok) return;
    const data = await result.json();
    renderNotifications(data.notifications, data.unread_count);
    document.querySelector('#notification-enabled').checked = data.preferences.in_app_enabled;
  } catch { /* Notifications are optional when the service is unavailable. */ }
}

async function markNotificationRead(id) {
  try {
    const result = await fetch(`/api/notifications/${encodeURIComponent(id)}/read`, { method: 'PUT', credentials: 'same-origin',
      headers: { 'content-type': 'application/json' }, body: '{}' });
    const data = await result.json();
    if (!result.ok) throw new Error(data.error || 'Não foi possível atualizar a notificação.');
    await loadNotifications();
  } catch (error) { announce(error.message || 'Não foi possível atualizar a notificação.'); }
}

document.querySelector('#notification-toggle').addEventListener('click', async () => {
  const open = notificationPopover.hidden;
  notificationPopover.hidden = !open;
  document.querySelector('#notification-toggle').setAttribute('aria-expanded', String(open));
  if (open) await loadNotifications();
});

document.querySelector('#notification-read-all').addEventListener('click', async () => {
  try {
    const result = await fetch('/api/notifications/read-all', { method: 'POST', credentials: 'same-origin',
      headers: { 'content-type': 'application/json' }, body: '{}' });
    if (!result.ok) throw new Error('Não foi possível marcar as notificações como lidas.');
    await loadNotifications();
  } catch (error) { announce(error.message || 'Não foi possível atualizar as notificações.'); }
});

document.querySelector('#notification-enabled').addEventListener('change', async (event) => {
  const enabled = event.currentTarget.checked;
  try {
    const result = await fetch('/api/notifications/preferences', { method: 'PUT', credentials: 'same-origin',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ in_app_enabled: enabled }) });
    const data = await result.json();
    if (!result.ok) throw new Error(data.error || 'Não foi possível salvar sua preferência.');
    announce(enabled ? 'Notificações internas ativadas.' : 'Notificações internas pausadas.');
  } catch (error) {
    event.currentTarget.checked = !enabled;
    announce(error.message || 'Não foi possível salvar sua preferência.');
  }
});

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

const moduleLoaded = { roteiros: false, diagnostico: false, planejamento: false, calendario: false, campanhas: false, agente: false, configuracoes: false };
function showModule(name) {
  homeSections.forEach((element) => { element.hidden = true; });
  Object.entries(moduleViews).forEach(([key, element]) => { element.hidden = key !== name; });
  const labels = { roteiros: 'Estúdio Criativo', diagnostico: 'Diagnóstico IA', planejamento: 'Planejamento', calendario: 'Calendário', campanhas: 'Campanhas UGC', agente: 'Agente pessoal', configuracoes: 'Configurações' };
  document.querySelector('.crumb').innerHTML = `Seu espaço <span>/</span> ${labels[name]}`;
  if (moduleLoaded[name]) return;
  if (name === 'roteiros') loadScripts();
  if (name === 'diagnostico') loadDiagnostics();
  if (name === 'planejamento') loadPlans();
  if (name === 'calendario') loadCalendar();
  if (name === 'campanhas') loadCampaigns();
  if (name === 'agente') loadAgent();
  if (name === 'configuracoes') loadSettings();
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

function updatePlanQuota(quota) {
  document.querySelector('#plan-quota').textContent = quota.plan === 'expired'
    ? 'Acesso à geração inativo'
    : `${Math.max(0, quota.limit - quota.used - quota.reserved)} de ${quota.limit} planos disponíveis`;
  document.querySelector('#plan-plan').textContent = quota.plan === 'trial' ? 'Limite do período de teste' : quota.plan === 'paid' ? 'Limite do ciclo da assinatura' : 'Planos salvos continuam acessíveis';
}

function renderPlans(plans) {
  const list = document.querySelector('#plan-list');
  list.replaceChildren();
  if (!plans.length) {
    const empty = document.createElement('div');
    empty.className = 'script-empty';
    empty.innerHTML = '<span>▤</span><b>Seu plano aparece aqui.</b><p>Gere uma semana de ideias e ajuste cada sugestão antes de usar.</p>';
    list.append(empty);
    return;
  }
  for (const plan of plans) {
    const card = document.createElement('article');
    card.className = 'calendar-event editorial-plan';
    const heading = document.createElement('div');
    heading.className = 'calendar-event-heading';
    const title = document.createElement('b');
    title.textContent = plan.title;
    const dates = document.createElement('small');
    dates.textContent = `${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${plan.start_date}T12:00:00Z`))} a ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${plan.end_date}T12:00:00Z`))}`;
    heading.append(title, dates);
    const objective = document.createElement('p');
    objective.className = 'plan-objective';
    objective.textContent = `Foco: ${plan.objective}`;
    const items = document.createElement('div');
    items.className = 'plan-items';
    for (const item of plan.items) {
      const row = document.createElement('section');
      row.className = 'plan-item';
      const day = new Date(`${plan.start_date}T12:00:00Z`);
      day.setUTCDate(day.getUTCDate() + item.day);
      const dayLabel = document.createElement('small');
      dayLabel.className = 'script-badge';
      dayLabel.textContent = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(day);
      const topic = document.createElement('b');
      topic.textContent = `${item.topic} · ${item.format}`;
      const hook = document.createElement('p');
      hook.textContent = `Abertura: ${item.hook}`;
      const cta = document.createElement('p');
      cta.textContent = `CTA: ${item.call_to_action}`;
      const why = document.createElement('small');
      why.textContent = item.rationale;
      row.append(dayLabel, topic, hook, cta, why);
      items.append(row);
    }
    const addToCalendar = document.createElement('button');
    addToCalendar.className = 'button button-outline plan-calendar-button';
    addToCalendar.type = 'button';
    addToCalendar.textContent = 'Adicionar semana ao calendário →';
    addToCalendar.addEventListener('click', () => addPlanToCalendar(plan.id, addToCalendar));
    card.append(heading, objective, items, addToCalendar);
    list.append(card);
  }
}

async function addPlanToCalendar(planId, button) {
  button.disabled = true;
  button.textContent = 'Adicionando…';
  try {
    const result = await fetch(`/api/plans/${planId}/calendar`, { method: 'POST', credentials: 'same-origin',
      headers: { 'content-type': 'application/json' }, body: '{}' });
    const data = await result.json();
    if (result.status === 401) { location.href = '/entrar.html?redirect=%2F'; return; }
    if (!result.ok) throw new Error(data.error || 'Não foi possível adicionar o plano ao calendário.');
    moduleLoaded.calendario = false;
    announce(data.added ? `${data.added} ideias adicionadas ao calendário.` : 'Este plano já está no calendário.');
  } catch (error) {
    announce(error.message || 'Não foi possível adicionar ao calendário.');
  } finally {
    button.disabled = false;
    button.textContent = 'Adicionar semana ao calendário →';
  }
}

async function loadPlans() {
  try {
    const result = await fetch('/api/plans', { credentials: 'same-origin' });
    const data = await result.json();
    if (result.status === 401) { location.href = '/entrar.html?redirect=%2F'; return; }
    if (!result.ok) throw new Error(data.error || 'Não foi possível carregar os planos.');
    updatePlanQuota(data.quota);
    renderPlans(data.plans);
    moduleLoaded.planejamento = true;
  } catch (error) { announce(error.message || 'Entre na sua conta para acessar o planejamento.'); }
}

function localMonday() {
  const today = new Date();
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
}

document.querySelector('#plan-start-date').value = localMonday();
document.querySelector('#plan-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = document.querySelector('#generate-plan');
  button.disabled = true;
  button.textContent = 'Montando sua semana…';
  try {
    const result = await fetch('/api/plans/generate', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ objective: document.querySelector('#plan-objective').value.trim(), start_date: document.querySelector('#plan-start-date').value }) });
    const data = await result.json();
    if (result.status === 401) { location.href = '/entrar.html?redirect=%2F'; return; }
    if (!result.ok) throw new Error(data.error || 'Não foi possível gerar o plano.');
    moduleLoaded.planejamento = false;
    await loadPlans();
    announce('Plano editorial salvo para você revisar.');
  } catch (error) { announce(error.message || 'Não foi possível gerar o plano.'); }
  finally { button.disabled = false; button.innerHTML = '<span>✦</span> Gerar plano editorial <span>→</span>'; }
});

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

function renderHomeDashboard(data) {
  const labels = { reach: 'Alcance', interactions: 'Interações', profile_visits: 'Visitas ao perfil', followers: 'Seguidores' };
  for (const [key, label] of Object.entries(labels)) {
    const row = data.metrics[key];
    const value = document.querySelector(`#metric-${key}`);
    const note = document.querySelector(`#metric-${key}-note`);
    if (row?.availability === 'available' && Number.isFinite(row.value)) {
      value.textContent = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1, notation: row.value >= 100000 ? 'compact' : 'standard' }).format(row.value);
      const synced = row.fetched_at ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(row.fetched_at)) : 'sem horário informado';
      note.textContent = `${row.source} · ${row.period_start} a ${row.period_end} · sync ${synced}`;
    } else {
      value.textContent = '—';
      note.textContent = row?.availability === 'limited' ? 'A API disponibilizou este dado com limitações.'
        : row?.availability === 'unavailable' ? 'A fonte informou que este dado está indisponível.'
          : `Sem dados sincronizados para ${label.toLocaleLowerCase('pt-BR')}.`;
    }
  }

  const summaryTitle = document.querySelector('#home-summary-title');
  const summaryCopy = document.querySelector('#home-summary-copy');
  const actions = document.querySelector('#home-actions');
  actions.replaceChildren();
  if (data.diagnostic) {
    summaryTitle.textContent = 'Resumo da análise mais recente';
    summaryCopy.textContent = data.diagnostic.summary;
    for (const item of data.actions) {
      const li = document.createElement('li');
      const title = document.createElement('b');
      title.textContent = item.title;
      const text = document.createElement('span');
      text.textContent = item.action;
      li.append(title, text);
      actions.append(li);
    }
  } else {
    summaryTitle.textContent = 'Um bom começo';
    summaryCopy.textContent = 'Quando houver métricas autorizadas e um diagnóstico salvo, o resumo e as próximas ações aparecerão aqui.';
  }

  const upcoming = document.querySelector('#home-upcoming');
  upcoming.replaceChildren();
  if (!data.upcoming.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-calendar';
    empty.innerHTML = '<div class="calendar-art"><span class="cal-top"></span><span class="cal-date">—</span><span class="cal-lines"></span></div><div><b>Seu calendário está livre</b><p>Guarde uma ideia ou crie seu primeiro roteiro.</p></div>';
    const create = document.createElement('button');
    create.className = 'round-plus';
    create.setAttribute('aria-label', 'Criar roteiro');
    create.textContent = '＋';
    create.dataset.view = 'roteiros';
    create.addEventListener('click', () => showModule('roteiros'));
    empty.append(create);
    upcoming.append(empty);
  } else {
    for (const event of data.upcoming) {
      const row = document.createElement('div');
      row.className = 'upcoming-row';
      const date = document.createElement('time');
      date.dateTime = event.scheduled_at;
      date.textContent = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(event.scheduled_at));
      const detail = document.createElement('div');
      const title = document.createElement('b');
      title.textContent = event.title;
      const format = document.createElement('small');
      format.textContent = `${event.format} · ${workflowLabels[event.status] || event.status}`;
      detail.append(title, format);
      row.append(date, detail);
      upcoming.append(row);
    }
  }
}

async function loadHomeDashboard() {
  try {
    const result = await fetch('/api/dashboard', { credentials: 'same-origin' });
    if (result.status === 401) return;
    const data = await result.json();
    if (result.ok) renderHomeDashboard(data);
  } catch { /* Keep honest empty states if dashboard data is temporarily unavailable. */ }
}

async function loadSettings() {
  try {
    const result = await fetch('/api/me', { credentials: 'same-origin' });
    if (result.status === 401) { location.href = '/entrar.html?redirect=%2F'; return; }
    const data = await result.json();
    if (!result.ok) throw new Error(data.error || 'Não foi possível carregar as configurações.');
    document.querySelector('#settings-niche').value = data.profile.niche || '';
    document.querySelector('#settings-goal').value = data.profile.goals[0] || '';
    document.querySelector('#settings-voice').value = data.profile.voice || '';
    document.querySelector('#settings-ai-consent').checked = data.profile.ai_consent;
    const trialEnd = data.trial.ends_at ? new Date(data.trial.ends_at) : null;
    const subscription = data.subscription;
    if (subscription?.status === 'active' || subscription?.status === 'past_due' || (subscription?.status === 'canceled' && Date.parse(subscription.period_end || '') > Date.now())) {
      document.querySelector('#settings-access-status').textContent = subscription.status === 'past_due'
        ? 'Pagamento pendente. O acesso segue durante o prazo de tolerância.'
        : `Acesso pago ${subscription.status === 'canceled' ? 'até o fim do período contratado' : 'ativo'}.`;
      document.querySelector('#settings-subscription').textContent = subscription.status === 'canceled'
        ? `Cancelada · acesso até ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(subscription.period_end))}`
        : subscription.status === 'past_due' ? 'Pagamento pendente' : 'Ativa';
    } else if (trialEnd && trialEnd.getTime() > Date.now()) {
      document.querySelector('#settings-access-status').textContent = 'Seu período de teste está ativo.';
      document.querySelector('#settings-subscription').textContent = 'Nenhuma assinatura';
    } else {
      document.querySelector('#settings-access-status').textContent = 'Seu período de acesso terminou. Seus dados continuam disponíveis para exportação.';
      document.querySelector('#settings-subscription').textContent = 'Nenhuma assinatura ativa';
    }
    document.querySelector('#settings-trial-end').textContent = trialEnd
      ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(trialEnd)
      : 'Não iniciado';
    const billingResult = await fetch('/api/billing/status', { credentials: 'same-origin' });
    if (billingResult.ok) {
      const billing = await billingResult.json();
      const startButton = document.querySelector('#start-subscription');
      const resume = document.querySelector('#resume-checkout');
      const cancelButton = document.querySelector('#cancel-subscription');
      const note = document.querySelector('#billing-note');
      const hasPaidAccess = billing.subscription && ['active', 'past_due'].includes(billing.subscription.status);
      const canceledUntilFuture = billing.subscription?.status === 'canceled' && Date.parse(billing.subscription.period_end || '') > Date.now();
      startButton.hidden = !billing.configured || Boolean(hasPaidAccess) || canceledUntilFuture;
      cancelButton.hidden = !billing.configured || !hasPaidAccess || billing.subscription.cancel_at_period_end;
      resume.hidden = Boolean(hasPaidAccess) || canceledUntilFuture || billing.checkout?.status !== 'pending' || !billing.checkout.checkout_url;
      if (billing.subscription?.status === 'canceled' && canceledUntilFuture) {
        note.textContent = `Renovação cancelada. Seu acesso permanece até ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(billing.subscription.period_end))}.`;
      }
      if (!billing.configured) note.textContent = 'O checkout sandbox ainda não foi configurado neste ambiente.';
      if (!resume.hidden && billing.checkout?.status === 'pending' && billing.checkout.checkout_url) {
        resume.href = billing.checkout.checkout_url;
        resume.hidden = false;
        document.querySelector('#settings-first-due').textContent = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(`${billing.checkout.first_due_date}T12:00:00Z`));
        note.textContent = 'Checkout pendente. O acesso será confirmado por webhook do Asaas.';
      }
    }
    const deletionResult = await fetch('/api/account/deletion', { credentials: 'same-origin' });
    const deletionData = await deletionResult.json();
    const pending = deletionData.deletion_request;
    const deletionStatus = document.querySelector('#deletion-status');
    if (pending) {
      deletionStatus.textContent = `Solicitação ${pending.status === 'completed' ? 'concluída' : 'em processamento'} desde ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(pending.requested_at))}.`;
      document.querySelector('#deletion-form').hidden = pending.status === 'pending' || pending.status === 'processing';
    }
    moduleLoaded.configuracoes = true;
  } catch (error) { announce(error.message || 'Não foi possível carregar as configurações.'); }
}

document.querySelector('#start-subscription').addEventListener('click', async (event) => {
  if (!document.querySelector('#billing-recurring-consent').checked) {
    announce('Confirme a assinatura mensal recorrente para continuar.');
    return;
  }
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const result = await fetch('/api/billing/checkout', { method: 'POST', credentials: 'same-origin',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accept_recurring: true }) });
    const data = await result.json();
    if (result.status === 401) { location.href = '/entrar.html?redirect=%2F'; return; }
    if (!result.ok) throw new Error(data.error || 'Não foi possível abrir o checkout.');
    document.querySelector('#settings-first-due').textContent = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(`${data.first_due_date}T12:00:00Z`));
    location.assign(data.checkout_url);
  } catch (error) { announce(error.message || 'Não foi possível abrir o checkout.'); }
  finally { button.disabled = false; }
});

document.querySelector('#cancel-subscription').addEventListener('click', async (event) => {
  if (!window.confirm('Cancelar a renovação? Seu acesso pago continuará até o fim do período já contratado.')) return;
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const result = await fetch('/api/billing/cancel', { method: 'POST', credentials: 'same-origin',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm_cancel: true }) });
    const data = await result.json();
    if (result.status === 401) { location.href = '/entrar.html?redirect=%2F'; return; }
    if (!result.ok) throw new Error(data.error || 'Não foi possível cancelar a renovação.');
    moduleLoaded.configuracoes = false;
    await loadSettings();
    announce('Renovação cancelada. O acesso segue até o fim do período pago.');
  } catch (error) { announce(error.message || 'Não foi possível cancelar a renovação.'); }
  finally { button.disabled = false; }
});

document.querySelector('#settings-profile-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const body = {
    niche: document.querySelector('#settings-niche').value.trim(),
    goal: document.querySelector('#settings-goal').value.trim(),
    voice: document.querySelector('#settings-voice').value.trim(),
    ai_consent: document.querySelector('#settings-ai-consent').checked
  };
  try {
    const result = await fetch('/api/profile', { method: 'PUT', credentials: 'same-origin',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await result.json();
    if (!result.ok) throw new Error(data.error || 'Não foi possível salvar seu perfil.');
    announce('Perfil e consentimento atualizados.');
    await loadAccount();
  } catch (error) { announce(error.message || 'Não foi possível salvar seu perfil.'); }
});

document.querySelector('#export-account-data').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const result = await fetch('/api/account/export', { credentials: 'same-origin' });
    if (result.status === 401) { location.href = '/entrar.html?redirect=%2F'; return; }
    if (!result.ok) {
      const data = await result.json();
      throw new Error(data.error || 'Não foi possível exportar seus dados.');
    }
    const blob = await result.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `nivel-creator-ai-export-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    announce('Exportação preparada para download.');
  } catch (error) { announce(error.message || 'Não foi possível exportar seus dados.'); }
  finally { button.disabled = false; }
});

document.querySelector('#deletion-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (document.querySelector('#delete-confirmation').value !== 'EXCLUIR') {
    announce('Digite EXCLUIR para confirmar.');
    return;
  }
  if (!window.confirm('A exclusão remove o login e os dados deste workspace. Deseja continuar?')) return;
  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const result = await fetch('/api/account/deletion', { method: 'POST', credentials: 'same-origin',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirmation: 'EXCLUIR' }) });
    const data = await result.json();
    if (!result.ok) throw new Error(data.error || 'Não foi possível registrar a exclusão.');
    document.querySelector('#deletion-status').textContent = 'Solicitação registrada. A remoção será processada em segundo plano.';
    event.currentTarget.hidden = true;
    setTimeout(() => location.assign('/entrar.html?exclusao=solicitada'), 1800);
  } catch (error) {
    announce(error.message || 'Não foi possível registrar a exclusão.');
    button.disabled = false;
  }
});

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
      await loadHomeDashboard();
      await loadNotifications();
      return;
    }
    document.querySelector('#current-workspace').textContent = 'Prévia do painel';
  } catch {
    // The dashboard remains a non-personalized empty state while offline.
  }
}

loadAccount();

const paymentReturn = new URLSearchParams(location.search).get('pagamento');
if (paymentReturn === 'aguardando-webhook') announce('Checkout concluído. O Asaas está confirmando o pagamento; o acesso muda após o webhook.');
if (paymentReturn === 'cancelado') announce('Checkout cancelado. Sua assinatura ainda não foi ativada.');
if (paymentReturn === 'expirado') announce('Checkout expirado. Você pode iniciar outro nas configurações.');

document.querySelector('#logout').addEventListener('click', async () => {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: '{}' });
  } finally {
    location.href = '/entrar.html';
  }
});
