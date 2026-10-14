/** Shared micro-interactions: sticky-nav shadow, button ripple, scroll reveal, back-to-top. No dependencies. */
(function () {
  'use strict';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.addEventListener('DOMContentLoaded', function () {
    const nav = document.querySelector('.topnav');

    // back-to-top
    const top = document.createElement('button');
    top.className = 'to-top'; top.type = 'button'; top.setAttribute('aria-label', 'Back to top'); top.textContent = '↑';
    top.addEventListener('click', () => window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }));
    document.body.appendChild(top);

    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        if (nav) nav.classList.toggle('scrolled', y > 8);
        top.classList.toggle('show', y > 700);
        ticking = false;
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // scroll reveal for static content blocks (about / suggestions)
    const targets = document.querySelectorAll('.feature-card, .stat-card, .about-section, .contact-form-container, .social-link');
    if ('IntersectionObserver' in window && !reduce) {
      const io = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12 });
      targets.forEach((t, i) => { t.classList.add('reveal'); t.style.transitionDelay = (i % 6) * 60 + 'ms'; io.observe(t); });
      setTimeout(() => targets.forEach(t => { if (t.getBoundingClientRect().top < innerHeight * 1.1) t.classList.add('in'); }), 1500);   // safety net for anything already on screen
    }
  });

  // ripple on every .btn
  document.addEventListener('pointerdown', function (e) {
    const b = e.target.closest && e.target.closest('.btn');
    if (!b || b.disabled || reduce) return;
    const r = b.getBoundingClientRect(), size = Math.max(r.width, r.height);
    const s = document.createElement('span');
    s.className = 'ripple';
    s.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
    b.appendChild(s);
    setTimeout(() => s.remove(), 650);
  });

  /** Small confetti burst — used when every reference verifies. */
  window.confettiBurst = function (n) {
    if (reduce) return;
    const colors = ['#2dd4bf', '#38bdf8', '#818cf8', '#fbbf24', '#fb7185', '#34d399'];
    for (let i = 0; i < (n || 46); i++) {
      const c = document.createElement('i');
      c.className = 'confetti';
      c.style.left = Math.random() * 100 + 'vw';
      c.style.background = colors[i % colors.length];
      c.style.setProperty('--dx', (Math.random() * 160 - 80) + 'px');
      c.style.setProperty('--rot', (Math.random() * 900 - 450) + 'deg');
      c.style.animationDelay = Math.random() * 0.35 + 's';
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 2600);
    }
  };
})();
