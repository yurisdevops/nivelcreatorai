const form = document.querySelector('#waitlist-form');
const statusLine = document.querySelector('#wl-status');
const submitButton = document.querySelector('#wl-submit');
const done = document.querySelector('#wl-done');

function sourceFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const value = params.get('utm_source') || params.get('ref') || '';
  return value.slice(0, 60);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  statusLine.textContent = '';
  const data = new FormData(form);
  if (!data.get('name')?.trim() || !data.get('email')?.trim() || !data.get('campaigns_per_month')) {
    statusLine.textContent = 'Preencha nome, e-mail e quantas campanhas você fecha por mês.';
    return;
  }
  if (!form.querySelector('#wl-consent').checked) {
    statusLine.textContent = 'Marque a autorização para podermos te avisar.';
    return;
  }
  submitButton.disabled = true;
  statusLine.textContent = 'Enviando…';
  try {
    const result = await fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: data.get('name'),
        email: data.get('email'),
        instagram: data.get('instagram'),
        niche: data.get('niche'),
        campaigns_per_month: data.get('campaigns_per_month'),
        biggest_pain: data.get('biggest_pain'),
        founder_interest: form.querySelector('#wl-founder').checked,
        consent: true,
        website: data.get('website'),
        source: sourceFromUrl()
      })
    });
    const body = await result.json().catch(() => ({}));
    if (!result.ok) throw new Error(body.error || 'Não foi possível entrar na lista agora. Tente de novo em instantes.');
    form.hidden = true;
    done.hidden = false;
    done.querySelector('h3').focus?.();
  } catch (error) {
    statusLine.textContent = error.message || 'Não foi possível entrar na lista agora. Tente de novo em instantes.';
  } finally {
    submitButton.disabled = false;
  }
});

const shareButton = document.querySelector('#wl-share');
shareButton.addEventListener('click', async () => {
  const link = `${window.location.origin}/lista`;
  try {
    await navigator.clipboard.writeText(link);
    shareButton.textContent = 'Link copiado!';
  } catch {
    shareButton.textContent = link;
  }
});
