const form = document.querySelector('#auth-form');
const message = document.querySelector('#form-message');
const submit = document.querySelector('#submit-button');
const loginTab = document.querySelector('#login-tab');
const signupTab = document.querySelector('#signup-tab');
let mode = 'login';
let ready = false;

function setMode(nextMode) {
  mode = nextMode;
  const signup = mode === 'signup';
  const recoveryRequest = mode === 'recover';
  const passwordReset = mode === 'reset';
  const loginLike = mode === 'login';
  loginTab.classList.toggle('active', !signup);
  signupTab.classList.toggle('active', signup);
  loginTab.setAttribute('aria-selected', String(!signup));
  signupTab.setAttribute('aria-selected', String(signup));
  document.querySelector('.auth-tabs').hidden = recoveryRequest || passwordReset;
  document.querySelector('#auth-title').textContent = signup ? 'Crie seu espaço.' : recoveryRequest ? 'Recupere seu acesso.' : passwordReset ? 'Defina uma nova senha.' : 'Entre no seu ritmo.';
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
document.querySelector('#forgot-password').addEventListener('click', () => setMode('recover'));

const query = new URLSearchParams(location.search);
if (query.has('verificado')) message.textContent = 'E-mail confirmado. Agora entre com sua senha.';
if (query.has('redefinir')) setMode('reset');
if (query.get('senha') === 'atualizada') message.textContent = 'Senha atualizada. Entre com sua nova senha.';
if (query.get('erro') === 'confirmacao') message.textContent = 'O link não funcionou ou expirou. Solicite uma nova confirmação.';
if (query.get('erro') === 'redefinicao') message.textContent = 'O link de recuperação expirou ou não foi concluído. Solicite outro link.';
if (query.get('erro') === 'configuracao') message.textContent = 'A autenticação ainda não está configurada neste ambiente.';

fetch('/api/auth/status', { credentials: 'same-origin' }).then(async (result) => {
  const status = await result.json();
  ready = result.ok && status.configured;
  if (!ready) {
    document.querySelector('#setup-message').hidden = false;
    submit.disabled = true;
    document.querySelectorAll('#auth-form input, .auth-tab, #forgot-password').forEach((control) => { control.disabled = true; });
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
    if (mode === 'signup' && data.verification_required) {
      message.textContent = 'Conta criada. Confira seu e-mail para confirmar o endereço e iniciar seu trial.';
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
    submit.innerHTML = mode === 'signup' ? 'Criar minha conta <span>→</span>' : mode === 'recover' ? 'Enviar link de recuperação <span>→</span>' : mode === 'reset' ? 'Salvar nova senha <span>→</span>' : 'Entrar <span>→</span>';
  }
});
