/* MajesticToolkit DOM renderer. HTML is parsed in an inert document and reconstructed
 * from an explicit allow-list; no untrusted markup is ever assigned to an HTML sink.
 * Used by both extension UI modules and isolated content scripts. */
(() => {
  'use strict';
  const HTML_TAGS = new Set(('a abbr article aside b blockquote br button caption code dd details dialog div dl dt em fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hr i input kbd label legend li main mark nav ol option optgroup output p pre progress section select small span strong summary table tbody td textarea th thead time tr u ul').split(' '));
  const SVG_TAGS = new Set(('svg circle line polyline path rect text title g').split(' '));
  const ATTRS = new Set(('id class name type value title role for href target rel placeholder required checked selected disabled hidden readonly readOnly tabindex max min step maxlength minlength rows cols size pattern autocomplete spellcheck autofocus multiple download action method aria-label viewBox x y x1 x2 y1 y2 cx cy r d points fill stroke stroke-width stroke-opacity fill-opacity stroke-dasharray stroke-linecap stroke-linejoin text-anchor font-size width height xmlns preserveAspectRatio').split(' '));
  const URL_ATTRS = new Set(['href', 'action']);
  const SVG_NS = 'http://www.w3.org/2000/svg';
  function safeUrl(value) {
    if (/^#[a-z0-9_:-]+$/i.test(value)) return true;
    try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password; }
    catch { return false; }
  }
  // Inline styles only accept simple CSS values and reject functions capable of loading resources.
  const STYLE_PROPS = new Set(['width','height','max-width','min-width','min-height','max-height','flex','margin','margin-top','margin-bottom','padding','padding-top','padding-bottom','color','background','background-color','display','text-align','font-size']);
  function safeStyle(value) {
    const declarations = String(value).split(';');
    const passed = [];
    for (const decl of declarations) {
      if (!decl.trim()) continue;
      const index = decl.indexOf(':');
      if (index < 1) continue;
      const key = decl.slice(0,index).trim().toLowerCase(), val = decl.slice(index+1).trim();
      if (!STYLE_PROPS.has(key) || !/^[\w\s#.%(),+\/-]{1,100}$/.test(val) || /url\s*\(|expression\s*\(|@import|var\s*\(/i.test(val)) continue;
      passed.push(`${key}:${val}`);
    }
    return passed.join(';');
  }
  function sanitizedNode(node, doc) {
    if (node.nodeType === 3) return doc.createTextNode(node.nodeValue ?? '');
    if (node.nodeType !== 1) return null;
    const tag = node.localName;
    const svg = node.namespaceURI === SVG_NS;
    if (!(svg ? SVG_TAGS : HTML_TAGS).has(tag)) return null;
    const out = svg ? doc.createElementNS(SVG_NS, tag) : doc.createElement(tag);
    for (const attr of node.attributes) {
      const name = attr.name, key = name.toLowerCase(), value = attr.value;
      if (key.startsWith('on') || key === 'srcdoc' || key === 'formaction') continue;
      if (!ATTRS.has(name) && !ATTRS.has(key) && !/^data-[a-z0-9-]{1,50}$/.test(key) && !/^aria-[a-z0-9-]{1,50}$/.test(key) && key !== 'style') continue;
      if (URL_ATTRS.has(key) && !safeUrl(value)) continue;
      if (key === 'target' && !['_blank','_self'].includes(value)) continue;
      if (key === 'style') { const safe = safeStyle(value); if (safe) out.setAttribute('style',safe); continue; }
      if (key === 'xmlns' && value !== SVG_NS) continue;
      out.setAttribute(name, value);
    }
    if (tag === 'a' && out.getAttribute('target') === '_blank') out.setAttribute('rel','noopener noreferrer');
    for (const child of node.childNodes) { const safe = sanitizedNode(child,doc); if (safe) out.appendChild(safe); }
    return out;
  }
  function htmlFragment(markup, context = 'div') {
    // The HTML parser is inert. Elements and attributes are independently rebuilt,
    // so no parsed event handler, script, remote resource, or unsafe URL is retained.
    const wrapper = context === 'select' ? 'select' : context === 'tbody' ? 'table' : 'div';
    const parsed = new DOMParser().parseFromString(`<${wrapper}>${String(markup)}</${wrapper}>`,'text/html');
    let source = parsed.body.firstElementChild;
    if (context === 'tbody') source = source?.querySelector('tbody') || source;
    const result = document.createDocumentFragment();
    for (const child of source?.childNodes ?? []) {
      const safe = sanitizedNode(child,document);
      if (safe) result.appendChild(safe);
    }
    return result;
  }
  function replaceHtml(element, markup) {
    if (!element) return;
    element.replaceChildren(htmlFragment(markup, element.localName));
  }
  function insertHtml(element, position, markup) {
    if (!element) return;
    const fragment = htmlFragment(markup,element.localName);
    if (position === 'beforeend') element.append(fragment);
    else if (position === 'afterbegin') element.prepend(fragment);
    else if (position === 'beforebegin') element.before(fragment);
    else if (position === 'afterend') element.after(fragment);
    else throw new Error('Unsupported HTML insertion position');
  }
  globalThis.MTSafeDOM = Object.freeze({replaceHtml,insertHtml,htmlFragment,safeUrl,safeStyle});
})();
