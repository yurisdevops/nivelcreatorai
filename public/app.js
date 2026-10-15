const dialog = document.querySelector('#onboarding');
const toast = document.querySelector('#toast');
const viewLinks = [...document.querySelectorAll('[data-view]')];
const contentWrap = document.querySelector('.content-wrap');
const studioView = document.querySelector('#view-roteiros');
const homeSections = [...contentWrap.children].filter((element) => element !== studioView);
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
    voice: document.querySelector('#voice').value.trim()
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
  if (view === 'roteiros') {
    event.preventDefault();
    showStudio();
  } else if (view === 'inicio') {
    event.preventDefault();
    studioView.hidden = true;
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

let scriptsLoaded = false;
function showStudio() {
  homeSections.forEach((element) => { element.hidden = true; });
  studioView.hidden = false;
  document.querySelector('.crumb').innerHTML = 'Seu espaço <span>/</span> Estúdio Criativo';
  if (!scriptsLoaded) loadScripts();
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
    scriptsLoaded = true;
  } catch (error) {
    announce(error.message || 'Entre na sua conta para acessar seus roteiros.');
  }
}

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
    scriptsLoaded = false;
    announce('Roteiro salvo no seu espaço para revisão.');
    await loadScripts();
  } catch (error) {
    announce(error.message || 'Não foi possível gerar o roteiro.');
  } finally {
    button.disabled = false;
    button.innerHTML = '<span>✦</span> Gerar meu roteiro <span>→</span>';
  }
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
