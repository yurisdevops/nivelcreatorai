const tabs = document.querySelectorAll('.install-tab');
function showOs(os) {
  tabs.forEach((tab) => {
    const active = tab.dataset.os === os;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('[data-os-panel]').forEach((panel) => { panel.hidden = panel.dataset.osPanel !== os; });
}
tabs.forEach((tab) => tab.addEventListener('click', () => showOs(tab.dataset.os)));
if (/android/i.test(navigator.userAgent)) showOs('android');

let installPrompt = null;
const installButton = document.querySelector('#install-now');
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  installButton.hidden = false;
});
installButton.addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  installButton.hidden = true;
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
