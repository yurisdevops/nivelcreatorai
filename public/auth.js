const form = document.querySelector('#auth-form');
const message = document.querySelector('#form-message');
const submit = document.querySelector('#submit-button');
const loginTab = document.querySelector('#login-tab');
const signupTab = document.querySelector('#signup-tab');
const presentation = document.querySelector('#presentation');
const accessScreen = document.querySelector('#access-screen');
let mode = 'login';
let ready = false;
let mfaRequired = false;
let mfaEnrollmentRequired = false;
let enrollmentFactorId = '';
let selectedPlan = 'trial';

function updatePlanSelection() {
  const note = document.querySelector('#selected-plan-note');
  const title = document.querySelector('#selected-plan-name');
  const intro = document.querySelector('#auth-intro');
  const showPlan = mode === 'signup';
  note.hidden = !showPlan;
  if (selectedPlan === 'pro') {
    title.textContent = 'Pro · R$ 29,90 por mês';
    intro.textContent = 'Crie seu acesso. Depois da confirmação do e-mail, você pode revisar e confirmar o checkout Pro.';
  } else {
    title.textContent = 'Trial grátis · R$ 0 por 7 dias';
    intro.textContent = showPlan
      ? 'Crie seu acesso para começar. O trial é ativado após a confirmação do e-mail.'
      : 'Acesse suas ideias, roteiros e planejamento em um só lugar.';
  }
  if (mode === 'recover') intro.textContent = 'Informe seu e-mail e enviaremos instruções para recuperar o acesso.';
  if (mode === 'reset') intro.textContent = 'Escolha uma nova senha para voltar ao seu espaço.';
}

function showAccess(nextMode = 'login', plan = selectedPlan) {
  selectedPlan = plan === 'pro' ? 'pro' : 'trial';
  presentation.hidden = true;
  accessScreen.hidden = false;
  setMode(nextMode);
  updatePlanSelection();
  window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

function showPresentation() {
  accessScreen.hidden = true;
  presentation.hidden = false;
  history.replaceState(null, '', `${location.pathname}${location.search}`);
  window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

function showMfaLogin(factors) {
  mfaRequired = true;
  mfaEnrollmentRequired = false;
  document.querySelector('.auth-tabs').hidden = true;
  document.querySelector('label[for="email"]').hidden = true;
  document.querySelector('#email').hidden = true;
  document.querySelector('label[for="password"]').hidden = true;
  document.querySelector('#password').hidden = true;
  document.querySelector('#email').required = false;
  document.querySelector('#password').required = false;
  document.querySelector('#forgot-password').hidden = true;
  document.querySelector('#mfa-login-group').hidden = false;
  const select = document.querySelector('#mfa-factor');
  select.replaceChildren(...factors.map((factor) => {
    const option = document.createElement('option');
    option.value = factor.id;
    option.textContent = factor.friendly_name || 'Autenticador';
    return option;
  }));
  document.querySelector('#auth-title').textContent = 'Confirme sua identidade.';
  document.querySelector('#auth-intro').textContent = 'Digite o código temporário do seu aplicativo autenticador.';
  submit.innerHTML = 'Confirmar código <span>→</span>';
  document.querySelector('#mfa-login-code').required = true;
  document.querySelector('#mfa-login-code').focus();
}

function showMfaEnrollment() {
  mfaRequired = false;
  mfaEnrollmentRequired = true;
  document.querySelector('.auth-tabs').hidden = true;
  document.querySelector('label[for="email"]').hidden = true;
  document.querySelector('#email').hidden = true;
  document.querySelector('label[for="password"]').hidden = true;
  document.querySelector('#password').hidden = true;
  document.querySelector('#email').required = false;
  document.querySelector('#password').required = false;
  document.querySelector('#forgot-password').hidden = true;
  document.querySelector('#mfa-login-group').hidden = true;
  document.querySelector('#mfa-enroll-group').hidden = false;
  document.querySelector('#mfa-enroll-code').required = true;
  document.querySelector('#auth-title').textContent = 'Proteja sua conta.';
  document.querySelector('#auth-intro').textContent = 'Ative um autenticador TOTP para continuar como administrador.';
  submit.innerHTML = 'Ativar autenticador <span>→</span>';
}

function setMode(nextMode) {
  mode = nextMode;
  const signup = mode === 'signup';
  const recoveryRequest = mode === 'recover';
  const passwordReset = mode === 'reset';
  const loginLike = mode === 'login';
  mfaRequired = false;
  mfaEnrollmentRequired = false;
  enrollmentFactorId = '';
  document.querySelector('label[for="email"]').hidden = false;
  document.querySelector('#email').hidden = false;
  document.querySelector('#email').required = true;
  document.querySelector('#password').hidden = recoveryRequest;
  document.querySelector('label[for="password"]').hidden = recoveryRequest;
  document.querySelector('#mfa-login-group').hidden = true;
  document.querySelector('#mfa-enroll-group').hidden = true;
  document.querySelector('#mfa-login-code').required = false;
  document.querySelector('#mfa-enroll-code').required = false;
  document.querySelector('#password').required = !recoveryRequest;
  loginTab.classList.toggle('active', !signup);
  signupTab.classList.toggle('active', signup);
  loginTab.setAttribute('aria-selected', String(!signup));
  signupTab.setAttribute('aria-selected', String(signup));
  document.querySelector('.auth-tabs').hidden = recoveryRequest || passwordReset;
  document.querySelector('#auth-title').textContent = signup ? 'Seu próximo passo começa aqui.' : recoveryRequest ? 'Recupere seu acesso.' : passwordReset ? 'Defina uma nova senha.' : 'Acesse seu espaço.';
  updatePlanSelection();
  submit.innerHTML = signup ? 'Criar minha conta <span>→</span>' : recoveryRequest ? 'Enviar link de recuperação <span>→</span>' : passwordReset ? 'Salvar nova senha <span>→</span>' : 'Entrar <span>→</span>';
  document.querySelector('#password').autocomplete = signup || passwordReset ? 'new-password' : 'current-password';
  document.querySelector('#password').hidden = recoveryRequest;
  document.querySelector('label[for="password"]').hidden = recoveryRequest;
  document.querySelector('#password').required = !recoveryRequest;
  document.querySelector('#confirm-password-group').hidden = !passwordReset;
  document.querySelector('#confirm-password').required = passwordReset;
  document.querySelector('#forgot-password').hidden = !loginLike;
  message.textContent = '';
}

loginTab.addEventListener('click', () => setMode('login'));
signupTab.addEventListener('click', () => setMode('signup'));
document.querySelector('#header-login-link').addEventListener('click', (event) => {
  event.preventDefault();
  showAccess('login');
  window.setTimeout(() => document.querySelector('#email').focus({ preventScroll: true }), 350);
});
document.querySelector('#back-to-presentation').addEventListener('click', showPresentation);
document.querySelectorAll('[data-select-plan]').forEach((button) => {
  button.addEventListener('click', () => {
    showAccess('signup', button.dataset.selectPlan);
    window.setTimeout(() => document.querySelector('#email').focus({ preventScroll: true }), 350);
  });
});
document.querySelector('#forgot-password').addEventListener('click', () => setMode('recover'));
document.querySelector('#mfa-cancel').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin',
    headers: { 'content-type': 'application/json' }, body: '{}' }).catch(() => {});
  location.replace('/entrar.html');
});

document.querySelector('#mfa-cancel-enrollment').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin',
    headers: { 'content-type': 'application/json' }, body: '{}' }).catch(() => {});
  location.replace('/entrar.html');
});

document.querySelector('#mfa-enroll-start').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  message.textContent = '';
  try {
    const result = await fetch('/api/auth/mfa/enroll', { method: 'POST', credentials: 'same-origin',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Nivel Creator AI Admin' }) });
    const data = await result.json();
    if (!result.ok) throw new Error(data.error || 'Não foi possível iniciar a configuração.');
    enrollmentFactorId = data.factor.id;
    document.querySelector('#mfa-enroll-qr').src = data.factor.qr_code;
    document.querySelector('#mfa-enroll-secret').textContent = data.factor.secret;
    document.querySelector('#mfa-enroll-details').hidden = false;
    document.querySelector('#mfa-enroll-code').focus();
  } catch (error) {
    message.textContent = error.message || 'Não foi possível iniciar a configuração.';
    button.disabled = false;
  }
});

const query = new URLSearchParams(location.search);
if (query.has('redefinir')) showAccess('reset');
else if (query.has('verificado')) {
  showAccess('login');
  message.textContent = 'E-mail confirmado. Agora entre com sua senha.';
} else if (query.get('senha') === 'atualizada') {
  showAccess('login');
  message.textContent = 'Senha atualizada. Entre com sua nova senha.';
} else if (query.get('erro') === 'confirmacao') {
  showAccess('login');
  message.textContent = 'O link não funcionou ou expirou. Solicite uma nova confirmação.';
} else if (query.get('erro') === 'redefinicao') {
  showAccess('login');
  message.textContent = 'O link de recuperação expirou ou não foi concluído. Solicite outro link.';
} else if (query.get('erro') === 'configuracao') {
  showAccess('login');
  message.textContent = 'A autenticação ainda não está configurada neste ambiente.';
}

fetch('/api/auth/status', { credentials: 'same-origin' }).then(async (result) => {
  const status = await result.json();
  ready = result.ok && status.configured;
  if (!ready) {
    document.querySelector('#setup-message').hidden = false;
    submit.disabled = true;
    document.querySelectorAll('#auth-form input, .auth-tab, #forgot-password').forEach((control) => { control.disabled = true; });
  } else {
    fetch('/api/auth/mfa/status', { credentials: 'same-origin' }).then(async (result) => {
      if (!result.ok) return;
      const mfa = await result.json();
      if (mfa.enroll_required) { showAccess('login'); showMfaEnrollment(); }
      else if (mfa.required) { showAccess('login'); showMfaLogin(mfa.factors); }
    }).catch(() => {});
  }
}).catch(() => {
  document.querySelector('#setup-message').hidden = false;
  submit.disabled = true;
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
    if (!ready) return;
  const email = document.querySelector('#email').value.trim();
  const password = document.querySelector('#password').value;
  message.textContent = '';
  submit.disabled = true;
    submit.textContent = mode === 'signup' ? 'Criando sua conta…' : mode === 'recover' ? 'Enviando…' : mode === 'reset' ? 'Atualizando…' : 'Verificando…';
  try {
    if (mfaEnrollmentRequired) {
      if (!enrollmentFactorId) throw new Error('Gere o QR code antes de informar o código.');
      const result = await fetch('/api/auth/mfa/verify-enrollment', { method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({
          factor_id: enrollmentFactorId,
          code: document.querySelector('#mfa-enroll-code').value.trim()
        }) });
      const data = await result.json();
      if (!result.ok) throw new Error(data.error || 'Não foi possível validar o código.');
      const requestedPath = query.get('redirect') || '/';
      const destination = requestedPath.startsWith('/') && !requestedPath.startsWith('//') ? requestedPath : '/';
      location.assign(destination);
      return;
    }
    if (mfaRequired) {
      const result = await fetch('/api/auth/mfa/verify-login', { method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({
          factor_id: document.querySelector('#mfa-factor').value,
          code: document.querySelector('#mfa-login-code').value.trim()
        }) });
      const data = await result.json();
      if (!result.ok) throw new Error(data.error || 'Não foi possível validar o código.');
      const requestedPath = query.get('redirect') || '/';
      const destination = requestedPath.startsWith('/') && !requestedPath.startsWith('//') ? requestedPath : '/';
      location.assign(destination);
      return;
    }
    if (mode === 'recover') {
      const result = await fetch('/api/auth/recover', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) });
      const data = await result.json();
      if (!result.ok) throw new Error(data.error || 'Não foi possível solicitar a recuperação.');
      message.textContent = 'Se este e-mail tiver uma conta, enviaremos as instruções de recuperação.';
      return;
    }
    if (mode === 'reset') {
      const confirmation = document.querySelector('#confirm-password').value;
      if (password !== confirmation) throw new Error('As senhas não correspondem.');
      const result = await fetch('/api/auth/password', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
      const data = await result.json();
      if (!result.ok) throw new Error(data.error || 'Não foi possível atualizar a senha.');
      location.assign('/entrar.html?senha=atualizada');
      return;
    }
    const result = await fetch(`/api/auth/${mode}`, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await result.json();
    if (!result.ok) throw new Error(data.error || 'Não foi possível concluir. Tente novamente.');
    if (mode === 'login' && data.mfa_setup_required) {
      showMfaEnrollment();
      return;
    }
    if (mode === 'login' && data.mfa_required) {
      showMfaLogin(data.factors);
      return;
    }
    if (mode === 'signup' && data.verification_required) {
      message.textContent = selectedPlan === 'pro'
        ? 'Conta criada. Confirme seu e-mail para iniciar o trial de 7 dias. Depois, você poderá revisar e confirmar o plano Pro em Configurações.'
        : 'Conta criada. Confira seu e-mail para confirmar o endereço e iniciar seu trial grátis de 7 dias.';
      form.reset();
      return;
    }
    const requestedPath = query.get('redirect') || '/';
    const destination = requestedPath.startsWith('/') && !requestedPath.startsWith('//') ? requestedPath : '/';
    location.assign(destination);
  } catch (error) {
    message.textContent = error.message || 'Serviço indisponível. Tente novamente em instantes.';
  } finally {
    submit.disabled = !ready;
    submit.innerHTML = mfaEnrollmentRequired ? 'Ativar autenticador <span>→</span>' : mfaRequired ? 'Confirmar código <span>→</span>' : mode === 'signup' ? 'Criar minha conta <span>→</span>' : mode === 'recover' ? 'Enviar link de recuperação <span>→</span>' : mode === 'reset' ? 'Salvar nova senha <span>→</span>' : 'Entrar <span>→</span>';
  }
});
