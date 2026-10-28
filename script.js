// Theme toggle: follows the OS until the visitor picks one.
const root = document.documentElement;
document.getElementById('theme-toggle').addEventListener('click', () => {
  const current = root.dataset.theme
    || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = current === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;
  localStorage.setItem('theme', next);
});

// The bloom: one petal per upstream project, length scaled by log(stars).
const upstream = [
  { id: 'docusaurus', label: 'docusaurus', repo: 'facebook/docusaurus', stars: 66595, prs: 1 },
  { id: 'k6', label: 'k6', repo: 'grafana/k6', stars: 32066, prs: 3 },
  { id: 'lexical', label: 'lexical', repo: 'facebook/lexical', stars: 23984, prs: 2 },
  { id: 'playwright', label: 'playwright-python', repo: 'microsoft/playwright-python', stars: 15069, prs: 1 },
  { id: 'osv', label: 'osv-scanner', repo: 'google/osv-scanner', stars: 11298, prs: 1 },
  { id: 'gogcli', label: 'gogcli', repo: 'openclaw/gogcli', stars: 8539, prs: 2 },
  { id: 'azure', label: 'azure-cli', repo: 'Azure/azure-cli', stars: 4657, prs: 1 },
  { id: 'ggcr', label: 'go-containerregistry', repo: 'google/go-containerregistry', stars: 4103, prs: 3 },
  { id: 'cel', label: 'cel-go', repo: 'cel-expr/cel-go', stars: 3133, prs: 2 },
];
const petalColors = ['--mint', '--lilac', '--peach', '--sky', '--butter'];

function drawBloom(svg) {
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, parent) => {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (parent) parent.appendChild(node);
    return node;
  };
  const core = 52;
  const lo = Math.log(3000), hi = Math.log(70000);
  const step = 360 / upstream.length;

  upstream.forEach((p, i) => {
    const color = `var(${petalColors[i % petalColors.length]})`;
    const len = 80 + 150 * (Math.log(p.stars) - lo) / (hi - lo);
    const w = 30 + p.prs * 7;
    const angle = -90 + i * step;
    const rad = angle * Math.PI / 180;

    const link = el('a', { href: `#repo-${p.id}`, class: 'petal', 'aria-label': `${p.repo}: ${p.prs} merged pull request${p.prs > 1 ? 's' : ''}` }, svg);
    link.style.setProperty('--i', i);
    el('title', {}, link).textContent = `${p.repo}, ${p.stars.toLocaleString()} stars, ${p.prs} merged PR${p.prs > 1 ? 's' : ''}`;

    const g = el('g', { transform: `rotate(${angle})` }, link);
    const a = core - 6, b = core + len;
    el('path', {
      d: `M${a},0 C${a + len * 0.25},${-w} ${a + len * 0.8},${-w * 0.95} ${b},0 C${a + len * 0.8},${w * 0.95} ${a + len * 0.25},${w} ${a},0 Z`,
      fill: color,
    }, g);

    const mid = core + len * 0.62;
    el('text', { class: 'count', x: Math.cos(rad) * mid, y: Math.sin(rad) * mid, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, link)
      .textContent = p.prs;

    const lr = b + 14;
    const cos = Math.cos(rad);
    el('text', {
      class: 'label',
      x: cos * lr, y: Math.sin(rad) * lr,
      'text-anchor': Math.abs(cos) < 0.25 ? 'middle' : cos > 0 ? 'start' : 'end',
      'dominant-baseline': 'central',
    }, link).textContent = p.label;

    const card = document.getElementById(`repo-${p.id}`);
    if (card) card.style.setProperty('--c', color);
  });

  el('circle', { class: 'bloom-core', r: core }, svg);
  el('text', { class: 'bloom-core-text', y: -4, 'text-anchor': 'middle' }, svg).textContent = '16';
  el('text', { class: 'bloom-core-sub', y: 14, 'text-anchor': 'middle' }, svg).textContent = 'merged PRs';
}

drawBloom(document.getElementById('bloom-svg'));

// Contact form via EmailJS.
const form = document.getElementById('contact-form');
const status = document.getElementById('form-status');
form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!window.emailjs) {
    status.textContent = 'The form could not load. Message me on X at @ronin_lab instead.';
    return;
  }
  const button = form.querySelector('button');
  button.disabled = true;
  status.textContent = 'Sending…';
  emailjs.init('ATlJunWlfoUMFBJJy');
  emailjs.sendForm('service_7et6vtg', 'template_8u2onnm', form)
    .then(() => {
      status.textContent = 'Sent. Thanks, I’ll reply by email.';
      form.reset();
    })
    .catch((err) => {
      console.error('EmailJS error:', err);
      status.textContent = 'Your message didn’t send. Try again, or message me on X at @ronin_lab.';
    })
    .finally(() => { button.disabled = false; });
});
