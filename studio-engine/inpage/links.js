// Runs inside the reference page. Returns navigation data only; changes nothing.
(() => {
  const abs = (u) => { try { return new URL(u, document.baseURI).href; } catch { return null; } };
  const links = [];
  for (const a of document.querySelectorAll('a[href]')) {
    const raw = a.getAttribute('href') || '';
    if (!raw || raw.startsWith('#') || /^(mailto|tel|javascript|data|blob):/i.test(raw)) continue;
    const href = abs(raw);
    if (!href) continue;
    const area = a.closest('header,[role=banner]') ? 'header' : a.closest('footer,[role=contentinfo]') ? 'footer' : a.closest('nav,[role=navigation]') ? 'nav' : 'body';
    links.push({ href, text: (a.textContent || a.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 80), area });
  }
  const pw = document.querySelector('input[type=password]');
  return {
    title: document.title || '',
    links,
    hasLoginForm: !!pw,
    h1: (document.querySelector('h1')?.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 140),
    textLength: (document.body?.innerText || '').length,
  };
})()
