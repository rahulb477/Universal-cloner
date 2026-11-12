// Runs inside the reference page. Read-only design analysis from computed styles.
(() => {
  const count = (map, k, n = 1) => { if (k) map[k] = (map[k] || 0) + n; };
  const top = (map, n) => Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, n).map(([value, weight]) => ({ value, weight: Math.round(weight) }));
  const colors = {}, backgrounds = {}, fonts = {}, sizes = {}, radii = {}, shadows = {};
  const els = Array.from(document.querySelectorAll('body *')).slice(0, 2500);
  let visible = 0;
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    visible++;
    const cs = getComputedStyle(el);
    const area = Math.min(r.width * r.height, 400000) / 1000;
    const hasText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());
    if (hasText) {
      count(colors, cs.color, (el.textContent || '').trim().length || 1);
      count(fonts, cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(), (el.textContent || '').trim().length || 1);
      count(sizes, cs.fontSize);
    }
    if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') count(backgrounds, cs.backgroundColor, area);
    if (cs.borderRadius && cs.borderRadius !== '0px') count(radii, cs.borderRadius);
    if (cs.boxShadow && cs.boxShadow !== 'none') count(shadows, cs.boxShadow);
  }
  const vars = {};
  for (const sheet of Array.from(document.styleSheets)) {
    let rules; try { rules = sheet.cssRules; } catch { continue; }
    for (const rule of Array.from(rules || [])) {
      if (rule.selectorText && /(^|,)\s*(:root|html)\s*(,|$)/.test(rule.selectorText)) {
        for (const name of Array.from(rule.style)) if (name.startsWith('--') && Object.keys(vars).length < 80) vars[name] = rule.style.getPropertyValue(name).trim().slice(0, 120);
      }
    }
  }
  const heading = (sel) => { const el = document.querySelector(sel); if (!el) return null; const cs = getComputedStyle(el); return { fontFamily: cs.fontFamily, fontSize: cs.fontSize, fontWeight: cs.fontWeight, lineHeight: cs.lineHeight, color: cs.color }; };
  // Repeating structures (cards, list rows): same tag+class signature repeated among siblings.
  const repeats = {};
  for (const parent of Array.from(document.querySelectorAll('body *')).slice(0, 1500)) {
    if (parent.children.length < 3) continue;
    const sig = {};
    for (const c of Array.from(parent.children)) { const k = c.tagName.toLowerCase() + (c.classList.length ? '.' + Array.from(c.classList).slice(0, 3).join('.') : ''); sig[k] = (sig[k] || 0) + 1; }
    for (const [k, n] of Object.entries(sig)) if (n >= 3 && !/^(li|option|td|th|tr|br|span|a|p)$/.test(k)) repeats[k] = Math.max(repeats[k] || 0, n);
  }
  const body = getComputedStyle(document.body);
  const main = document.querySelector('main,[role=main]');
  const logo = document.querySelector('header img, [role=banner] img, img[alt*="logo" i], a[class*="logo" i] img, a[class*="brand" i] img, header svg');
  return {
    colors: top(colors, 8), backgrounds: top(backgrounds, 8), fonts: top(fonts, 5), fontSizes: top(sizes, 8), radii: top(radii, 5), shadows: top(shadows, 3),
    cssVariables: vars,
    body: { fontFamily: body.fontFamily, fontSize: body.fontSize, color: body.color, background: body.backgroundColor, lineHeight: body.lineHeight },
    h1: heading('h1'), h2: heading('h2'),
    landmarks: { header: !!document.querySelector('header,[role=banner]'), nav: !!document.querySelector('nav,[role=navigation]'), main: !!main, aside: !!document.querySelector('aside,[role=complementary]'), footer: !!document.querySelector('footer,[role=contentinfo]') },
    contentWidth: main ? Math.round(main.getBoundingClientRect().width) : null,
    counts: { elements: els.length, visible, images: document.images.length, svgs: document.querySelectorAll('svg').length, videos: document.querySelectorAll('video').length, iframes: document.querySelectorAll('iframe').length, canvases: document.querySelectorAll('canvas').length, forms: document.forms.length, buttons: document.querySelectorAll('button,[role=button]').length, animated: els.filter((e) => { const c = getComputedStyle(e); return c.animationName !== 'none' || (c.transitionDuration !== '0s' && c.transitionProperty !== 'none' && c.transitionProperty !== 'all'); }).length },
    logo: logo ? { tag: logo.tagName.toLowerCase(), src: logo.currentSrc || logo.getAttribute('src') || null, alt: logo.getAttribute('alt') || '' } : null,
    iconFonts: Array.from(new Set(Array.from(document.querySelectorAll('i[class],span[class]')).map((e) => (e.className.match?.(/\b(fa[srbl]?|material-icons|bi|icon)\b/) || [])[0]).filter(Boolean))),
    repeatingComponents: Object.entries(repeats).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([signature, count]) => ({ signature, count })),
    states: { busy: document.querySelectorAll('[aria-busy=true],[role=progressbar],[class*="skeleton" i],[class*="spinner" i]').length, alerts: document.querySelectorAll('[role=alert],[role=status]').length },
    viewportMeta: document.querySelector('meta[name=viewport]')?.getAttribute('content') || null,
  };
})()
