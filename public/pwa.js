'use strict';
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
let installPrompt;
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  const button = document.getElementById('installApp');
  if (button) button.hidden = false;
});
const installButton = document.getElementById('installApp');
if (installButton)
  installButton.onclick = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    installButton.hidden = true;
  };
window.addEventListener('appinstalled', () => {
  if (installButton) installButton.hidden = true;
});
