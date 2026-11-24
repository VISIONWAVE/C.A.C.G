/* ==========================================================================
   C.A.C.G. — TEXT MOTION
   Splits headings into letters or words so style.css can animate them in
   anime title-card style. Text stays selectable and readable by screen
   readers (the full sentence is kept in aria-label). Does nothing if the
   visitor prefers reduced motion. Safe to delete along with its <script> tag.
   ========================================================================== */
(function () {
  if (!('IntersectionObserver' in window)) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  function split(el, mode) {
    if (!el || el.hasAttribute('data-fx') || el.closest('[data-cacg]')) return null;
    el.setAttribute('data-fx', mode);
    el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
    var idx = 0;
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          if (!n.textContent.trim()) return;
          var frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
            var w = document.createElement('span');
            w.className = 'fx-w';
            w.setAttribute('aria-hidden', 'true');
            if (mode === 'letters') {
              Array.prototype.forEach.call(part, function (ch) {
                var c = document.createElement('span');
                c.className = 'fx-c';
                c.style.setProperty('--i', idx++);
                c.textContent = ch;
                w.appendChild(c);
              });
            } else {
              w.style.setProperty('--i', idx++);
              w.textContent = part;
            }
            frag.appendChild(w);
          });
          node.replaceChild(frag, n);
        } else if (n.nodeType === 1 && n.tagName !== 'BR') {
          walk(n);
        }
      });
    })(el);
    el.classList.add('fx-split', 'fx-' + mode);
    return el;
  }

  var targets = [];
  function add(selector, mode) {
    Array.prototype.forEach.call(document.querySelectorAll(selector), function (el) {
      var done = split(el, mode);
      if (done) targets.push(done);
    });
  }

  add('.hero h1, .page-header h1', 'letters');
  add('.eyebrow', 'letters');
  add('.section-head h2, .about-text h2, #order-polo h2', 'words');
  add('.hero-sub, .section-head p:not(.eyebrow)', 'words');

  var io = new IntersectionObserver(function (entries, obs) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('fx-in'); obs.unobserve(e.target); }
    });
  }, { threshold: 0.3 });
  targets.forEach(function (el) { io.observe(el); });

  // safety net: never leave text hidden if something goes wrong
  setTimeout(function () {
    targets.forEach(function (el) { el.classList.add('fx-in'); });
  }, 6000);
})();