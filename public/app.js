const dialog = document.querySelector('#onboarding');
const toast = document.querySelector('#toast');
const viewLinks = [...document.querySelectorAll('[data-view]')];
const contentWrap = document.querySelector('.content-wrap');
const moduleViews = {
  roteiros: document.querySelector('#view-roteiros'),
  diagnostico: document.querySelector('#view-diagnostico'),
  planejamento: document.querySelector('#view-planejamento'),
  calendario: document.querySelector('#view-calendario'),
  biblioteca: document.querySelector('#view-biblioteca'),
  resultados: document.querySelector('#view-resultados'),
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
  setOnboardingStep(0);
  dialog.showModal();
}

const onboardingSteps = [
  { label: 'CONEXÃO' },
  { label: 'NICHO' },
  { label: 'OBJETIVOS E VOZ' },
  { label: 'CONSENTIMENTO' }
];
let currentOnboardingStep = 0;

function setOnboardingStep(step) {
  currentOnboardingStep = Math.max(0, Math.min(onboardingSteps.length - 1, step));
  document.querySelectorAll('[data-onboarding-step]').forEach((section, index) => {
    section.hidden = index !== currentOnboardingStep;
  });
  document.querySelector('#onboarding-progress').textContent =
    `PASSO ${currentOnboardingStep + 1} DE 4 · ${onboardingSteps[currentOnboardingStep].label}`;
  document.querySelector('#cancel-onboarding').textContent = currentOnboardingStep === 0 ? 'Agora não' : 'Salvar depois';
  document.querySelector('#back-onboarding').hidden = currentOnboardingStep === 0;
  document.querySelector('#next-onboarding').hidden = currentOnboardingStep === onboardingSteps.length - 1;
  document.querySelector('#save-onboarding').hidden = currentOnboardingStep !== onboardingSteps.length - 1;
  if (currentOnboardingStep === onboardingSteps.length - 1) {
    const niche = document.querySelector('#niche').value.trim();
    const goal = document.querySelector('#goal').value;
    const voice = document.querySelector('#voice').value.trim();
    document.querySelector('#onboarding-summary').textContent =
      `Nicho: ${niche} · objetivo: ${goal} · tom de voz: ${voice}. Você pode mudar essas informações nas configurações.`;
  }
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
    const emailToggle = document.querySelector('#notification-email-enabled');
    emailToggle.checked = data.preferences.email_enabled;
    emailToggle.disabled = !data.preferences.email_available;
    document.querySelector('#notification-email-note').textContent = data.preferences.email_available
      ? 'Lembretes sobre o período de teste.'
      : 'E-mail indisponível até configurar o envio neste ambiente.';
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

document.querySelector('#notification-email-enabled').addEventListener('change', async (event) => {
  const enabled = event.currentTarget.checked;
  try {
    const result = await fetch('/api/notifications/preferences', { method: 'PUT', credentials: 'same-origin',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        in_app_enabled: document.querySelector('#notification-enabled').checked, email_enabled: enabled
      }) });
    const data = await result.json();
    if (!result.ok) throw new Error(data.error || 'Não foi possível salvar sua preferência.');
    announce(enabled ? 'E-mails transacionais ativados.' : 'E-mails transacionais pausados.');
  } catch (error) {
    event.currentTarget.checked = !enabled;
    announce(error.message || 'Não foi possível salvar sua preferência.');
  }
});

document.querySelectorAll('[data-open-onboarding]').forEach((button) => button.addEventListener('click', openOnboarding));
document.querySelector('#cancel-onboarding').addEventListener('click', () => dialog.close());
document.querySelector('#back-onboarding').addEventListener('click', () => setOnboardingStep(currentOnboardingStep - 1));
document.querySelector('#next-onboarding').addEventListener('click', () => {
  if (currentOnboardingStep === 1 && !document.querySelector('#niche').value.trim()) {
    announce('Informe seu nicho para continuar.');
    document.querySelector('#niche').focus();
    return;
  }
  if (currentOnboardingStep === 2) {
    if (!document.querySelector('#goal').value) {
      announce('Escolha seu objetivo para continuar.');
      document.querySelector('#goal').focus();
      return;
    }
    if (!document.querySelector('#voice').value.trim()) {
      announce('Conte como você gosta de se comunicar.');
      document.querySelector('#voice').focus();
      return;
    }
  }
  setOnboardingStep(currentOnboardingStep + 1);
});

document.querySelector('#onboarding-connect-instagram').addEventListener('click', () => {
  if (!document.querySelector('#onboarding-instagram-consent').checked) {
    announce('Confirme a autorização para ler dados básicos e insights do Instagram.');
    return;
  }
  document.querySelector('#instagram-insights-consent').checked = true;
  dialog.close();
  document.querySelector('#connect-instagram').click();
});

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
    document.querySelector('#setup-banner')?.setAttribute('hidden', '');
    loadAccount();
  }).catch((error) => announce(error.message || 'Não foi possível salvar o perfil.'));
});

const sidebar = document.querySelector('#sidebar');
const menuToggle = document.querySelector('#menu-toggle');
const mobileMore = document.querySelector('#mobile-more');
const mobilePrimaryViews = new Set(['inicio', 'roteiros', 'planejamento', 'calendario']);
function setSidebarOpen(open) {
  sidebar.classList.toggle('open', open);
  menuToggle.setAttribute('aria-expanded', String(open));
  mobileMore.setAttribute('aria-expanded', String(open));
}
menuToggle.addEventListener('click', () => setSidebarOpen(!sidebar.classList.contains('open')));
mobileMore.addEventListener('click', () => setSidebarOpen(!sidebar.classList.contains('open')));
document.addEventListener('click', (event) => {
  if (sidebar.classList.contains('open') && !sidebar.contains(event.target) && !menuToggle.contains(event.target) && !mobileMore.contains(event.target)) {
    setSidebarOpen(false);
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && sidebar.classList.contains('open')) setSidebarOpen(false);
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
  setSidebarOpen(false);
  if (link.classList.contains('nav-link')) {
    document.querySelectorAll('.nav-link[data-view]').forEach((item) => item.classList.toggle('active', item === link));
  }
  document.querySelectorAll('.mobile-tab').forEach((item) => {
    const active = item.dataset.view === view || (item.id === 'mobile-more' && !mobilePrimaryViews.has(view));
    item.classList.toggle('active', active);
    if (active && item.dataset.view) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
  window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}));

const moduleLoaded = { roteiros: false, diagnostico: false, planejamento: false, calendario: false, biblioteca: false, resultados: false, campanhas: false, agente: false, configuracoes: false };
function showModule(name) {
  homeSections.forEach((element) => { element.hidden = true; });
  Object.entries(moduleViews).forEach(([key, element]) => { element.hidden = key !== name; });
  const labels = { roteiros: 'Estúdio Criativo', diagnostico: 'Diagnóstico IA', planejamento: 'Planejamento', calendario: 'Calendário', biblioteca: 'Biblioteca', resultados: 'Seus resultados', campanhas: 'Campanhas UGC', agente: 'Agente pessoal', configuracoes: 'Configurações' };
  document.querySelector('.crumb').innerHTML = `Seu espaço <span>/</span> ${labels[name]}`;
  if (moduleLoaded[name]) return;
  if (name === 'roteiros') { loadScripts(); loadScriptCampaigns(); }
  if (name === 'diagnostico') loadDiagnostics();
  if (name === 'planejamento') { loadPlans(); loadWeek(); }
  if (name === 'calendario') loadCalendar();
  if (name === 'biblioteca') loadLibrary();
  if (name === 'resultados') loadResults();
  if (name === 'campanhas') loadCampaigns();
  if (name === 'agente') loadAgent();
  if (name === 'configuracoes') loadSettings();
}

const resultMetricLabels = {
  reach: 'Alcance', views: 'Visualizações', interactions: 'Interações',
  profile_visits: 'Visitas ao perfil', followers: 'Seguidores'
};
const resultDays = document.querySelector('#results-days');
resultDays.addEventListener('change', () => { moduleLoaded.resultados = false; loadResults(); });

function renderResults(snapshots) {
  const summary = document.querySelector('#results-summary');
  const history = document.querySelector('#results-history');
  summary.replaceChildren();
  history.replaceChildren();
  if (!snapshots.length) {
    const empty = document.createElement('div');
    empty.className = 'script-empty';
    empty.innerHTML = '<span>⌁</span><b>Seus resultados aparecerão após a primeira sincronização.</b><p>Conecte uma conta profissional do Instagram e autorize a leitura de insights.</p>';
    summary.append(empty);
    return;
  }
  for (const [metric, label] of Object.entries(resultMetricLabels)) {
    const latest = snapshots.find((row) => row.metric === metric);
    const card = document.createElement('article');
    card.className = 'metric-card';
    const title = document.createElement('div');
    title.className = 'metric-label';
    title.textContent = label;
    const value = document.createElement('strong');
    const available = latest?.availability === 'available' && Number.isFinite(latest.value);
    value.textContent = available
      ? new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1, notation: latest.value >= 100000 ? 'compact' : 'standard' }).format(latest.value)
      : '—';
    const note = document.createElement('p');
    note.textContent = latest
      ? `${latest.availability === 'unavailable' ? 'Indisponível na fonte' : `Medição ${latest.period_start} a ${latest.period_end}`} · ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(latest.fetched_at))}`
      : 'Sem sincronização neste período.';
    card.append(title, value, note);
    summary.append(card);
  }

  const table = document.createElement('table');
  table.className = 'results-table';
  const head = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const label of ['Métrica', 'Valor', 'Período medido', 'Sincronizado em', 'Fonte']) {
    const cell = document.createElement('th');
    cell.scope = 'col';
    cell.textContent = label;
    headerRow.append(cell);
  }
  head.append(headerRow);
  const body = document.createElement('tbody');
  for (const row of snapshots) {
    const tr = document.createElement('tr');
    const cells = [
      resultMetricLabels[row.metric] || row.metric,
      row.availability === 'available' && Number.isFinite(row.value)
        ? new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(row.value)
        : 'Indisponível',
      `${row.period_start} a ${row.period_end}`,
      new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(row.fetched_at)),
      row.source
    ];
    for (const text of cells) {
      const cell = document.createElement('td');
      cell.textContent = text;
      tr.append(cell);
    }
    body.append(tr);
  }
  table.append(head, body);
  const scroll = document.createElement('div');
  scroll.className = 'results-table-scroll';
  scroll.append(table);
  history.append(scroll);
}

async function loadResults() {
  const status = document.querySelector('#results-status');
  status.textContent = 'Carregando snapshots da sua conta…';
  try {
    const result = await fetch(`/api/results?days=${encodeURIComponent(resultDays.value)}`, { credentials: 'same-origin' });
    if (result.status === 401) { location.href = '/entrar.html?redirect=%2F'; return; }
    const data = await result.json();
    if (!result.ok) throw new Error(data.error || 'Não foi possível carregar seus resultados.');
    renderResults(data.snapshots || []);
    status.textContent = data.snapshots?.length
      ? `Histórico dos últimos ${data.days} dias · ${data.snapshots.length} medições armazenadas. As datas de cada linha mostram o período real informado pela fonte.`
      : 'Ainda não há medições sincronizadas para este período.';
    moduleLoaded.resultados = true;
  } catch (error) {
    status.textContent = error.message || 'Não foi possível carregar seus resultados.';
  }
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
    empty.innerHTML = '<span>✧</span><b>Seu próximo roteiro começa com uma ideia.</b><p>Gere ideias ou um roteiro de campanha acima.</p>';
    list.append(empty);
    return;
  }
  for (const script of scripts) {
    const card = document.createElement('article');
    card.className = 'script-card';
    const badge = document.createElement('span');
    badge.className = 'script-badge';
    badge.textContent = script.campaign ? `${script.format} · ${script.campaign.brand}` : `${script.format} · Rascunho`;
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
    title.tabIndex = 0;
    title.addEventListener('click', () => renderSelectedScript(script));
    if (Array.isArray(script.checklist) && script.checklist.length) {
      const checklistTitle = document.createElement('b');
      checklistTitle.textContent = 'Checklist de gravação';
      const checklist = document.createElement('ul');
      checklist.className = 'script-checklist';
      for (const entry of script.checklist) {
        const item = document.createElement('li');
        item.textContent = entry;
        checklist.append(item);
      }
      card.append(checklistTitle, checklist);
    }
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

const ideaInput = document.querySelector('#idea-request');
const ideaColors = ['coral', 'lilac', 'lime'];
let selectedScript = null;

ideaInput.addEventListener('input', () => { document.querySelector('#idea-count').textContent = ideaInput.value.length; });
document.querySelectorAll('.example-chip').forEach((chip) => chip.addEventListener('click', () => {
  ideaInput.value = chip.textContent;
  document.querySelector('#idea-count').textContent = ideaInput.value.length;
  ideaInput.focus();
}));

async function postCreative(path, body) {
  const result = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await result.json().catch(() => ({}));
  if (result.status === 401) { location.href = '/entrar.html?redirect=%2F'; return null; }
  if (result.status === 403 && /Autorize/.test(data.error || '')) {
    openOnboarding();
    throw new Error('Para usar a IA, complete seu perfil e marque a autorização de uso da IA no último passo.');
  }
  if (!result.ok) throw new Error(data.error || 'Não foi possível concluir a geração.');
  return data;
}

function setBusy(button, busy, label) {
  button.disabled = busy;
  if (busy) button.textContent = label;
  else button.innerHTML = label;
}

function renderIdeas(ideas) {
  const grid = document.querySelector('#idea-grid');
  const why = document.querySelector('#idea-why');
  grid.replaceChildren();
  why.replaceChildren();
  ideas.forEach((idea, index) => {
    const card = document.createElement('article');
    card.className = 'idea-result';
    const number = document.createElement('span');
    number.className = `idea-number ${ideaColors[index % ideaColors.length]}`;
    number.textContent = String(index + 1);
    const title = document.createElement('h3');
    title.textContent = idea.title;
    const description = document.createElement('p');
    description.textContent = idea.description;
    const tags = document.createElement('div');
    tags.className = 'idea-tags';
    for (const tag of idea.tags) {
      const chip = document.createElement('span');
      chip.textContent = tag;
      tags.append(chip);
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button button-outline';
    button.innerHTML = 'Ver roteiro <span>→</span>';
    button.addEventListener('click', () => generateScriptFromIdea(idea, button));
    card.append(number, title, description, tags, button);
    grid.append(card);
    const reason = document.createElement('div');
    reason.className = 'why-item';
    const label = document.createElement('b');
    label.textContent = `Ideia ${index + 1}`;
    const text = document.createElement('p');
    text.textContent = idea.why;
    reason.append(label, text);
    why.append(reason);
  });
}

function renderSelectedScript(script) {
  selectedScript = script;
  const box = document.querySelector('#selected-script');
  box.replaceChildren();
  document.querySelector('#selected-script-title').textContent = script.campaign
    ? `${script.title} · ${script.campaign.brand}`
    : script.title;
  document.querySelector('#copy-script').disabled = false;
  const steps = [
    ['1', 'Hook', [script.hook]],
    ['2', 'Desenvolvimento', (script.scenes || []).map((scene) => `${scene.moment}: ${scene.speech}`)],
    ['3', 'CTA', [script.cta]]
  ];
  for (const [number, label, lines] of steps) {
    const step = document.createElement('article');
    step.className = 'script-step';
    const heading = document.createElement('b');
    heading.textContent = `${number} · ${label}`;
    step.append(heading);
    const list = document.createElement(lines.length > 1 ? 'ul' : 'div');
    for (const line of lines) {
      const item = document.createElement(lines.length > 1 ? 'li' : 'p');
      item.textContent = line;
      list.append(item);
    }
    step.append(list);
    box.append(step);
  }
}

function scriptAsText(script) {
  const scenes = (script.scenes || []).map((scene, index) => `${index + 1}. ${scene.moment}\n   Visual: ${scene.visual}\n   Fala: ${scene.speech}`).join('\n');
  return `${script.title}\n\nHOOK\n${script.hook}\n\nCENAS\n${scenes}\n\nCTA\n${script.cta}\n\nLEGENDA\n${script.caption}\n${(script.hashtags || []).join(' ')}`;
}

document.querySelector('#copy-script').addEventListener('click', async () => {
  if (!selectedScript) return;
  try {
    await navigator.clipboard.writeText(scriptAsText(selectedScript));
    announce('Roteiro copiado.');
  } catch { announce('Não foi possível copiar. Selecione o texto manualmente.'); }
});

document.querySelector('#idea-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = document.querySelector('#generate-ideas');
  setBusy(button, true, 'Pensando em ideias…');
  try {
    const data = await postCreative('/api/creative/ideas', {
      request: ideaInput.value, format: document.querySelector('#creative-format').value,
      objective: document.querySelector('#studio-objective').value
    });
    if (data) renderIdeas(data.ideas);
  } catch (error) {
    announce(error.message || 'Não foi possível gerar ideias.');
  } finally {
    setBusy(button, false, '<span>✦</span> Gerar ideias agora <span>→</span>');
  }
});

async function generateScriptFromIdea(idea, button) {
  setBusy(button, true, 'Escrevendo…');
  try {
    const brief = `${idea.title}. ${idea.description} Objetivo: ${document.querySelector('#studio-objective').value}.`.slice(0, 1200);
    const data = await postCreative('/api/creative/generate', { brief, format: document.querySelector('#creative-format').value });
    if (!data) return;
    renderSelectedScript(data.script);
    announce('Roteiro salvo no seu espaço para revisão.');
    moduleLoaded.roteiros = false;
    await loadScripts();
  } catch (error) {
    announce(error.message || 'Não foi possível gerar o roteiro.');
  } finally {
    setBusy(button, false, 'Ver roteiro <span>→</span>');
  }
}

async function loadScriptCampaigns() {
  const select = document.querySelector('#script-campaign');
  try {
    const result = await fetch('/api/campaigns', { credentials: 'same-origin' });
    const data = await result.json();
    if (!result.ok) throw new Error();
    select.replaceChildren();
    const usable = data.campaigns.filter((item) => !['archived', 'completed'].includes(item.status));
    if (!usable.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'Cadastre uma campanha primeiro';
      select.append(option);
      return;
    }
    for (const campaign of usable) {
      const option = document.createElement('option');
      option.value = campaign.id;
      option.textContent = `${campaign.brand_name} · ${campaign.title}`;
      select.append(option);
    }
  } catch {
    select.replaceChildren(Object.assign(document.createElement('option'), { value: '', textContent: 'Não foi possível carregar' }));
  }
}

document.querySelector('#campaign-script-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const campaignId = document.querySelector('#script-campaign').value;
  if (!campaignId) { announce('Cadastre ou escolha uma campanha primeiro.'); return; }
  const button = document.querySelector('#generate-campaign-script');
  setBusy(button, true, 'Escrevendo com a sua opinião…');
  try {
    const data = await postCreative('/api/creative/generate', {
      campaign_id: campaignId, format: document.querySelector('#creative-format').value,
      opinion: {
        liked: document.querySelector('#opinion-liked').value,
        disliked: document.querySelector('#opinion-disliked').value,
        experience: document.querySelector('#opinion-experience').value
      }
    });
    if (!data) return;
    renderSelectedScript(data.script);
    document.querySelector('#selected-script-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    announce('Roteiro da campanha salvo para revisão.');
    moduleLoaded.roteiros = false;
    await loadScripts();
  } catch (error) {
    announce(error.message || 'Não foi possível gerar o roteiro.');
  } finally {
    setBusy(button, false, '<span>✦</span> Gerar roteiro da campanha <span>→</span>');
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
    const removePlan = document.createElement('button');
    removePlan.className = 'text-button danger-link';
    removePlan.type = 'button';
    removePlan.textContent = 'Excluir plano';
    removePlan.addEventListener('click', async () => {
      if (!confirm('Excluir este plano? Os conteúdos que você já mandou para o calendário continuam lá.')) return;
      if (await deleteResource(`/api/plans/${plan.id}`)) { announce('Plano excluído.'); await loadPlans(); }
    });
    card.append(heading, objective, items, addToCalendar, removePlan);
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

function readableSize(bytes) {
  if (bytes < 1024 * 1024) return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(bytes / 1024)} KB`;
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(bytes / (1024 * 1024))} MB`;
}

function renderLibraryFiles(files) {
  const list = document.querySelector('#library-file-list');
  list.replaceChildren();
  if (!files.length) {
    const empty = document.createElement('div');
    empty.className = 'script-empty';
    const icon = document.createElement('span'); icon.textContent = '▱';
    const title = document.createElement('b'); title.textContent = 'Sua biblioteca está vazia.';
    const copy = document.createElement('p'); copy.textContent = 'Os arquivos que você salvar aparecerão aqui.';
    empty.append(icon, title, copy); list.append(empty); return;
  }
  for (const file of files) {
    const row = document.createElement('article');
    row.className = 'library-file-row';
    const icon = document.createElement('span');
    icon.className = 'library-file-icon';
    icon.textContent = file.content_type.startsWith('image/') ? '▧' : file.content_type.startsWith('video/') ? '▷' : '▤';
    const info = document.createElement('div');
    info.className = 'library-file-info';
    const link = document.createElement('a');
    link.href = `/api/files/${encodeURIComponent(file.id)}/content`;
    link.textContent = file.display_name;
    const detail = document.createElement('small');
    detail.textContent = `${file.content_type} · ${readableSize(file.byte_size)} · ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(file.created_at))}`;
    info.append(link, detail);
    const remove = document.createElement('button');
    remove.className = 'button button-outline';
    remove.type = 'button';
    remove.textContent = 'Excluir';
    remove.addEventListener('click', () => deleteLibraryFile(file));
    row.append(icon, info, remove);
    list.append(row);
  }
}

async function loadLibrary() {
  try {
    const result = await fetch('/api/files', { credentials: 'same-origin' });
    if (result.status === 401) { location.href = '/entrar.html?redirect=%2F'; return; }
    const data = await result.json();
    if (!result.ok) throw new Error(data.error || 'Não foi possível carregar a biblioteca.');
    const storage = data.storage;
    const used = readableSize(storage.used + storage.reserved);
    const limit = storage.limit ? readableSize(storage.limit) : 'sem espaço ativo';
    document.querySelector('#library-storage-used').textContent = `${readableSize(storage.used)} utilizados`;
    document.querySelector('#library-storage-limit').textContent = `${limit} · até 25 MB por arquivo`;
    document.querySelector('#library-upload-button').disabled = !storage.configured || storage.limit <= storage.used + storage.reserved;
    document.querySelector('#library-status').textContent = !storage.configured
      ? 'Crie o bucket R2 privado para habilitar uploads.'
      : storage.limit ? `${used} ocupados de ${limit}.` : 'O trial terminou. Seus arquivos seguem disponíveis para baixar ou excluir.';
    renderLibraryFiles(data.files || []);
    moduleLoaded.biblioteca = true;
  } catch (error) { announce(error.message || 'Não foi possível carregar a biblioteca.'); }
}

document.querySelector('#library-upload-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const picker = document.querySelector('#library-file');
  const file = picker.files?.[0];
  const button = document.querySelector('#library-upload-button');
  if (!file) { announce('Escolha um arquivo para salvar.'); return; }
  if (file.size > 25 * 1024 * 1024) { announce('Cada arquivo pode ter no máximo 25 MB.'); return; }
  button.disabled = true;
  document.querySelector('#library-status').textContent = 'Enviando e verificando o arquivo…';
  try {
    const result = await fetch('/api/files', { method: 'POST', credentials: 'same-origin',
      headers: { 'content-type': 'application/octet-stream', 'x-file-name': encodeURIComponent(file.name) }, body: file });
    const data = await result.json();
    if (result.status === 401) { location.href = '/entrar.html?redirect=%2F'; return; }
    if (!result.ok) throw new Error(data.error || 'Não foi possível salvar o arquivo.');
    picker.value = '';
    document.querySelector('#library-status').textContent = 'Arquivo salvo no seu espaço privado.';
    await loadLibrary();
  } catch (error) { document.querySelector('#library-status').textContent = error.message || 'Não foi possível salvar o arquivo.'; }
  finally { button.disabled = false; }
});

async function deleteLibraryFile(file) {
  if (!window.confirm(`Excluir “${file.display_name}” da sua biblioteca?`)) return;
  try {
    const result = await fetch(`/api/files/${encodeURIComponent(file.id)}`, { method: 'DELETE', credentials: 'same-origin',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: true }) });
    const data = await result.json();
    if (result.status === 401) { location.href = '/entrar.html?redirect=%2F'; return; }
    if (!result.ok) throw new Error(data.error || 'Não foi possível excluir o arquivo.');
    await loadLibrary();
    announce('Arquivo excluído da biblioteca.');
  } catch (error) { announce(error.message || 'Não foi possível excluir o arquivo.'); }
}

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

const queueGroups = { all: null, idea: ['idea'], draft: ['draft', 'ready_to_record'], recorded: ['recorded', 'approved'], published: ['published'] };
const formatChips = { 'Reels (vídeo curto)': 'Reel', Stories: 'Story', Carrossel: 'Carrossel', UGC: 'UGC', TikTok: 'TikTok', Shorts: 'Shorts', Live: 'Live', Outro: 'Outro' };
let weekEvents = [];
let weekStart = startOfWeek(new Date());
let queueFilter = 'all';
let weekAddDate = null;

function startOfWeek(date) {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return day;
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

async function loadWeek() {
  try {
    const [eventsResult, plansResult] = await Promise.all([
      fetch('/api/calendar/events', { credentials: 'same-origin' }),
      fetch('/api/plans', { credentials: 'same-origin' })
    ]);
    if (eventsResult.status === 401) { location.href = '/entrar.html?redirect=%2F'; return; }
    const data = await eventsResult.json();
    if (!eventsResult.ok) throw new Error(data.error || 'Não foi possível carregar a semana.');
    weekEvents = data.events;
    const plans = plansResult.ok ? await plansResult.json() : { plans: [] };
    const latest = (plans.plans || [])[0];
    document.querySelector('#week-objective').textContent = latest?.objective || latest?.plan?.focus || 'Defina no plano semanal abaixo';
    renderWeek();
  } catch (error) { announce(error.message || 'Não foi possível carregar a semana.'); }
}

async function deleteResource(path) {
  try {
    const result = await fetch(path, { method: 'DELETE', credentials: 'same-origin', headers: { 'content-type': 'application/json' } });
    const data = await result.json().catch(() => ({}));
    if (result.status === 401) { location.href = '/entrar.html?redirect=%2F'; return false; }
    if (!result.ok) throw new Error(data.error || 'Não foi possível excluir.');
    return true;
  } catch (error) { announce(error.message || 'Não foi possível excluir.'); return false; }
}

async function deleteEvent(item) {
  if (!confirm(`Excluir "${item.title}" do planejamento?`)) return;
  if (await deleteResource(`/api/calendar/events/${item.id}`)) {
    moduleLoaded.calendario = false;
    announce('Conteúdo excluído.');
    await loadWeek();
  }
}

async function moveEvent(id, changes) {
  const item = weekEvents.find((entry) => entry.id === id);
  if (!item) return;
  Object.assign(item, changes);
  renderWeek();
  try {
    const result = await fetch(`/api/calendar/events/${id}`, { method: 'PUT', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(changes) });
    const data = await result.json().catch(() => ({}));
    if (!result.ok) throw new Error(data.error || 'Não foi possível mover o conteúdo.');
    moduleLoaded.calendario = false;
  } catch (error) { announce(error.message); await loadWeek(); }
}

function makeDraggable(element, id) {
  element.draggable = true;
  element.addEventListener('dragstart', (event) => {
    event.dataTransfer.setData('text/plain', id);
    event.dataTransfer.effectAllowed = 'move';
    element.classList.add('dragging');
  });
  element.addEventListener('dragend', () => element.classList.remove('dragging'));
}

function makeDropZone(element, onDrop) {
  element.addEventListener('dragover', (event) => { event.preventDefault(); element.classList.add('drop-target'); });
  element.addEventListener('dragleave', (event) => { if (!element.contains(event.relatedTarget)) element.classList.remove('drop-target'); });
  element.addEventListener('drop', (event) => {
    event.preventDefault();
    element.classList.remove('drop-target');
    const id = event.dataTransfer.getData('text/plain');
    if (id) onDrop(id);
  });
}

function renderWeek() {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  const dateFormat = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' });
  document.querySelector('#week-label').textContent = `${dateFormat.format(weekStart)} – ${dateFormat.format(end)}`;
  const inWeek = weekEvents.filter((item) => item.scheduled_at && startOfWeek(new Date(item.scheduled_at)).getTime() === weekStart.getTime());
  const posted = inWeek.filter((item) => item.status === 'published').length;
  document.querySelector('#week-frequency').textContent = `${inWeek.length} ${inWeek.length === 1 ? 'conteúdo' : 'conteúdos'} na semana`;
  document.querySelector('#week-average').textContent = inWeek.length ? `${(inWeek.length / 7).toFixed(1).replace('.', ',')} por dia em média` : 'Adicione conteúdos nos dias abaixo';
  document.querySelector('#week-progress-label').textContent = `${posted} de ${inWeek.length} postados`;
  document.querySelector('#week-progress-bar').style.width = `${inWeek.length ? Math.round((posted / inWeek.length) * 100) : 0}%`;

  const grid = document.querySelector('#week-grid');
  grid.replaceChildren();
  const today = new Date();
  for (let offset = 0; offset < 7; offset += 1) {
    const day = new Date(weekStart);
    day.setDate(day.getDate() + offset);
    const column = document.createElement('div');
    column.className = `week-day${sameDay(day, today) ? ' today' : ''}`;
    const head = document.createElement('div');
    head.className = 'week-day-head';
    const name = document.createElement('b');
    name.textContent = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(day).replace('.', '');
    const date = document.createElement('small');
    date.textContent = dateFormat.format(day);
    head.append(name, date);
    column.append(head);
    const dayEvents = inWeek.filter((item) => sameDay(new Date(item.scheduled_at), day))
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
    for (const item of dayEvents) {
      const card = document.createElement('article');
      card.className = `week-item status-${item.status}`;
      const chip = document.createElement('span');
      chip.className = 'format-chip';
      chip.textContent = formatChips[item.format] || item.format;
      const title = document.createElement('b');
      title.textContent = item.title;
      const time = document.createElement('small');
      time.textContent = `◷ ${new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' }).format(new Date(item.scheduled_at))}`;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'item-delete';
      remove.setAttribute('aria-label', `Excluir ${item.title}`);
      remove.textContent = '×';
      remove.addEventListener('click', () => deleteEvent(item));
      card.append(chip, remove, title, time);
      makeDraggable(card, item.id);
      column.append(card);
    }
    makeDropZone(column, (id) => {
      const moving = weekEvents.find((entry) => entry.id === id);
      if (!moving) return;
      const when = moving.scheduled_at ? new Date(moving.scheduled_at) : new Date(day);
      if (!moving.scheduled_at) when.setHours(10, 0, 0, 0);
      when.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
      if (moving.scheduled_at && sameDay(new Date(moving.scheduled_at), day)) return;
      moveEvent(id, { scheduled_at: when.toISOString() });
    });
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'week-add';
    add.textContent = '＋ Adicionar conteúdo';
    add.addEventListener('click', () => openWeekAdd(day));
    column.append(add);
    grid.append(column);
  }

  const steps = [
    ['Definir temas dos conteúdos', inWeek.length >= 3],
    ['Produzir e gravar os conteúdos', inWeek.length > 0 && inWeek.every((item) => ['recorded', 'approved', 'published'].includes(item.status))],
    ['Agendar no calendário', inWeek.length > 0 && inWeek.every((item) => item.scheduled_at)],
    ['Acompanhar resultados', inWeek.length > 0 && posted === inWeek.length]
  ];
  const stepsBox = document.querySelector('#week-steps');
  stepsBox.replaceChildren();
  for (const [label, done] of steps) {
    const row = document.createElement('div');
    row.className = `week-step${done ? ' done' : ''}`;
    const mark = document.createElement('span');
    mark.textContent = done ? '✓' : '';
    const text = document.createElement('span');
    text.textContent = label;
    row.append(mark, text);
    stepsBox.append(row);
  }
  renderQueue();
}

const queueColumns = [['idea', 'Ideia', ['idea']], ['draft', 'Em roteiro', ['draft', 'ready_to_record']],
  ['recorded', 'Gravado', ['recorded', 'approved']], ['published', 'Publicado', ['published']]];

function renderQueue() {
  const box = document.querySelector('#content-queue');
  box.replaceChildren();
  for (const [status, label, statuses] of queueColumns) {
    if (queueFilter !== 'all' && queueFilter !== status) continue;
    const column = document.createElement('div');
    column.className = 'queue-column';
    const items = weekEvents.filter((item) => statuses.includes(item.status)).slice(0, 20);
    const head = document.createElement('div');
    head.className = 'queue-column-head';
    const title = document.createElement('b');
    title.textContent = label;
    const count = document.createElement('small');
    count.textContent = String(items.length);
    head.append(title, count);
    column.append(head);
    for (const item of items) {
      const card = document.createElement('article');
      card.className = 'queue-item';
      const name = document.createElement('b');
      name.textContent = item.title;
      const meta = document.createElement('small');
      meta.textContent = item.scheduled_at
        ? `${formatChips[item.format] || item.format} · ${new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' }).format(new Date(item.scheduled_at))}`
        : `${formatChips[item.format] || item.format} · sem data`;
      const actions = document.createElement('div');
      actions.className = 'queue-item-actions';
      const position = queueColumns.findIndex(([key]) => key === status);
      const next = queueColumns[position + 1];
      if (next) {
        const advance = document.createElement('button');
        advance.type = 'button';
        advance.className = 'text-button';
        advance.textContent = `${next[1]} →`;
        advance.addEventListener('click', () => moveEvent(item.id, { status: next[0] }));
        actions.append(advance);
      }
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'text-button danger-link';
      remove.textContent = 'Excluir';
      remove.addEventListener('click', () => deleteEvent(item));
      actions.append(remove);
      card.append(name, meta, actions);
      makeDraggable(card, item.id);
      column.append(card);
    }
    if (!items.length) {
      const empty = document.createElement('p');
      empty.className = 'queue-empty';
      empty.textContent = 'Arraste um conteúdo para cá';
      column.append(empty);
    }
    makeDropZone(column, (id) => {
      const moving = weekEvents.find((entry) => entry.id === id);
      if (moving && !statuses.includes(moving.status)) moveEvent(id, { status });
    });
    box.append(column);
  }
}

function openWeekAdd(day) {
  weekAddDate = day;
  document.querySelector('#week-add-day').textContent = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(day).toUpperCase();
  document.querySelector('#week-add-dialog').showModal();
}

document.querySelector('#week-add-close').addEventListener('click', () => document.querySelector('#week-add-dialog').close());
document.querySelector('#week-add-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const [hours, minutes] = (document.querySelector('#week-add-time').value || '10:00').split(':').map(Number);
  const when = new Date(weekAddDate);
  when.setHours(hours, minutes, 0, 0);
  try {
    const result = await fetch('/api/calendar/events', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: document.querySelector('#week-add-title').value.trim(), format: document.querySelector('#week-add-format').value,
        scheduled_at: when.toISOString(), status: 'idea', notes: '' }) });
    const data = await result.json();
    if (!result.ok) throw new Error(data.error || 'Não foi possível adicionar.');
    document.querySelector('#week-add-form').reset();
    document.querySelector('#week-add-dialog').close();
    moduleLoaded.calendario = false;
    await loadWeek();
    announce('Conteúdo adicionado à semana.');
  } catch (error) { announce(error.message || 'Não foi possível adicionar.'); }
});

document.querySelector('#week-prev').addEventListener('click', () => { weekStart.setDate(weekStart.getDate() - 7); renderWeek(); });
document.querySelector('#week-next').addEventListener('click', () => { weekStart.setDate(weekStart.getDate() + 7); renderWeek(); });
document.querySelector('#week-today').addEventListener('click', () => { weekStart = startOfWeek(new Date()); renderWeek(); });
document.querySelectorAll('.queue-filter').forEach((button) => button.addEventListener('click', () => {
  queueFilter = button.dataset.filter;
  document.querySelectorAll('.queue-filter').forEach((item) => item.classList.toggle('active', item === button));
  renderQueue();
}));

const campaignStatusLabels = { prospecting: 'Mirando', draft: 'Rascunho', submitted: 'Proposta enviada', negotiation: 'Negociando', in_progress: 'Em andamento', delivered: 'Entregue', completed: 'Concluída', archived: 'Arquivada' };
const campaignStageOptions = ['prospecting', 'negotiation', 'in_progress', 'delivered', 'completed', 'archived'];
const campaignGroups = {
  active: ['draft', 'submitted', 'negotiation', 'in_progress'],
  prospecting: ['prospecting'],
  done: ['delivered', 'completed'],
  all: null
};
let campaignCache = [];
let selectedCampaignId = null;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatCampaignDate(value) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(`${value}T12:00:00`));
}

function daysUntil(value) {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.round((new Date(`${value}T12:00:00`) - today) / 86400000);
}

function campaignProgress(campaign) {
  const total = campaign.deliverables.length;
  const done = campaign.deliverables.filter((item) => item.done).length;
  return { total, done, percent: total ? Math.round((done / total) * 100) : 0 };
}

async function saveCampaign(id, changes) {
  const result = await fetch(`/api/campaigns/${id}`, { method: 'PUT', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(changes) });
  const payload = await result.json().catch(() => ({}));
  if (result.status === 401) { location.href = '/entrar.html?redirect=%2F'; return false; }
  if (!result.ok) throw new Error(payload.error || 'Não foi possível atualizar a campanha.');
  const campaign = campaignCache.find((item) => item.id === id);
  if (campaign) Object.assign(campaign, changes);
  renderCampaignStats();
  renderCampaigns();
  return true;
}

async function loadCampaigns() {
  try {
    const result = await fetch('/api/campaigns', { credentials: 'same-origin' });
    const data = await result.json();
    if (result.status === 401) { location.href = '/entrar.html?redirect=%2F'; return; }
    if (!result.ok) throw new Error(data.error || 'Não foi possível carregar as campanhas.');
    campaignCache = data.campaigns;
    if (!campaignCache.some((item) => item.id === selectedCampaignId)) selectedCampaignId = campaignCache[0]?.id || null;
    renderCampaignStats();
    renderCampaigns();
    renderCampaignContacts();
    moduleLoaded.campanhas = true;
  } catch (error) { announce(error.message || 'Entre na sua conta para acessar campanhas.'); }
}

function renderCampaignStats() {
  const active = campaignCache.filter((item) => campaignGroups.active.includes(item.status));
  const prospecting = campaignCache.filter((item) => item.status === 'prospecting').length;
  const deliverables = active.flatMap((item) => item.deliverables);
  document.querySelector('#campaign-stat-active').textContent = String(active.length);
  document.querySelector('#campaign-stat-prospecting').textContent = `${prospecting} em prospecção`;
  document.querySelector('#campaign-stat-pending').textContent = String(deliverables.filter((item) => !item.done).length);
  document.querySelector('#campaign-stat-done').textContent = `${deliverables.filter((item) => item.done).length} concluídos`;
  const next = active.filter((item) => item.due_at && daysUntil(item.due_at) >= 0).sort((a, b) => a.due_at.localeCompare(b.due_at))[0];
  document.querySelector('#campaign-stat-due').textContent = next ? (daysUntil(next.due_at) === 0 ? 'Hoje' : `${daysUntil(next.due_at)} dias`) : '—';
  document.querySelector('#campaign-stat-due-date').textContent = next ? `${formatCampaignDate(next.due_at)} · ${next.brand_name}` : 'Sem prazos';
}

function renderCampaigns() {
  const list = document.querySelector('#campaign-list');
  list.replaceChildren();
  const group = campaignGroups[document.querySelector('#campaign-filter').value];
  const visible = campaignCache.filter((item) => !group || group.includes(item.status));
  if (!visible.length) {
    const empty = el('div', 'script-empty');
    empty.append(el('span', '', '◇'), el('b', '', campaignCache.length ? 'Nada nesta etapa.' : 'Sua primeira parceria começa aqui.'),
      el('p', '', campaignCache.length ? 'Troque o filtro acima para ver outras campanhas.' : 'Registre uma marca que você está mirando ou uma campanha já fechada.'));
    list.append(empty);
  }
  for (const campaign of visible) {
    const progress = campaignProgress(campaign);
    const card = el('button', `campaign-card${campaign.id === selectedCampaignId ? ' selected' : ''}`);
    card.type = 'button';
    const head = el('div', 'campaign-card-head');
    const names = el('div');
    names.append(el('b', '', campaign.brand_name), el('small', '', campaign.title));
    head.append(el('span', 'brand-initial', campaign.brand_name.trim().charAt(0).toUpperCase()), names,
      el('span', `status-chip status-${campaign.status}`, campaignStatusLabels[campaign.status] || campaign.status));
    const due = el('small', 'campaign-due', campaign.due_at ? `Entrega: ${formatCampaignDate(campaign.due_at)}` : 'Sem prazo definido');
    const bar = el('div', 'progress-bar');
    const fill = el('i');
    fill.style.width = `${progress.percent}%`;
    bar.append(fill);
    const meta = el('div', 'campaign-card-meta');
    meta.append(el('small', '', `${progress.done}/${progress.total} entregáveis`), el('small', '', `${progress.percent}%`));
    card.append(head, due, bar, meta);
    card.addEventListener('click', () => { selectedCampaignId = campaign.id; renderCampaigns(); });
    list.append(card);
  }
  renderCampaignDetail();
}

function checkItems(container, items, onChange) {
  items.forEach((item, index) => {
    const label = el('label', 'check-item');
    const input = el('input');
    input.type = 'checkbox';
    input.checked = item.done;
    input.addEventListener('change', () => onChange(items.map((entry, position) => position === index ? { ...entry, done: input.checked } : entry)));
    label.append(input, el('span', '', item.text));
    container.append(label);
  });
}

function renderCampaignDetail() {
  const detail = document.querySelector('#campaign-detail');
  const checklistBox = document.querySelector('#campaign-checklist');
  const checklistCount = document.querySelector('#campaign-checklist-count');
  const campaign = campaignCache.find((item) => item.id === selectedCampaignId);
  detail.replaceChildren();
  checklistBox.replaceChildren();
  checklistCount.textContent = '';
  if (!campaign) {
    const empty = el('div', 'script-empty');
    empty.append(el('span', '', '◇'), el('b', '', 'Escolha ou crie uma campanha.'), el('p', '', 'O briefing, os entregáveis e o contato da marca aparecem aqui.'));
    detail.append(empty);
    checklistBox.append(el('p', 'privacy-note', 'Selecione uma campanha.'));
    return;
  }
  const fail = (error) => { announce(error.message); loadCampaigns(); };
  const head = el('div', 'campaign-detail-head');
  const names = el('div');
  names.append(el('h2', '', campaign.brand_name), el('small', '', campaign.title));
  const status = el('select');
  status.setAttribute('aria-label', `Etapa de ${campaign.title}`);
  for (const value of new Set([...campaignStageOptions, campaign.status])) {
    const option = el('option', '', campaignStatusLabels[value] || value);
    option.value = value;
    option.selected = value === campaign.status;
    status.append(option);
  }
  status.addEventListener('change', () => saveCampaign(campaign.id, { status: status.value })
    .then(() => announce('Etapa da campanha atualizada.')).catch(fail));
  head.append(el('span', 'brand-initial large', campaign.brand_name.trim().charAt(0).toUpperCase()), names, status);
  detail.append(head);

  const block = (icon, title) => {
    const section = el('section', 'detail-block');
    const heading = el('h3');
    heading.append(el('span', '', icon), document.createTextNode(` ${title}`));
    section.append(heading);
    detail.append(section);
    return section;
  };
  block('▤', 'Briefing da marca').append(el('p', '', campaign.notes || 'Nenhum briefing registrado ainda.'));

  const deliverablesBlock = block('☑', 'Entregáveis');
  if (!campaign.deliverables.length) deliverablesBlock.append(el('p', '', 'Nenhum entregável registrado.'));
  checkItems(deliverablesBlock, campaign.deliverables, (deliverables) => saveCampaign(campaign.id, { deliverables }).catch(fail));

  const dueBlock = block('▦', 'Prazo');
  if (campaign.due_at) {
    const days = daysUntil(campaign.due_at);
    const when = days > 0 ? `(em ${days} dias)` : days === 0 ? '(hoje)' : `(atrasado ${Math.abs(days)} dias)`;
    const line = el('p');
    line.append(document.createTextNode('Entrega final: '), el('b', 'accent', `${formatCampaignDate(campaign.due_at)} ${when}`));
    dueBlock.append(line);
  } else dueBlock.append(el('p', '', 'Sem prazo definido.'));

  const contactBlock = block('☎', 'Contato na marca');
  const contactLines = campaign.contact
    ? [campaign.contact.name, campaign.contact.email, campaign.contact.instagram && `@${campaign.contact.instagram}`].filter(Boolean)
    : [];
  if (!contactLines.length) contactLines.push('Nenhum contato salvo.');
  for (const value of contactLines) contactBlock.append(el('p', '', value));

  checklistCount.textContent = `${campaign.checklist.filter((item) => item.done).length}/${campaign.checklist.length}`;
  checkItems(checklistBox, campaign.checklist, (checklist) => saveCampaign(campaign.id, { checklist }).catch(fail));
}

function renderCampaignContacts() {
  const box = document.querySelector('#campaign-contacts');
  box.replaceChildren();
  const seen = new Set();
  const contacts = campaignCache.filter((item) => item.contact).filter((item) => {
    const key = `${item.brand_name}|${item.contact.email || item.contact.instagram || item.contact.name}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!contacts.length) { box.append(el('p', 'privacy-note', 'Os contatos que você salvar nas campanhas aparecem aqui.')); return; }
  for (const item of contacts) {
    const row = el('div', 'contact-row');
    const info = el('div');
    info.append(el('b', '', item.contact.name || item.brand_name),
      el('small', '', [item.brand_name, item.contact.email, item.contact.instagram && `@${item.contact.instagram}`].filter(Boolean).join(' · ')));
    row.append(el('span', 'brand-initial', item.brand_name.trim().charAt(0).toUpperCase()), info);
    box.append(row);
  }
}

const campaignDialog = document.querySelector('#campaign-dialog');
document.querySelector('#campaign-new').addEventListener('click', () => campaignDialog.showModal());
document.querySelector('#campaign-dialog-close').addEventListener('click', () => campaignDialog.close());
document.querySelector('#campaign-filter').addEventListener('change', () => renderCampaigns());

document.querySelector('#campaign-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const value = (id) => document.querySelector(id).value.trim();
  const contact = { name: value('#campaign-contact-name'), email: value('#campaign-contact-email'), instagram: value('#campaign-contact-instagram') };
  const body = {
    brand_name: value('#campaign-brand'),
    title: value('#campaign-title'),
    status: document.querySelector('#campaign-status').value,
    deliverables: document.querySelector('#campaign-deliverables').value.split('\n').map((item) => item.trim()).filter(Boolean),
    due_at: document.querySelector('#campaign-due').value || null,
    notes: value('#campaign-notes'),
    contact: contact.name || contact.email || contact.instagram ? contact : null
  };
  try {
    const result = await fetch('/api/campaigns', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await result.json();
    if (result.status === 401) { location.href = '/entrar.html?redirect=%2F'; return; }
    if (!result.ok) throw new Error(data.error || 'Não foi possível salvar a campanha.');
    document.querySelector('#campaign-form').reset();
    campaignDialog.close();
    selectedCampaignId = data.id;
    const group = Object.entries(campaignGroups).find(([, statuses]) => statuses?.includes(body.status))?.[0] || 'all';
    document.querySelector('#campaign-filter').value = group;
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
    if (message.role === 'assistant' && Array.isArray(message.sources) && message.sources.length) {
      const sources = document.createElement('div');
      sources.className = 'message-sources';
      const label = document.createElement('small');
      label.textContent = 'Fontes consultadas';
      const list = document.createElement('ul');
      for (const source of message.sources) {
        const item = document.createElement('li');
        item.textContent = `${source.title}: ${source.detail}`;
        list.append(item);
      }
      sources.append(label, list);
      bubble.append(sources);
    }
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
      if (Number.isFinite(row.change)) {
        const delta = document.createElement('span');
        delta.className = `metric-delta ${row.change >= 0 ? 'up' : 'down'}`;
        delta.textContent = `${row.change >= 0 ? '↑ +' : '↓ '}${String(row.change).replace('.', ',')}% vs. período anterior`;
        note.prepend(delta);
      }
    } else {
      value.textContent = '—';
      note.textContent = row?.availability === 'limited' ? 'A API disponibilizou este dado com limitações.'
        : row?.availability === 'unavailable' ? 'A fonte informou que este dado está indisponível.'
          : `Sem dados sincronizados para ${label.toLocaleLowerCase('pt-BR')}.`;
    }
  }

  renderFollowerChart(data.follower_series || []);

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

function renderFollowerChart(series) {
  const box = document.querySelector('#home-chart');
  box.replaceChildren();
  if (series.length < 2) {
    const empty = document.createElement('p');
    empty.className = 'empty-copy';
    empty.textContent = 'O gráfico aparece depois das primeiras sincronizações do Instagram.';
    box.append(empty);
    return;
  }
  const width = 600, height = 180, pad = 24;
  const values = series.map((point) => point.value);
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const points = series.map((point, index) => [pad + (index / (series.length - 1)) * (width - pad * 2),
    height - pad - ((point.value - min) / span) * (height - pad * 2)]);
  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Seguidores de ${values[0]} para ${values[values.length - 1]} no período`);
  const area = document.createElementNS(ns, 'polygon');
  area.setAttribute('points', `${pad},${height - pad} ${line} ${width - pad},${height - pad}`);
  area.setAttribute('class', 'chart-area');
  const path = document.createElementNS(ns, 'polyline');
  path.setAttribute('points', line);
  path.setAttribute('class', 'chart-line');
  const [lastX, lastY] = points[points.length - 1];
  const dot = document.createElementNS(ns, 'circle');
  dot.setAttribute('cx', lastX); dot.setAttribute('cy', lastY); dot.setAttribute('r', 5);
  dot.setAttribute('class', 'chart-dot');
  svg.append(area, path, dot);
  const caption = document.createElement('p');
  caption.className = 'privacy-note';
  const format = new Intl.NumberFormat('pt-BR');
  caption.textContent = `${format.format(values[0])} → ${format.format(values[values.length - 1])} seguidores (${series[0].date} a ${series[series.length - 1].date})`;
  box.append(svg, caption);
}

async function loadHomeCampaigns() {
  const box = document.querySelector('#home-campaigns');
  try {
    const result = await fetch('/api/campaigns', { credentials: 'same-origin' });
    if (!result.ok) return;
    const { campaigns } = await result.json();
    const active = campaigns.filter((item) => ['draft', 'submitted', 'negotiation', 'in_progress'].includes(item.status));
    const prospecting = campaigns.filter((item) => item.status === 'prospecting').length;
    const pending = active.flatMap((item) => item.deliverables || []).filter((item) => !item.done).length;
    const next = active.filter((item) => item.due_at).sort((a, b) => a.due_at.localeCompare(b.due_at))[0];
    box.replaceChildren();
    const stats = [[String(active.length), 'ativas'], [String(prospecting), 'mirando'], [String(pending), 'entregáveis pendentes']];
    const row = document.createElement('div');
    row.className = 'home-campaign-stats';
    for (const [value, label] of stats) {
      const item = document.createElement('div');
      const strong = document.createElement('b');
      strong.textContent = value;
      const small = document.createElement('small');
      small.textContent = label;
      item.append(strong, small);
      row.append(item);
    }
    box.append(row);
    const note = document.createElement('p');
    note.className = 'privacy-note';
    note.textContent = next
      ? `Próxima entrega: ${next.brand_name} · ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(`${next.due_at}T12:00:00`))}`
      : campaigns.length ? 'Nenhum prazo próximo.' : 'Registre a primeira marca que você está mirando.';
    box.append(note);
  } catch { /* Keep the empty state when campaigns are unavailable. */ }
}

async function loadHomeDashboard() {
  try {
    const result = await fetch('/api/dashboard', { credentials: 'same-origin' });
    if (result.status === 401) return;
    const data = await result.json();
    if (result.ok) renderHomeDashboard(data);
    loadHomeCampaigns();
  } catch { /* Keep honest empty states if dashboard data is temporarily unavailable. */ }
}

async function loadInstagramConnection() {
  try {
    const result = await fetch('/api/instagram/status', { credentials: 'same-origin' });
    if (result.status === 401) return;
    const data = await result.json();
    if (!result.ok) return;
    const status = document.querySelector('#instagram-connection-status');
    const onboardingStatus = document.querySelector('#onboarding-instagram-status');
    const onboardingConnect = document.querySelector('#onboarding-connect-instagram');
    const connect = document.querySelector('#connect-instagram');
    const disconnect = document.querySelector('#disconnect-instagram');
    const consent = document.querySelector('#instagram-insights-consent');
    connect.disabled = !data.configured;
    connect.title = data.configured ? '' : 'O app da Meta ainda não foi configurado neste ambiente.';
    disconnect.hidden = !data.connection;
    consent.disabled = !data.configured;
    if (!data.configured) {
      status.textContent = 'A conexão estará disponível após configurar o app da Meta e a chave de criptografia.';
      onboardingStatus.textContent = 'A conexão não está configurada neste ambiente. Você pode continuar sem Instagram.';
      onboardingConnect.disabled = true;
      onboardingConnect.title = 'A conexão estará disponível quando o app da Meta estiver configurado.';
    } else if (data.connection?.status === 'connected') {
      const expires = data.connection.expires_at
        ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(data.connection.expires_at))
        : 'validade não informada';
      const synced = data.connection.last_sync_at
        ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(data.connection.last_sync_at))
        : 'primeira coleta agendada';
      const issue = data.connection.last_error === 'sync_failed'
        ? ' A última coleta falhou; uma nova tentativa será feita mais tarde.'
        : data.connection.last_error === 'insights_unavailable'
          ? ' A Meta não retornou algumas métricas; valores ausentes não são estimados.' : '';
      status.textContent = `Conectado como @${data.connection.username} · última coleta: ${synced} · token válido até ${expires}.${issue}`;
      onboardingStatus.textContent = `Conta conectada: @${data.connection.username}. Você pode seguir para confirmar seu perfil.`;
      onboardingConnect.disabled = true;
      onboardingConnect.textContent = 'Instagram conectado ✓';
    } else if (data.connection?.status === 'expired') {
      status.textContent = `A conexão de @${data.connection.username} expirou. Reconecte a conta para voltar a consultar insights.`;
      onboardingStatus.textContent = `A conexão de @${data.connection.username} expirou. Você pode reconectar ou continuar sem métricas.`;
      onboardingConnect.disabled = false;
      onboardingConnect.textContent = 'Reconectar Instagram ↗';
      connect.textContent = 'Reconectar Instagram ↗';
    } else if (!data.connection) {
      status.textContent = 'Nenhuma conta profissional do Instagram conectada.';
      onboardingStatus.textContent = 'Nenhuma conta conectada. A conexão é opcional e pode ser feita depois.';
      onboardingConnect.disabled = false;
      onboardingConnect.textContent = 'Conectar Instagram ↗';
      connect.textContent = 'Conectar Instagram ↗';
    } else {
      const permissionIssue = data.connection.last_error === 'insufficient_permissions';
      const tokenIssue = ['token_invalid', 'token_expired'].includes(data.connection.last_error) || data.connection.status === 'revoked';
      status.textContent = permissionIssue
        ? 'A Meta não liberou as permissões necessárias para os insights. Revise as permissões do app e reconecte a conta.'
        : tokenIssue
          ? 'O acesso do Instagram foi revogado ou expirou. Reconecte sua conta para voltar a consultar insights.'
          : 'A conexão precisa ser renovada. Reconecte sua conta profissional.';
      onboardingStatus.textContent = permissionIssue
        ? 'As permissões para insights precisam ser revisadas. Você pode reconectar ou continuar sem métricas.'
        : 'A conexão precisa ser renovada. Você pode reconectar ou continuar sem métricas.';
      onboardingConnect.disabled = false;
      onboardingConnect.textContent = 'Reconectar Instagram ↗';
      connect.textContent = 'Reconectar Instagram ↗';
    }
  } catch {
    document.querySelector('#onboarding-instagram-status').textContent =
      'Não foi possível verificar a conexão agora. Você pode continuar sem Instagram.';
    document.querySelector('#onboarding-connect-instagram').disabled = true;
  }
}

document.querySelector('#connect-instagram').addEventListener('click', async (event) => {
  if (!document.querySelector('#instagram-insights-consent').checked) {
    announce('Confirme a autorização para ler dados básicos e insights do Instagram.');
    return;
  }
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const result = await fetch('/api/instagram/connect', { method: 'POST', credentials: 'same-origin',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ consent: true }) });
    const data = await result.json();
    if (result.status === 401) { location.href = '/entrar.html?redirect=%2F'; return; }
    if (!result.ok) throw new Error(data.error || 'Não foi possível iniciar a conexão.');
    location.assign(data.authorize_url);
  } catch (error) { announce(error.message || 'Não foi possível iniciar a conexão.'); }
  finally { button.disabled = false; }
});

document.querySelector('#disconnect-instagram').addEventListener('click', async (event) => {
  if (!window.confirm('Desconectar o Instagram e apagar o token salvo neste workspace? As métricas históricas permanecem. Para revogar o acesso na Meta, remova o app nas configurações do Instagram.')) return;
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const result = await fetch('/api/instagram/disconnect', { method: 'POST', credentials: 'same-origin',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: true }) });
    const data = await result.json();
    if (result.status === 401) { location.href = '/entrar.html?redirect=%2F'; return; }
    if (!result.ok) throw new Error(data.error || 'Não foi possível desconectar a conta.');
    await loadInstagramConnection();
    announce('Instagram desconectado. O token local foi removido.');
  } catch (error) { announce(error.message || 'Não foi possível desconectar a conta.'); }
  finally { button.disabled = false; }
});

async function loadSettings() {
  try {
    const result = await fetch('/api/me', { credentials: 'same-origin' });
    if (result.status === 401) { location.href = '/entrar.html?redirect=%2F'; return; }
    const data = await result.json();
    if (!result.ok) throw new Error(data.error || 'Não foi possível carregar as configurações.');
    await loadMfaSettings();
    document.querySelector('#settings-niche').value = data.profile.niche || '';
    document.querySelector('#settings-goal').value = data.profile.goals[0] || '';
    document.querySelector('#settings-voice').value = data.profile.voice || '';
    document.querySelector('#settings-ai-consent').checked = data.profile.ai_consent;
    let retentionNote = document.querySelector('#settings-retention');
    if (!retentionNote) {
      retentionNote = document.createElement('p');
      retentionNote.id = 'settings-retention';
      retentionNote.className = 'privacy-note';
      document.querySelector('.data-rights-panel').insertBefore(retentionNote, document.querySelector('#export-account-data'));
    }
    retentionNote.textContent = data.data_retention.automatic_purge_enabled
      ? `A remoção automática está ativa: espaços sem acesso vigente são removidos após ${data.data_retention.retention_days} dias, com aviso no app antes da remoção. Exporte seus dados em Configurações.`
      : `A remoção automática após ${data.data_retention.retention_days} dias está desativada neste ambiente.`;
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
      const pixButton = document.querySelector('#start-pix-checkout');
      const resume = document.querySelector('#resume-checkout');
      const cancelButton = document.querySelector('#cancel-subscription');
      const note = document.querySelector('#billing-note');
      const periodEnd = Date.parse(billing.subscription?.period_end || '');
      const now = Date.now();
      const hasPaidAccess = billing.subscription?.status === 'active' && periodEnd > now ||
        billing.subscription?.status === 'past_due' && periodEnd + 72 * 60 * 60 * 1000 > now;
      const canceledUntilFuture = billing.subscription?.status === 'canceled' && Date.parse(billing.subscription.period_end || '') > Date.now();
      const checkoutPending = billing.checkout?.status === 'pending' && Boolean(billing.checkout.checkout_url);
      const canStartCheckout = billing.configured && !hasPaidAccess && !canceledUntilFuture && !checkoutPending;
      startButton.hidden = !canStartCheckout;
      pixButton.hidden = !canStartCheckout;
      document.querySelector('#billing-recurring-consent').closest('label').hidden = !canStartCheckout;
      document.querySelector('#billing-pix-consent').closest('label').hidden = !canStartCheckout;
      cancelButton.hidden = !billing.configured || !hasPaidAccess || billing.subscription?.cancel_at_period_end || billing.subscription?.billing_type === 'PIX';
      resume.hidden = !checkoutPending;
      if (checkoutPending) resume.textContent = billing.checkout.billing_type === 'PIX' ? 'Retomar pagamento Pix ↗' : 'Retomar checkout ↗';
      if (billing.checkout?.status === 'pending' && billing.checkout.billing_type === 'PIX') {
        document.querySelector('#settings-first-due').textContent = 'Pagamento Pix pendente';
        note.textContent = 'O pagamento Pix é avulso. O ciclo só começa após a confirmação por webhook do Asaas e não renova automaticamente.';
      }
      if (billing.subscription?.billing_type === 'PIX' && hasPaidAccess) {
        document.querySelector('#settings-subscription').textContent = `Pix avulso · acesso até ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(billing.subscription.period_end))}`;
        note.textContent = 'Este ciclo foi pago por Pix e não renova automaticamente. Você poderá fazer outro pagamento ao fim do acesso vigente.';
      }
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
      if (pending.request_type === 'retention') {
        const scheduled = pending.scheduled_for
          ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(pending.scheduled_for))
          : 'data não informada';
        const retentionState = pending.status === 'rejected' ? 'cancelada porque o acesso foi reativado'
          : pending.status === 'processing' ? 'em processamento'
            : data.data_retention.automatic_purge_enabled ? `agendada para ${scheduled}` : 'suspensa neste ambiente';
        deletionStatus.textContent = `Remoção por retenção ${retentionState}. Exporte seus dados enquanto o workspace estiver disponível.`;
      } else {
        deletionStatus.textContent = `Solicitação ${pending.status === 'completed' ? 'concluída' : pending.status === 'rejected' ? 'cancelada' : 'em processamento'} desde ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(pending.requested_at))}.`;
      }
      document.querySelector('#deletion-form').hidden = pending.status === 'pending' || pending.status === 'processing';
    }
    moduleLoaded.configuracoes = true;
  } catch (error) { announce(error.message || 'Não foi possível carregar as configurações.'); }
}

async function loadMfaSettings() {
  const note = document.querySelector('#mfa-settings-note');
  const button = document.querySelector('#mfa-enroll-button');
  const list = document.querySelector('#mfa-factor-list');
  try {
    const result = await fetch('/api/auth/mfa/status', { credentials: 'same-origin' });
    const data = await result.json();
    if (!result.ok) throw new Error(data.error || 'Não foi possível consultar os autenticadores.');
    list.replaceChildren();
    const setup = document.querySelector('#mfa-enrollment');
    setup.hidden = true;
    button.hidden = data.pending.length > 0 || data.factors.length >= 10;
    button.textContent = data.factors.length ? 'Adicionar outro autenticador TOTP' : 'Adicionar autenticador TOTP';
    note.textContent = data.enabled
      ? data.admin_mfa_required
        ? 'MFA é obrigatório para administradores. Mantenha ao menos um autenticador ativo; novas sessões precisam de um código.'
        : 'A autenticação em duas etapas está ativa. Novas sessões precisam de um código de um dos seus aplicativos autenticadores.'
      : data.admin_mfa_required
        ? 'MFA é obrigatório para administradores. Ative um autenticador para continuar usando as APIs privadas.'
        : 'Adicione um aplicativo autenticador TOTP para exigir um segundo fator nas próximas sessões.';
    for (const factor of data.factors) {
      const row = document.createElement('div');
      row.className = 'mfa-factor-row';
      const label = document.createElement('span');
      label.textContent = factor.friendly_name || 'Autenticador TOTP';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'button button-outline';
      const mustKeepFactor = data.admin_mfa_required && data.factors.length === 1;
      remove.textContent = mustKeepFactor ? 'Obrigatório' : 'Remover';
      remove.disabled = mustKeepFactor;
      remove.addEventListener('click', async () => {
        if (!window.confirm('Remover este autenticador? As próximas sessões não pedirão esse segundo fator.')) return;
        remove.disabled = true;
        try {
          const deletion = await fetch(`/api/auth/mfa/factors/${encodeURIComponent(factor.id)}`, { method: 'DELETE', credentials: 'same-origin' });
          const body = await deletion.json();
          if (!deletion.ok) throw new Error(body.error || 'Não foi possível remover o autenticador.');
          await loadMfaSettings();
          announce('Autenticador removido.');
        } catch (error) { announce(error.message || 'Não foi possível remover o autenticador.'); }
        finally { remove.disabled = false; }
      });
      row.append(label, remove);
      list.append(row);
    }
    for (const factor of data.pending) {
      const row = document.createElement('div');
      row.className = 'mfa-factor-row';
      const label = document.createElement('span');
      label.textContent = `${factor.friendly_name || 'Autenticador'} · configuração pendente`;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'button button-outline';
      remove.textContent = 'Cancelar';
      remove.addEventListener('click', async () => {
        const deletion = await fetch(`/api/auth/mfa/factors/${encodeURIComponent(factor.id)}`, { method: 'DELETE', credentials: 'same-origin' });
        if (!deletion.ok) { announce('Não foi possível cancelar esta configuração.'); return; }
        await loadMfaSettings();
      });
      row.append(label, remove);
      list.append(row);
    }
  } catch (error) {
    note.textContent = error.message || 'Não foi possível carregar a autenticação em duas etapas.';
  }
}

document.querySelector('#mfa-enroll-button').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const result = await fetch('/api/auth/mfa/enroll', { method: 'POST', credentials: 'same-origin',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Nivel Creator AI' }) });
    const data = await result.json();
    if (!result.ok) throw new Error(data.error || 'Não foi possível iniciar a configuração.');
    document.querySelector('#mfa-qr').src = data.factor.qr_code;
    document.querySelector('#mfa-qr').dataset.factorId = data.factor.id;
    document.querySelector('#mfa-secret').textContent = data.factor.secret;
    document.querySelector('#mfa-enrollment').hidden = false;
    document.querySelector('#mfa-enrollment-code').focus();
  } catch (error) { announce(error.message || 'Não foi possível iniciar a configuração.'); }
  finally { button.disabled = false; }
});

document.querySelector('#mfa-verify-enrollment').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const result = await fetch('/api/auth/mfa/verify-enrollment', { method: 'POST', credentials: 'same-origin',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        factor_id: document.querySelector('#mfa-qr').dataset.factorId,
        code: document.querySelector('#mfa-enrollment-code').value.trim()
      }) });
    const data = await result.json();
    if (!result.ok) throw new Error(data.error || 'Não foi possível validar o código.');
    document.querySelector('#mfa-enrollment-code').value = '';
    await loadMfaSettings();
    announce('Autenticação em duas etapas ativada.');
  } catch (error) { announce(error.message || 'Não foi possível validar o código.'); }
  finally { button.disabled = false; }
});

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

document.querySelector('#start-pix-checkout').addEventListener('click', async (event) => {
  if (!document.querySelector('#billing-pix-consent').checked) {
    announce('Confirme que o Pix é avulso e não cria renovação automática.');
    return;
  }
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const result = await fetch('/api/billing/pix-checkout', { method: 'POST', credentials: 'same-origin',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accept_one_time: true }) });
    const data = await result.json();
    if (result.status === 401) { location.href = '/entrar.html?redirect=%2F'; return; }
    if (!result.ok) throw new Error(data.error || 'Não foi possível abrir o checkout Pix.');
    location.assign(data.checkout_url);
  } catch (error) { announce(error.message || 'Não foi possível abrir o checkout Pix.'); }
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
      const data = await accountResult.json();
      if (accountResult.status === 403 && ['mfa_required', 'mfa_enrollment_required'].includes(data.code)) {
        location.replace('/entrar.html?mfa=1');
        return;
      }
      if (!accountResult.ok) throw new Error('Não foi possível carregar sua conta.');
      document.querySelector('#current-user').textContent = data.user.email;
      document.querySelector('#current-workspace').textContent = data.workspace.name;
      document.querySelector('#logout').hidden = false;
      document.querySelector('.login-link').hidden = true;
      document.querySelector('#trial-badge').textContent = data.trial.status === 'trialing' ? 'Trial ativo' : 'Conta';
      document.querySelector('#studio-niche').textContent = data.profile.niche || 'Complete seu perfil';
      if (data.profile.completed) {
        document.querySelector('#niche').value = data.profile.niche || '';
        document.querySelector('#voice').value = data.profile.voice || '';
        document.querySelector('#goal').value = data.profile.goals[0] || '';
        document.querySelector('#ai-consent').checked = data.profile.ai_consent;
      } else {
        openOnboarding();
      }
      await loadHomeDashboard();
      await loadInstagramConnection();
      await loadNotifications();
      return;
    }
    document.querySelector('#current-workspace').textContent = 'Prévia do painel';
    document.querySelector('#onboarding-instagram-status').textContent =
      'Entre na sua conta para verificar a conexão. Você também pode concluir o perfil sem Instagram.';
    document.querySelector('#onboarding-connect-instagram').disabled = true;
  } catch {
    // The dashboard remains a non-personalized empty state while offline.
  }
}

loadAccount();

const paymentReturn = new URLSearchParams(location.search).get('pagamento');
if (paymentReturn === 'aguardando-webhook') announce('Checkout concluído. O Asaas está confirmando o pagamento; o acesso muda após o webhook.');
if (paymentReturn === 'pix-aguardando-webhook') announce('Checkout Pix concluído. O ciclo avulso só começa após a confirmação por webhook do Asaas.');
if (paymentReturn === 'cancelado') announce('Checkout cancelado. Sua assinatura ainda não foi ativada.');
if (paymentReturn === 'expirado') announce('Checkout expirado. Você pode iniciar outro nas configurações.');
const instagramReturn = new URLSearchParams(location.search).get('instagram');
if (instagramReturn === 'conectado') announce('Instagram conectado. A sincronização de insights depende das permissões aprovadas pela Meta.');
if (instagramReturn === 'cancelado') announce('Conexão cancelada. Nenhum token foi salvo.');
if (instagramReturn === 'erro') announce('Não foi possível conectar. Confira se a conta é profissional e tente novamente.');

document.querySelector('#logout').addEventListener('click', async () => {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: '{}' });
  } finally {
    location.href = '/entrar.html';
  }
});
