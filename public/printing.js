'use strict';
const products = PrintProducts;
const get = (id) => document.getElementById(id);
let category = 'All';
const categories = ['All', ...new Set(products.map((product) => product.category))];
const art = {
  flex: '<div class="board-art"><span>YOUR BRAND.<br><b>UP IN LIGHTS.</b><i>YOUR NEXT BIG THING STARTS HERE</i></span></div>',
  wedding:
    '<div class="invite-art"><span>TOGETHER<br><b>forever</b><i>THE WEDDING CELEBRATION</i></span></div>',
  mugs: '<div class="mug-art"><span>good<br><b>days.</b></span></div>',
  tshirts: '<div class="shirt-art"><span>MAKE<br>IT YOURS<span class="spark">✳</span></span></div>',
  idcards:
    '<div class="card-art"><span>YOUR SCHOOL</span><b>☺</b><strong>YOUR NAME</strong><i>||||||||||||</i></div>',
};
// Catalog text is bundled with the app; remote branding is always set as text.
function renderProducts() {
  const query = get('searchProducts').value.trim().toLowerCase();
  const visible = products.filter(
    (product) =>
      (category === 'All' || product.category === category) &&
      `${product.name} ${product.category} ${product.description} ${product.options.join(' ')}`
        .toLowerCase()
        .includes(query),
  );
  get('productGrid').innerHTML = visible
    .map(
      (product) =>
        `<article class="product"><div class="product-art art-${product.id}" aria-hidden="true"><span class="product-tag">${product.category}</span>${art[product.id]}</div><div class="product-body"><p class="eyebrow">${product.tag}</p><h3>${product.name}</h3><p>${product.description}</p><div class="product-options">${product.options.map((option) => `<span>${option}</span>`).join('')}</div><button type="button" class="quote-link" data-product="${product.id}">Get a quote <span>↗</span></button></div></article>`,
    )
    .join('');
  get('emptyProducts').hidden = visible.length !== 0;
}
function renderCategories() {
  get('categories').innerHTML = categories
    .map(
      (value) =>
        `<button type="button" data-category="${value}" aria-pressed="${category === value}">${value === 'All' ? 'All products' : value}</button>`,
    )
    .join('');
}
function updateOptions() {
  const product = products.find((product) => product.id === get('quoteProduct').value);
  get('quoteOption').replaceChildren(...product.options.map((value) => new Option(value, value)));
  get('detailsHint').textContent = product.details;
}
get('quoteProduct').replaceChildren(
  ...products.map((product) => new Option(product.name, product.id)),
);
get('quoteProduct').addEventListener('change', updateOptions);
get('searchProducts').addEventListener('input', renderProducts);
get('categories').addEventListener('click', (event) => {
  const button = event.target.closest('[data-category]');
  if (button) {
    category = button.dataset.category;
    renderCategories();
    renderProducts();
  }
});
get('productGrid').addEventListener('click', (event) => {
  const button = event.target.closest('[data-product]');
  if (!button) return;
  get('quoteProduct').value = button.dataset.product;
  updateOptions();
  get('quote').scrollIntoView({ behavior: 'smooth' });
  get('quoteProduct').focus({ preventScroll: true });
});
get('quoteForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = get('sendQuote');
  if (button.disabled) return;
  get('quoteError').hidden = true;
  get('quoteSuccess').hidden = true;
  const body = Object.fromEntries(new FormData(event.currentTarget));
  body.quantity = Number(body.quantity);
  button.disabled = true;
  button.textContent = 'Sending…';
  try {
    const response = await fetch('/api/printing/enquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.message || 'Unable to send your request. Please try again.');
    get('quoteSuccess').textContent = `${result.message} Reference: ${result.id}`;
    get('quoteSuccess').hidden = false;
    get('quoteForm').reset();
    updateOptions();
  } catch (error) {
    get('quoteError').textContent = error.message;
    get('quoteError').hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = 'Send quote request ↗';
  }
});
renderCategories();
renderProducts();
updateOptions();
fetch('/api/printing/catalog')
  .then((response) => {
    if (!response.ok) throw new Error('Catalog unavailable');
    return response.json();
  })
  .then((catalog) => {
    document.querySelectorAll('[data-shop-name]').forEach((node) => {
      node.textContent = catalog.name;
    });
    document.title = `${catalog.name} — Printing for your business & celebrations`;
  })
  .catch(() => {
    /* The bundled catalog remains available when the server is unreachable. */
  });
