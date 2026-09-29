'use strict';
(async () => {
  const button = document.getElementById('print'),
    status = document.getElementById('printStatus');
  const urls = [
    ...new Set(
      Array.from(document.querySelectorAll('.art img,.art image')).map(
        (node) => node.getAttribute('src') || node.getAttribute('href'),
      ),
    ),
  ];
  try {
    await Promise.all(
      urls.map(
        (src) =>
          new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = resolve;
            image.onerror = () => reject(Error('Artwork could not load. Reload before printing.'));
            image.src = src;
          }),
      ),
    );
    await document.fonts.ready;
    button.disabled = false;
    button.textContent = 'Choose printer & print';
  } catch (error) {
    status.textContent = error.message;
    button.textContent = 'Artwork unavailable';
  }
  button.onclick = () => window.print();
  window.addEventListener('afterprint', () => {
    status.textContent =
      'Print dialog closed. Confirm the physical output before marking the job printed in the admin panel.';
  });
})();
