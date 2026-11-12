// Runs inside the reference page. Records attribute changes caused by one click so the clone can replay them.
(() => {
  const WATCH = /^(class|hidden|style|open|inert|aria-(expanded|hidden|selected|pressed|checked|current)|data-(state|open|active|expanded|visible|show|selected|headlessui-state))$/;
  // Stable marker for an element: derived from its id or its structural path, so shared chrome
  // (header, footer) receives identical markers on every page.
  window.__uwcUid = (el, prefix) => {
    const have = el.getAttribute('data-uwc-id');
    if (have) return have;
    const parts = [];
    for (let n = el; n && n !== document.body && n.nodeType === 1; n = n.parentElement) {
      if (n.id && document.querySelectorAll('#' + CSS.escape(n.id)).length === 1) { parts.push('#' + n.id); break; }
      let i = 1; for (let s = n.previousElementSibling; s; s = s.previousElementSibling) if (s.tagName === n.tagName) i++;
      parts.push(n.tagName.toLowerCase() + i);
    }
    const str = parts.join('>');
    let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    let id = prefix + h.toString(36), k = 0;
    while (document.querySelector('[data-uwc-id="' + id + '"]')) id = prefix + h.toString(36) + '-' + (++k);
    el.setAttribute('data-uwc-id', id);
    return id;
  };
  window.__uwc = {
    start() {
      this.first = new Map();
      this.added = 0;
      this.obs = new MutationObserver((list) => {
        for (const m of list) {
          if (m.type === 'childList') { this.added += m.addedNodes.length; continue; }
          if (!WATCH.test(m.attributeName)) continue;
          const k = m.attributeName;
          let per = this.first.get(m.target);
          if (!per) { per = {}; this.first.set(m.target, per); }
          if (!(k in per)) per[k] = m.oldValue;
        }
      });
      this.obs.observe(document.documentElement, { attributes: true, attributeOldValue: true, subtree: true, childList: true });
    },
    stop() {
      this.obs.takeRecords().forEach(() => {});
      this.obs.disconnect();
      const changes = [];
      for (const [el, per] of this.first) {
        if (!el.isConnected || el === document.documentElement && false) continue;
        for (const [attr, before] of Object.entries(per)) {
          const after = el.getAttribute(attr);
          if (before === after) continue;
          const id = window.__uwcUid(el, 'x');
          changes.push({ id, attr, before, after, dialog: el.tagName === 'DIALOG' });
        }
      }
      return { changes, added: this.added };
    },
    // Put recorded elements back exactly as they were before the probe.
    restore(changes) {
      for (const c of changes) {
        const el = document.querySelector('[data-uwc-id="' + c.id + '"]');
        if (!el) continue;
        if (c.dialog && c.attr === 'open') { try { el.close(); } catch {} continue; }
        if (c.before === null) el.removeAttribute(c.attr); else el.setAttribute(c.attr, c.before);
      }
    },
  };
  return true;
})()
