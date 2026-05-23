/**
 * ENCORE landing — client-side email capture → Google Forms redirect
 */

const GOOGLE_FORM_URL =
  'https://forms.gle/ZWpaZX1aXagzgY2v5';

const REDIRECT_DELAY_MS = 1500;

/**
 * Handle email form submission: show success, then redirect with pre-filled email.
 * @param {Event} event
 * @param {HTMLFormElement} form
 * @returns {boolean}
 */
function handleSubmit(event, form) {
  event.preventDefault();

  const emailInput = form.querySelector('input[name="email"]');
  const email = emailInput ? emailInput.value.trim() : '';

  if (!email) {
    return false;
  }

  console.log('[ENCORE] Email submission:', { email, formId: form.id });

  const wrap = form.parentElement;
  if (!wrap) {
    return false;
  }

  const isLarge = form.classList.contains('email-form--large');
  const success = document.createElement('p');
  success.className = isLarge ? 'form-success form-success--center' : 'form-success';
  success.setAttribute('role', 'status');
  success.setAttribute('aria-live', 'polite');
  success.textContent = 'Thanks ♥ Taking you to the survey to learn more...';

  wrap.replaceChildren(success);

  const redirectUrl = GOOGLE_FORM_URL.replace(
    'EMAIL_PLACEHOLDER',
    encodeURIComponent(email)
  );

  window.setTimeout(function () {
    window.location.href = redirectUrl;
  }, REDIRECT_DELAY_MS);

  return false;
}

/* Sticky header border on scroll */
(function initHeaderScroll() {
  const header = document.getElementById('siteHeader');
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
      const id = link.getAttribute('href');
      if (!id || id === '#') return;

      const target = document.querySelector(id);
      if (!target) return;

      event.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
})();
