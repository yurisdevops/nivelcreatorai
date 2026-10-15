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
  loginTab.classList.toggle('active', !signup);
  signupTab.classList.toggle('active', signup);
  loginTab.setAttribute('aria-selected', String(!signup));
  signupTab.setAttribute('aria-selected', String(signup));
  document.querySelector('#auth-title').textContent = signup ? 'Crie seu espaço.' : 'Entre no seu ritmo.';
  submit.innerHTML = signup ? 'Criar minha conta <span>→</span>' : 'Entrar <span>→</span>';
  document.querySelector('#password').autocomplete = signup ? 'new-password' : 'current-password';
  message.textContent = '';
}

loginTab.addEventListener('click', () => setMode('login'));
signupTab.addEventListener('click', () => setMode('signup'));

const query = new URLSearchParams(location.search);
if (query.has('verificado')) message.textContent = 'E-mail confirmado. Agora entre com sua senha.';
if (query.get('erro') === 'confirmacao') message.textContent = 'O link não funcionou ou expirou. Solicite uma nova confirmação.';
if (query.get('erro') === 'configuracao') message.textContent = 'A autenticação ainda não está configurada neste ambiente.';

fetch('/api/auth/status', { credentials: 'same-origin' }).then(async (result) => {
  const status = await result.json();
  ready = result.ok && status.configured;
  if (!ready) {
    document.querySelector('#setup-message').hidden = false;
    submit.disabled = true;
    document.querySelectorAll('#auth-form input, .auth-tab').forEach((control) => { control.disabled = true; });
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
  submit.textContent = mode === 'signup' ? 'Criando sua conta…' : 'Verificando…';
  try {
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
    submit.innerHTML = mode === 'signup' ? 'Criar minha conta <span>→</span>' : 'Entrar <span>→</span>';
  }
});
