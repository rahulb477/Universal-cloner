// Runs inside the reference page. Tags interaction candidates so they can be probed and later replayed.
// Only the attribute data-uwc-id is added; nothing is clicked here.
(() => {
  const RISKY = /\b(delete|remove|destroy|buy|purchase|pay|checkout|order|subscribe|unsubscribe|submit|send|sign ?out|log ?out|add to (cart|bag|basket)|confirm|accept|agree|save|apply|book|donate|upgrade|cancel plan|deactivate)\b/i;
  const out = [];
  const seen = new Set();
  let n = 0;
  const sel = 'button, [role=button], [role=tab], [aria-expanded], [aria-haspopup], [data-toggle], [data-bs-toggle]';
  for (const el of document.querySelectorAll(sel)) {
    if (seen.has(el) || n >= 40) continue;
    seen.add(el);
    const tag = el.tagName.toLowerCase();
    if (tag === 'summary' || tag === 'input' || tag === 'select' || tag === 'textarea') continue;
    if (tag === 'a') { const h = el.getAttribute('href') || ''; if (h && !h.startsWith('#') && !/^javascript:/i.test(h)) continue; }
    const form = el.closest('form');
    const type = (el.getAttribute('type') || (tag === 'button' ? 'submit' : '')).toLowerCase();
    if (form && (type === 'submit' || type === 'reset' || type === 'image')) continue;
    const text = (el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    const role = el.getAttribute('role') || '';
    const declared = el.hasAttribute('aria-expanded') || el.hasAttribute('aria-haspopup') || role === 'tab' || el.hasAttribute('data-toggle') || el.hasAttribute('data-bs-toggle') || el.hasAttribute('aria-controls');
    if (RISKY.test(text) && !declared) { out.push({ id: null, text, role, skipped: 'label suggests a state-changing action' }); continue; }
    if (el.disabled) continue;
    const id = window.__uwcUid(el, 'i');
    n++;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const visible = r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && cs.display !== 'none';
    let group = null;
    if (role === 'tab') { const tl = el.closest('[role=tablist]'); if (tl) { group = tl.getAttribute('data-uwc-id') || ('g' + Array.from(document.querySelectorAll('[role=tablist]')).indexOf(tl)); } }
    out.push({ id, text, role, tag, visible, declared, group, selected: el.getAttribute('aria-selected') === 'true' });
  }
  return out;
})()
