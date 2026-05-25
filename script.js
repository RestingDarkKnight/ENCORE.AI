/**
 * ENCORE landing — client-side email capture → Google Forms redirect
 */

const GOOGLE_FORM_URL = 'https://forms.gle/ZWpaZX1aXagzgY2v5';
const REDIRECT_DELAY_MS = 1500;

function handleSubmit(event, form) {
  event.preventDefault();
  const emailInput = form.querySelector('input[name="email"]');
  const email = emailInput ? emailInput.value.trim() : '';
  if (!email) return false;

  console.log('[ENCORE] Email submission:', { email, formId: form.id });

  const wrap = form.parentElement;
  if (!wrap) return false;

  const isLarge = form.classList.contains('email-form--large');
  const success = document.createElement('p');
  success.className = (isLarge ? 'form-success form-success--center ' : 'form-success ') + 'is-entering';
  success.setAttribute('role', 'status');
  success.setAttribute('aria-live', 'polite');
  success.textContent = 'Thanks ♥ Taking you to the survey to learn more...';

  form.classList.add('is-exiting');
  window.setTimeout(function () {
    wrap.replaceChildren(success);
    window.setTimeout(function () {
      window.location.href = GOOGLE_FORM_URL;
    }, REDIRECT_DELAY_MS);
  }, 250);

  return false;
}

/* Section fade-in on scroll (30% visible) */
(function () {
  var sections = document.querySelectorAll('.section-reveal');
  if (!sections.length) return;
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      io.unobserve(entry.target);
    });
  }, { threshold: 0.3 });
  sections.forEach(function (el) { io.observe(el); });
})();

/* Sticky header border on scroll */
(function initHeaderScroll() {
  var header = document.getElementById('siteHeader');
  if (!header) return;
  function onScroll() {
    header.classList.toggle('is-scrolled', window.scrollY > 8);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();

/* Smooth scroll for in-page nav links */
(function initSmoothNav() {
  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener('click', function (event) {
      var id = link.getAttribute('href');
      if (!id || id === '#') return;
      var target = document.querySelector(id);
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
})();
