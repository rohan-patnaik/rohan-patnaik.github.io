// Theme toggle: follows the OS until the visitor picks one.
const root = document.documentElement;
document.getElementById('theme-toggle').addEventListener('click', () => {
  const current = root.dataset.theme
    || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  const next = current === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;
  localStorage.setItem('theme', next);
});

// Hero graph: me -> language -> upstream repos I've had PRs merged into.
const langs = [
  { id: 'ts', label: 'typescript' },
  { id: 'go', label: 'go' },
  { id: 'py', label: 'python' },
];
const repos = [
  { id: 'docusaurus', label: 'docusaurus', full: 'facebook/docusaurus', lang: 'ts', prs: 1, stars: '66k' },
  { id: 'lexical', label: 'lexical', full: 'facebook/lexical', lang: 'ts', prs: 2, stars: '24k' },
  { id: 'k6', label: 'k6', full: 'grafana/k6', lang: 'go', prs: 3, stars: '32k' },
  { id: 'osv', label: 'osv-scanner', full: 'google/osv-scanner', lang: 'go', prs: 1, stars: '11k' },
  { id: 'gogcli', label: 'gogcli', full: 'openclaw/gogcli', lang: 'go', prs: 2, stars: '8.5k' },
  { id: 'ggcr', label: 'go-containerregistry', full: 'google/go-containerregistry', lang: 'go', prs: 3, stars: '4k' },
  { id: 'cel', label: 'cel-go', full: 'cel-expr/cel-go', lang: 'go', prs: 2, stars: '3k' },
  { id: 'playwright', label: 'playwright-python', full: 'microsoft/playwright-python', lang: 'py', prs: 1, stars: '15k' },
  { id: 'azure', label: 'azure-cli', full: 'Azure/azure-cli', lang: 'py', prs: 1, stars: '4.6k' },
];

function buildGraph(svg) {
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, parent) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    parent.appendChild(n);
    return n;
  };
  const readout = document.getElementById('graph-readout');
  const idle = readout.textContent;

  const X = { me: 34, lang: 150, repo: 268 };
  const top = 26, gap = 38;
  repos.forEach((r, i) => { r.x = X.repo; r.y = top + i * gap; });
  langs.forEach((l) => {
    const mine = repos.filter((r) => r.lang === l.id);
    l.x = X.lang;
    l.y = mine.reduce((s, r) => s + r.y, 0) / mine.length;
    l.repos = mine;
  });
  const me = { x: X.me, y: top + (repos.length - 1) * gap / 2 };

  const curve = (a, b) => {
    const mx = (a.x + b.x) / 2;
    return `M${a.x},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`;
  };
  const edgeLayer = el('g', {}, svg);
  const pulseLayer = el('g', {}, svg);
  const nodeLayer = el('g', {}, svg);

  langs.forEach((l) => { l.edge = el('path', { class: 'edge', d: curve(me, l) }, edgeLayer); });
  repos.forEach((r) => {
    r.parent = langs.find((l) => l.id === r.lang);
    r.edge = el('path', { class: 'edge', d: curve(r.parent, r) }, edgeLayer);
  });

  const node = (d, r, label, cls, side) => {
    const g = el('g', { class: `node ${cls}`, transform: `translate(${d.x},${d.y})` }, nodeLayer);
    el('circle', { class: 'core', r }, g);
    const t = el('text', { x: side === 'below' ? 0 : r + 7, y: side === 'below' ? r + 15 : 0, 'dominant-baseline': 'central', 'text-anchor': side === 'below' ? 'middle' : 'start' }, g);
    t.textContent = label;
    d.g = g;
    return g;
  };

  node(me, 7, 'rohan', 'root', 'below');
  langs.forEach((l) => node(l, 4.5, l.label, 'lang', 'below'));
  repos.forEach((r) => {
    const g = node(r, 3 + r.prs * 1.3, `${r.label} ${r.prs}`, 'repo', 'right');
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'link');
    g.setAttribute('aria-label', `${r.full}: ${r.prs} merged pull request${r.prs > 1 ? 's' : ''}`);
  });

  const clear = () => {
    svg.querySelectorAll('.on').forEach((n) => n.classList.remove('on'));
    readout.textContent = idle;
  };
  const lightRepo = (r) => {
    [r.g, r.edge, r.parent.g, r.parent.edge, me.g].forEach((n) => n.classList.add('on'));
  };
  const showRepo = (r) => {
    clear();
    lightRepo(r);
    readout.textContent = `${r.full}: ${r.prs} merged PR${r.prs > 1 ? 's' : ''}, ${r.stars} stars`;
  };
  const showLang = (l) => {
    clear();
    l.repos.forEach(lightRepo);
    const n = l.repos.reduce((s, r) => s + r.prs, 0);
    readout.textContent = `${l.label}: ${n} merged PRs across ${l.repos.length} repos`;
  };

  repos.forEach((r) => {
    const go = () => { location.hash = `r-${r.id}`; };
    r.g.addEventListener('mouseenter', () => showRepo(r));
    r.g.addEventListener('focus', () => showRepo(r));
    r.g.addEventListener('click', go);
    r.g.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  });
  langs.forEach((l) => {
    l.g.addEventListener('mouseenter', () => showLang(l));
    l.g.addEventListener('click', () => showLang(l));
  });
  svg.addEventListener('mouseleave', clear);
  svg.addEventListener('focusout', (e) => { if (!svg.contains(e.relatedTarget)) clear(); });

  // Idle signal: a dot travels from me to a random repo, like a forward pass.
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const fire = () => {
    const r = repos[Math.floor(Math.random() * repos.length)];
    const legs = [r.parent.edge, r.edge];
    const dot = el('circle', { class: 'pulse', r: 2.4 }, pulseLayer);
    const dur = 650;
    let leg = 0, start = null;
    const step = (t) => {
      if (start === null) start = t;
      const p = Math.min((t - start) / dur, 1);
      const path = legs[leg];
      const pt = path.getPointAtLength(p * path.getTotalLength());
      dot.setAttribute('cx', pt.x);
      dot.setAttribute('cy', pt.y);
      if (p < 1) return requestAnimationFrame(step);
      if (++leg < legs.length) { start = null; return requestAnimationFrame(step); }
      dot.remove();
    };
    requestAnimationFrame(step);
  };
  setInterval(() => { if (!document.hidden) fire(); }, 1400);
}

buildGraph(document.getElementById('graph'));

// Contact form via EmailJS.
const form = document.getElementById('contact-form');
const status = document.getElementById('form-status');
form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!window.emailjs) {
    status.textContent = 'The form didn’t load. DM me on X at @ronin_lab instead.';
    return;
  }
  const button = form.querySelector('button');
  button.disabled = true;
  status.textContent = 'sending…';
  emailjs.init('ATlJunWlfoUMFBJJy');
  emailjs.sendForm('service_7et6vtg', 'template_8u2onnm', form)
    .then(() => {
      status.textContent = 'Sent. Thanks, I’ll reply by email.';
      form.reset();
    })
    .catch((err) => {
      console.error('EmailJS error:', err);
      status.textContent = 'Your message didn’t send. Try again, or DM me on X at @ronin_lab.';
    })
    .finally(() => { button.disabled = false; });
});
