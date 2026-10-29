// Theme toggle: follows the OS until the visitor picks one.
const root = document.documentElement;
document.getElementById('theme-toggle').addEventListener('click', () => {
  const current = root.dataset.theme
    || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  const next = current === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;
  localStorage.setItem('theme', next);
});

// Hero graph: me -> language -> popular repos I've had PRs merged into.
// Repo data is written into index.html by scripts/update_oss.py.
const repos = JSON.parse(document.getElementById('oss-data')?.textContent || '[]');
const langOrder = ['typescript', 'go', 'python', 'rust, c++', 'other'];
repos.sort((a, b) => langOrder.indexOf(a.lang) - langOrder.indexOf(b.lang));
const langLabels = { typescript: 'TypeScript', go: 'Go', python: 'Python', 'rust, c++': 'Rust, C++', other: 'Other' };
const langs = langOrder.filter((l) => repos.some((r) => r.lang === l)).map((l) => ({ id: l, label: langLabels[l] }));

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

  const X = { me: 30, lang: 128, repo: 232 };
  const gap = Math.min(38, 312 / Math.max(repos.length - 1, 1));
  const top = (360 - gap * (repos.length - 1)) / 2 - 8;
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

  node(me, 7, 'Rohan', 'root', 'below');
  langs.forEach((l) => node(l, 4.5, l.label, 'lang', 'below'));
  repos.forEach((r) => {
    const g = node(r, 3 + Math.min(r.prs, 3) * 1.3, `${r.label} (${r.short})`, 'repo', 'right');
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'link');
    g.setAttribute('aria-label', `${r.full}, ${r.company}`);
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
    readout.textContent = `${r.full} (${r.company}), ${r.stars} stars`;
  };
  const showLang = (l) => {
    clear();
    l.repos.forEach(lightRepo);
    readout.textContent = `${l.label}: ${l.repos.map((r) => r.label).join(', ')}`;
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

if (repos.length) buildGraph(document.getElementById('graph'));

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
  status.textContent = 'Sending…';
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

// Highlight the nav link for the section in view.
const navLinks = [...document.querySelectorAll('.nav a')];
const spy = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    navLinks.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${entry.target.id}`));
  });
}, { rootMargin: '-45% 0px -50% 0px' });
navLinks.forEach((a) => { const s = document.querySelector(a.getAttribute('href')); if (s) spy.observe(s); });

// Things Shipped: show five rows plus a peek of the sixth; the rest scroll inside the box.
const ships = document.getElementById('ships');
const shipsWrap = ships?.parentElement;
const shipsMore = document.getElementById('ships-more');
function sizeShips() {
  const rows = ships.children;
  if (rows.length <= 5) return;
  const peek = rows[5];
  ships.style.maxHeight = `${peek.offsetTop - ships.offsetTop + peek.offsetHeight * 0.4}px`;
  shipsWrap.classList.add('has-more');
  updateShips();
}
function updateShips() {
  const atEnd = ships.scrollTop + ships.clientHeight >= ships.scrollHeight - 4;
  shipsWrap.classList.toggle('at-end', atEnd);
  const hidden = [...ships.children].filter((r) => r.offsetTop - ships.offsetTop + r.offsetHeight > ships.scrollTop + ships.clientHeight + 4).length;
  document.getElementById('ships-more-n').textContent = hidden || 1;
}
if (ships) {
  sizeShips();
  addEventListener('resize', sizeShips);
  ships.addEventListener('scroll', updateShips, { passive: true });
  shipsMore.addEventListener('click', () => ships.scrollBy({ top: ships.clientHeight * 0.8, behavior: 'smooth' }));
  // Thumbnail videos play while their row is hovered or focused.
  ships.querySelectorAll('.ship a').forEach((link) => {
    const v = link.querySelector('video');
    if (!v) return;
    const play = () => v.play().catch(() => {});
    const stop = () => { v.pause(); };
    link.addEventListener('mouseenter', play);
    link.addEventListener('mouseleave', stop);
    link.addEventListener('focus', play);
    link.addEventListener('blur', stop);
  });
}
