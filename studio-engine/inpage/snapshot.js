// Runs inside the reference page after interactions were probed. Produces a script-free, URL-tokenised
// copy of the rendered document plus a form inventory. The live page is only annotated with data-uwc-* attributes.
(() => {
  const tokens = [];
  const tok = (url, kind) => { tokens.push({ url, kind }); return '__UWC_' + (tokens.length - 1) + '__'; };
  const abs = (u) => { try { return new URL(u, document.baseURI).href; } catch { return null; } };
  const isHttp = (u) => /^https?:/i.test(u || '');
  const text = (el) => (el?.textContent || '').trim().replace(/\s+/g, ' ');
  const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); };

  /* ---- forms (annotated on the live DOM so the clone keeps the markers) ---- */
  const forms = [];
  for (const form of Array.from(document.forms)) {
    const fields = [];
    for (const el of Array.from(form.elements)) {
      const tag = el.tagName.toLowerCase();
      if (!['input', 'select', 'textarea'].includes(tag)) continue;
      const type = (el.getAttribute('type') || (tag === 'input' ? 'text' : tag)).toLowerCase();
      if (['submit', 'button', 'reset', 'image'].includes(type)) continue;
      const label = el.labels && el.labels[0] ? text(el.labels[0]) : (el.getAttribute('aria-label') || el.getAttribute('placeholder') || '');
      fields.push({
        name: el.getAttribute('name') || el.id || '', type, required: !!el.required, label: label.slice(0, 80),
        hidden: type === 'hidden',
        options: tag === 'select' ? Array.from(el.options).slice(0, 30).map((o) => o.value) : undefined,
      });
    }
    const visible = fields.filter((f) => !f.hidden);
    const pw = visible.filter((f) => f.type === 'password');
    const isSearch = form.getAttribute('role') === 'search' || visible.some((f) => f.type === 'search' || /^(q|query|search|s|keyword|keywords)$/i.test(f.name));
    let kind = 'generic';
    if (pw.length >= 2 || (pw.length === 1 && visible.length > 3)) kind = 'register';
    else if (pw.length === 1) kind = 'login';
    else if (isSearch && visible.length <= 2) kind = 'search';
    else if (visible.length === 1 && visible[0].type === 'email') kind = 'newsletter';
    else if (visible.some((f) => f.type === 'textarea')) kind = 'contact';
    let actionPath = '';
    if (form.getAttribute('action')) { try { actionPath = new URL(form.getAttribute('action'), document.baseURI).pathname; } catch {} }
    const id = 'f' + hash(kind + '|' + actionPath + '|' + fields.map((f) => f.name + ':' + f.type).join(','));
    form.setAttribute('data-uwc-form', id);
    form.setAttribute('data-uwc-form-kind', kind);
    const submit = form.querySelector('button[type=submit], button:not([type]), input[type=submit]');
    forms.push({ id, kind, method: (form.getAttribute('method') || 'get').toLowerCase(), actionPath, fields, submitLabel: submit ? (text(submit) || submit.value || '') .slice(0, 60) : '' });
  }
  // Search inputs that live outside a <form>.
  for (const el of Array.from(document.querySelectorAll('input[type=search]'))) {
    if (!el.form) el.setAttribute('data-uwc-search', '1');
  }
  for (const a of Array.from(document.querySelectorAll('a[href]'))) {
    let p = ''; try { p = new URL(a.getAttribute('href'), document.baseURI).pathname; } catch {}
    if (/(^|\/)(log-?out|sign-?out|signoff|logoff)(\/|$|\.)/i.test(p)) a.setAttribute('data-uwc-logout', '1');
  }

  /* ---- stylesheets, read from the live document ---- */
  const styles = [];
  let si = 0;
  for (const el of Array.from(document.querySelectorAll('style, link[rel~="stylesheet" i]'))) {
    const id = si++;
    el.setAttribute('data-uwc-style', String(id));
    let rules = null;
    try { if (el.sheet) rules = Array.from(el.sheet.cssRules).map((r) => r.cssText).join('\n'); } catch {}
    if (el.tagName === 'STYLE') {
      const raw = el.textContent || '';
      styles.push({ id, kind: 'inline', base: document.baseURI, media: el.getAttribute('media') || '', css: raw.trim() ? raw : (rules || '') });
    } else {
      styles.push({ id, kind: 'link', href: el.href, base: el.href, media: el.getAttribute('media') || '', css: null, rules, disabled: !!el.disabled });
    }
  }
  if (document.adoptedStyleSheets && document.adoptedStyleSheets.length) {
    let css = '';
    for (const s of document.adoptedStyleSheets) { try { css += Array.from(s.cssRules).map((r) => r.cssText).join('\n') + '\n'; } catch {} }
    if (css.trim()) styles.push({ id: si++, kind: 'adopted', base: document.baseURI, media: '', css });
  }

  /* ---- canvases become images ---- */
  const canvasData = Array.from(document.querySelectorAll('canvas')).map((c) => { try { return c.width && c.height ? c.toDataURL('image/png') : null; } catch { return null; } });
  const liveImgs = Array.from(document.querySelectorAll('img')).map((i) => i.currentSrc || '');

  /* ---- clone and clean ---- */
  const doc = document.documentElement.cloneNode(true);
  const report = { scriptsRemoved: 0, iframesKept: [], iframesRemoved: 0, canvasesConverted: 0, canvasesLost: 0, shadowRoots: Array.from(document.querySelectorAll('*')).filter((e) => e.shadowRoot).length, blobUrls: 0 };
  doc.querySelectorAll('img').forEach((img, i) => {
    const src = img.getAttribute('src') || '';
    if ((!src || src.startsWith('data:image/gif') || src.startsWith('data:image/svg')) && liveImgs[i] && isHttp(liveImgs[i])) img.setAttribute('src', liveImgs[i]);
    if (!img.getAttribute('src')) { const d = img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.getAttribute('data-original'); if (d) img.setAttribute('src', d); }
    img.removeAttribute('loading');
  });
  doc.querySelectorAll('canvas').forEach((c, i) => {
    const data = canvasData[i];
    if (!data) { report.canvasesLost++; return; }
    const img = document.createElement('img');
    for (const a of Array.from(c.attributes)) if (['class', 'style', 'id', 'width', 'height'].includes(a.name)) img.setAttribute(a.name, a.value);
    img.setAttribute('src', data); img.setAttribute('alt', c.getAttribute('aria-label') || '');
    c.replaceWith(img); report.canvasesConverted++;
  });
  doc.querySelectorAll('script, noscript, base, template[shadowrootmode]').forEach((el) => { if (el.tagName === 'SCRIPT') report.scriptsRemoved++; el.remove(); });
  doc.querySelectorAll('meta[http-equiv]').forEach((el) => el.remove());
  doc.querySelectorAll('link').forEach((el) => {
    const rel = (el.getAttribute('rel') || '').toLowerCase();
    if (el.hasAttribute('data-uwc-style')) return;
    if (/(^|\s)(icon|apple-touch-icon|mask-icon)(\s|$)/.test(rel)) return;
    el.remove();
  });
  doc.querySelectorAll('iframe, frame, object, embed').forEach((el) => {
    const src = abs(el.getAttribute('src') || el.getAttribute('data') || '');
    if (el.tagName === 'IFRAME' && src && /^https:/.test(src) && new URL(src).origin !== location.origin) {
      el.setAttribute('src', src); el.removeAttribute('srcdoc'); report.iframesKept.push(src.slice(0, 200));
    } else {
      const ph = document.createElement('div');
      ph.setAttribute('data-uwc-removed', el.tagName.toLowerCase());
      for (const a of Array.from(el.attributes)) if (['class', 'style', 'width', 'height'].includes(a.name)) ph.setAttribute(a.name, a.value);
      el.replaceWith(ph); report.iframesRemoved++;
    }
  });

  // Stylesheet elements become placeholders that the generator resolves to local files, in the same position.
  doc.querySelectorAll('[data-uwc-style]').forEach((el) => {
    const link = document.createElement('link');
    link.setAttribute('rel', 'stylesheet');
    link.setAttribute('href', '__UWCSTYLE_' + el.getAttribute('data-uwc-style') + '__');
    const media = el.getAttribute('media');
    if (media) link.setAttribute('media', media);
    el.replaceWith(link);
  });

  const cssUrls = (value) => value.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, u) => {
    if (/^(data:|#)/i.test(u)) return m;
    const a = abs(u);
    return a && isHttp(a) ? 'url(' + tok(a, 'asset') + ')' : m;
  });
  const assetAttr = (el, name) => {
    const v = el.getAttribute(name);
    if (!v || /^data:/i.test(v)) return;
    if (/^blob:/i.test(v)) { el.removeAttribute(name); report.blobUrls++; return; }
    const i = v.indexOf('#');
    const a = abs(i >= 0 && name.includes('href') ? v.slice(0, i) : v);
    if (i === 0) return;
    if (a && isHttp(a)) el.setAttribute(name, tok(a, 'asset') + (i > 0 && name.includes('href') ? v.slice(i) : ''));
  };
  const srcset = (el, name) => {
    const v = el.getAttribute(name);
    if (!v) return;
    el.setAttribute(name, v.split(/,\s+/).map((part) => {
      const [u, ...d] = part.trim().split(/\s+/);
      if (!u || /^data:/i.test(u)) return part;
      const a = abs(u);
      return a && isHttp(a) ? [tok(a, 'asset'), ...d].join(' ') : part;
    }).join(', '));
  };

  for (const el of Array.from(doc.querySelectorAll('*'))) {
    for (const a of Array.from(el.attributes)) {
      if (/^on/i.test(a.name) || a.name === 'nonce' || a.name === 'integrity' || a.name === 'crossorigin') el.removeAttribute(a.name);
    }
    const tag = el.tagName.toLowerCase();
    if (el.getAttribute('style') === '') el.removeAttribute('style');
    if (el.getAttribute('class') === '') el.removeAttribute('class');
    if (el.hasAttribute('style')) el.setAttribute('style', cssUrls(el.getAttribute('style')));
    if (tag === 'a' || tag === 'area') {
      const raw = el.getAttribute('href');
      if (raw === null) continue;
      if (/^javascript:/i.test(raw)) { el.setAttribute('href', '#'); continue; }
      if (raw.startsWith('#') || /^(mailto|tel|sms|data):/i.test(raw)) continue;
      const a = abs(raw);
      if (a && isHttp(a)) el.setAttribute('href', tok(a, 'link'));
      el.removeAttribute('ping');
    } else if (tag === 'img' || tag === 'source' || tag === 'video' || tag === 'audio' || tag === 'track' || tag === 'input') {
      assetAttr(el, 'src'); assetAttr(el, 'poster'); srcset(el, 'srcset');
      el.removeAttribute('data-src'); el.removeAttribute('data-srcset');
    } else if (tag === 'link') {
      if (!(el.getAttribute('href') || '').startsWith('__UWCSTYLE_')) assetAttr(el, 'href');
    } else if (tag === 'use' || tag === 'image') {
      assetAttr(el, 'href'); assetAttr(el, 'xlink:href');
    } else if (tag === 'form') {
      el.removeAttribute('action');
    }
  }

  /* ---- shared components: cut out and return separately ---- */
  const components = {};
  const body = doc.querySelector('body');
  const outside = (el) => !el.closest('main, article, section, [role=main], dialog, aside');
  const cut = (name, el) => {
    if (!el || components[name]) return;
    // Page-specific "current page" markers are normalised so identical chrome is recognised across pages.
    const ACTIVE = /^(active|current|selected|is-active|is-current|w--current|current-menu-item|current_page_item|nav-link--active)$/;
    let activeClass = '', on = 'self';
    for (const a of Array.from(el.querySelectorAll('a'))) {
      for (const [node, where] of [[a, 'self'], [a.parentElement, 'parent']]) {
        if (!node || node === el) continue;
        for (const c of Array.from(node.classList)) if (ACTIVE.test(c)) { activeClass = c; on = where; node.classList.remove(c); }
        if (node.getAttribute('class') === '') node.removeAttribute('class');
      }
      a.removeAttribute('aria-current');
    }
    el.setAttribute('data-uwc-component', name);
    if (activeClass) { el.setAttribute('data-uwc-active-class', activeClass); el.setAttribute('data-uwc-active-on', on); }
    components[name] = el.outerHTML;
    el.replaceWith(document.createComment('@component:' + name));
  };
  if (body) {
    cut('header', Array.from(body.querySelectorAll('header, [role=banner]')).find(outside));
    const footers = Array.from(body.querySelectorAll('footer, [role=contentinfo]')).filter(outside);
    cut('footer', footers[footers.length - 1]);
  }

  const attrs = (el) => { const o = {}; if (el) for (const a of Array.from(el.attributes)) if (!/^on/i.test(a.name)) o[a.name] = a.value; return o; };
  const head = doc.querySelector('head');
  const headParts = [];
  if (head) for (const el of Array.from(head.children)) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'link') headParts.push(el.outerHTML);
    else if (tag === 'meta') { const n = (el.getAttribute('name') || '').toLowerCase(); if (['theme-color', 'color-scheme'].includes(n)) headParts.push(el.outerHTML); }
  }
  const meta = (n) => document.querySelector('meta[name="' + n + '"], meta[property="' + n + '"]')?.getAttribute('content') || '';
  return {
    url: location.href, title: document.title || '', description: meta('description') || meta('og:description'),
    viewport: meta('viewport'), htmlAttrs: attrs(doc), bodyAttrs: attrs(body),
    headParts, bodyHtml: body ? body.innerHTML : '', components, styles, tokens, forms, report,
    text: (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 20000),
    headings: Array.from(document.querySelectorAll('h1,h2,h3')).slice(0, 30).map((h) => ({ level: +h.tagName[1], text: text(h).slice(0, 120) })),
    buttons: Array.from(document.querySelectorAll('button,[role=button],input[type=submit]')).slice(0, 60).map((b) => (text(b) || b.value || b.getAttribute('aria-label') || '').slice(0, 60)).filter(Boolean),
  };
})()
