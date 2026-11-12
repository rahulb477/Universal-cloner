// Client runtime for the reconstructed site. It restores behaviour that the original site implemented
// with its own JavaScript: recorded toggles/tabs/dialogs, forms, search, active navigation and sign-in.
(() => {
  'use strict';
  const el = document.getElementById('uwc-data');
  if (!el) return;
  const data = JSON.parse(el.textContent);
  const ROOT = document.querySelector('meta[name="uwc-root"]')?.content || './';
  const { site } = data;
  const features = site.features || {};
  const href = (route) => ROOT + (route === '/' ? '' : route.slice(1));
  const byId = (id) => document.querySelector('[data-uwc-id="' + id + '"]');

  /* ---------- session ---------- */
  const KEY = 'uwc-session:' + new URL(ROOT, location.href).pathname;
  let memoryToken = null;
  const session = {
    get() { try { return localStorage.getItem(KEY) || memoryToken; } catch { return memoryToken; } },
    set(t) { memoryToken = t; try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch { /* storage blocked */ } },
  };
  async function api(path, options = {}) {
    const headers = { accept: 'application/json', ...(options.body ? { 'content-type': 'application/json' } : {}) };
    const t = session.get();
    if (t) headers.authorization = 'Bearer ' + t;
    const res = await fetch(ROOT + 'api/' + path, { method: options.method || (options.body ? 'POST' : 'GET'), headers, body: options.body ? JSON.stringify(options.body) : undefined, credentials: 'same-origin' });
    let json = {};
    try { json = await res.json(); } catch { /* empty body */ }
    return { ok: res.ok, status: res.status, json };
  }

  /* ---------- protected pages ---------- */
  const guarded = document.documentElement.hasAttribute('data-uwc-guard');
  const authReady = features.auth
    ? api('auth/me').then((r) => (r.ok ? r.json.user : null)).catch(() => null)
    : Promise.resolve(null);
  authReady.then((user) => {
    if (guarded && !user) {
      if (site.loginRoute) location.replace(href(site.loginRoute) + '?next=' + encodeURIComponent(data.route));
      else document.documentElement.removeAttribute('data-uwc-guard');
      return;
    }
    document.documentElement.removeAttribute('data-uwc-guard');
    document.documentElement.toggleAttribute('data-uwc-signed-in', !!user);
  });

  /* ---------- active navigation ---------- */
  const here = location.pathname.replace(/\/$/, '') || '/';
  for (const comp of document.querySelectorAll('[data-uwc-component]')) {
    const cls = comp.getAttribute('data-uwc-active-class');
    const onParent = comp.getAttribute('data-uwc-active-on') === 'parent';
    for (const a of comp.querySelectorAll('a[href]')) {
      let p; try { p = new URL(a.getAttribute('href'), location.href).pathname.replace(/\/$/, '') || '/'; } catch { continue; }
      if (p !== here || a.getAttribute('href').startsWith('#')) continue;
      a.setAttribute('aria-current', 'page');
      if (cls) (onParent && a.parentElement ? a.parentElement : a).classList.add(cls);
    }
  }

  /* ---------- recorded interactions ---------- */
  function apply(changes, forward) {
    for (const c of changes) {
      const t = byId(c.id);
      if (!t) continue;
      const v = forward ? c.after : c.before;
      if (c.dialog && c.attr === 'open' && typeof t.showModal === 'function') {
        try { v === null ? t.close() : (t.open || t.showModal()); } catch { v === null ? t.removeAttribute('open') : t.setAttribute('open', ''); }
        continue;
      }
      if (v === null) t.removeAttribute(c.attr); else t.setAttribute(c.attr, v);
    }
  }
  const active = new Set();
  const recipes = data.interactions || [];
  for (const r of recipes) {
    const trigger = byId(r.trigger);
    if (!trigger) continue;
    const isDialog = r.changes.some((c) => c.dialog);
    trigger.addEventListener('click', (e) => {
      if (trigger.tagName === 'A') e.preventDefault();
      if (r.kind === 'tab') {
        for (const o of recipes) if (o !== r && o.kind === 'tab' && o.group === r.group && active.has(o)) { apply(o.changes, false); active.delete(o); }
        apply(r.changes, true);
        active.add(r);
        return;
      }
      const on = !active.has(r);
      apply(r.changes, on);
      on && !isDialog ? active.add(r) : active.delete(r);
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    for (const r of [...active]) if (r.kind === 'toggle') { apply(r.changes, false); active.delete(r); }
  });
  // Dialogs: close buttons and backdrop clicks.
  for (const d of document.querySelectorAll('dialog')) {
    d.addEventListener('click', (e) => {
      const b = e.target.closest('button, [role=button], a');
      const label = b ? ((b.textContent || '') + ' ' + (b.getAttribute('aria-label') || '') + ' ' + (b.id || '') + ' ' + (b.className || '')).toLowerCase() : '';
      if (e.target === d || (b && /close|cancel|dismiss|×|✕/.test(label))) { try { d.close(); } catch { d.removeAttribute('open'); } }
    });
  }

  /* ---------- forms ---------- */
  function note(form, message, kind) {
    let n = form.querySelector('[data-uwc-note]');
    const alert = form.querySelector('[role=alert]');
    if (kind === 'error' && alert) { alert.textContent = message; if (n) n.remove(); return; }
    if (alert) alert.textContent = '';
    if (!n) { n = document.createElement('p'); n.setAttribute('data-uwc-note', ''); n.setAttribute('role', 'status'); form.appendChild(n); }
    n.dataset.kind = kind;
    n.textContent = message;
  }
  function values(form) {
    const out = {};
    for (const [k, v] of new FormData(form).entries()) {
      if (typeof v !== 'string') continue;
      out[k] = k in out ? [].concat(out[k], v) : v;
    }
    return out;
  }
  function fieldErrors(form, fields) {
    form.querySelectorAll('[data-uwc-invalid]').forEach((f) => { f.removeAttribute('data-uwc-invalid'); f.removeAttribute('aria-invalid'); });
    for (const name of Object.keys(fields || {})) {
      const f = form.elements[name];
      const target = f && f.length && !f.tagName ? f[0] : f;
      if (target && target.setAttribute) { target.setAttribute('data-uwc-invalid', ''); target.setAttribute('aria-invalid', 'true'); }
    }
  }
  async function submitAuth(form, kind) {
    const v = values(form);
    const pwField = form.querySelector('input[type=password]');
    const idField = Array.from(form.querySelectorAll('input')).find((i) => !['password', 'hidden', 'checkbox', 'radio', 'submit', 'button'].includes(i.type));
    const body = { identifier: idField ? idField.value : '', password: pwField ? pwField.value : '', name: v.name || v.fullname || v.full_name || '' };
    const r = await api(kind === 'register' ? 'auth/register' : 'auth/login', { body });
    if (!r.ok) return note(form, r.json.error || 'Sign-in failed.', 'error');
    session.set(r.json.token);
    const next = new URLSearchParams(location.search).get('next');
    const known = site.routes.some((x) => x.route === next);
    location.assign(href(known ? next : site.afterLoginRoute || site.startRoute || '/'));
  }
  for (const form of document.querySelectorAll('form[data-uwc-form]')) {
    const id = form.getAttribute('data-uwc-form');
    const kind = form.getAttribute('data-uwc-form-kind') || 'generic';
    form.setAttribute('novalidate', '');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (kind === 'search') { const q = form.querySelector('input[type=search], input[type=text], input:not([type])'); return runSearch(q ? q.value : '', form); }
      const btn = form.querySelector('[type=submit], button:not([type])');
      if (btn) btn.disabled = true;
      try {
        if (!form.checkValidity()) { form.reportValidity(); return; }
        if (features.backend === false) return note(form, 'This copy was generated without backend services, so the form is not submitted anywhere.', 'info');
        if ((kind === 'login' || kind === 'register') && features.auth) return await submitAuth(form, kind);
        const r = await api('forms/' + id, { body: { ...values(form), __route: data.route } });
        fieldErrors(form, r.json.fields);
        if (!r.ok) return note(form, r.json.error || 'The form could not be submitted.', 'error');
        form.reset();
        note(form, 'Thank you — your submission was received.', 'success');
      } catch {
        note(form, 'Network error. Please try again.', 'error');
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  }

  /* ---------- sign out ---------- */
  for (const a of document.querySelectorAll('[data-uwc-logout]')) {
    a.addEventListener('click', async (e) => {
      e.preventDefault();
      if (features.auth) { try { await api('auth/logout', { method: 'POST' }); } catch { /* offline */ } }
      session.set(null);
      location.assign(href(site.loginRoute || site.startRoute || '/'));
    });
  }

  /* ---------- search ---------- */
  let panel = null, staticIndex = null;
  async function query(q) {
    if (features.backend !== false) { const r = await api('search?q=' + encodeURIComponent(q)); return r.json.results || []; }
    staticIndex = staticIndex || (await (await fetch(ROOT + 'search-index.json')).json());
    const terms = q.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
    return staticIndex.filter((p) => terms.some((t) => (p.title + ' ' + p.text).toLowerCase().includes(t))).slice(0, 10)
      .map((p) => { const i = Math.max(0, p.text.toLowerCase().indexOf(terms[0]) - 60); return { route: p.route, title: p.title, snippet: p.text.slice(i, i + 180) }; });
  }
  async function runSearch(q, anchor) {
    q = (q || '').trim();
    if (panel) panel.remove();
    if (!q) return;
    panel = document.createElement('div');
    panel.setAttribute('data-uwc-search-results', '');
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'Search results');
    panel.textContent = 'Searching…';
    anchor.insertAdjacentElement('afterend', panel);
    let results = [];
    try { results = await query(q); } catch { panel.textContent = 'Search is unavailable right now.'; return; }
    panel.textContent = '';
    const head = document.createElement('p');
    head.textContent = results.length ? results.length + ' result' + (results.length === 1 ? '' : 's') + ' for “' + q + '”' : 'No results for “' + q + '”';
    panel.appendChild(head);
    for (const r of results) {
      const a = document.createElement('a');
      a.href = href(r.route);
      const strong = document.createElement('strong'); strong.textContent = r.title;
      const span = document.createElement('span'); span.textContent = r.snippet;
      a.append(strong, span);
      panel.appendChild(a);
    }
  }
  for (const input of document.querySelectorAll('input[data-uwc-search]')) {
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); runSearch(input.value, input); } });
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && panel) { panel.remove(); panel = null; } });
})();
