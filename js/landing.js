const pipelineSteps = [
  {
    title: 'Product',
    summary: 'Provide product information and image.',
    detail:
      'Abra Zylo starts with the product itself: the name, category, image, and any pricing details that can improve the SEO context.'
  },
  {
    title: 'AI Analysis',
    summary: 'AI reads the product context and search intent.',
    detail:
      'The generator examines the product image, name, category, and available metadata so the SEO output is tailored to the item rather than generic copy.'
  },
  {
    title: 'SEO Generation',
    summary:
      'Create optimized meta title, description, slug, keywords, and product description.',
    detail:
      'The workflow produces the structured fields used across product SEO, search results, and metadata management.'
  },
  {
    title: 'Validation',
    summary: 'Run deterministic checks against the generated fields.',
    detail:
      'Abra Zylo validates title length, description length, keyword placement, slug quality, product relevance, and content completeness before anything saves.'
  },
  {
    title: 'Improvement',
    summary: 'Regenerate only fields that fail validation.',
    detail:
      'Rather than replacing everything, the portal can target the exact weak section and recompute the SEO score after the change.'
  },
  {
    title: '98+ Score',
    summary: 'Reach the quality threshold for auto-save.',
    detail:
      'When the score passes the configured threshold, the existing workflow proceeds to save the optimized result as part of the portal history.'
  }
];


/* =========================================
   SMOOTH ANCHOR SCROLL
========================================= */

function getHeaderOffset() {
  const header = document.getElementById('public-header');
  const extraGap = 18;
  return header ? header.getBoundingClientRect().height + extraGap : 0;
}

function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function smoothScrollTo(targetY, duration) {
  const startY = window.scrollY;
  const distance = targetY - startY;
  const startTime = performance.now();

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function step(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);

    window.scrollTo(0, startY + distance * easeInOutCubic(progress));

    if (progress < 1) {
      requestAnimationFrame(step);
    }
  }

  requestAnimationFrame(step);
}

function pulseTargetSection(target) {
  const card = target.querySelector('.public-section-card, .public-cta-card') || target;

  card.classList.add('public-anchor-pulse');

  window.setTimeout(() => {
    card.classList.remove('public-anchor-pulse');
  }, 900);
}

function scrollToAnchor(hash) {
  if (!hash || hash === '#') return;

  const id = hash.slice(1);
  const target = document.getElementById(id);

  if (!target) return;

  const targetY = Math.max(
    target.getBoundingClientRect().top + window.scrollY - getHeaderOffset(),
    0
  );

  if (prefersReducedMotion()) {
    window.scrollTo(0, targetY);
  } else {
    smoothScrollTo(targetY, 650);
  }

  pulseTargetSection(target);

  if (history.pushState) {
    history.pushState(null, '', hash);
  }

  // Close mobile menu after navigating, if open
  const nav = document.getElementById('public-nav');
  if (nav) {
    nav.classList.remove('is-open');
  }
}

function initAnchorScroll() {
  const links = document.querySelectorAll('a[href^="#"]');

  links.forEach((link) => {
    link.addEventListener('click', (event) => {
      const hash = link.getAttribute('href');

      if (!hash || hash === '#') return;

      const target = document.getElementById(hash.slice(1));

      if (!target) return;

      event.preventDefault();
      scrollToAnchor(hash);
    });
  });
}


/* =========================================
   ACTIVE NAV LINK ON SCROLL
========================================= */

function initActiveNavTracking() {
  const navLinks = Array.from(document.querySelectorAll('#public-nav a[href^="#"]'));

  if (!navLinks.length) return;

  const sections = navLinks
    .map((link) => document.getElementById(link.getAttribute('href').slice(1)))
    .filter(Boolean);

  if (!sections.length) return;

  const setActiveLink = (id) => {
    navLinks.forEach((link) => {
      link.classList.toggle('is-active-link', link.getAttribute('href') === `#${id}`);
    });
  };

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setActiveLink(entry.target.id);
        }
      });
    },
    {
      rootMargin: `-${getHeaderOffset() + 10}px 0px -60% 0px`,
      threshold: 0
    }
  );

  sections.forEach((section) => observer.observe(section));
}


/* =========================================
   PIPELINE
========================================= */

function setActivePipelineStep(index) {
  const buttons = document.querySelectorAll('.public-pipeline-step');
  const detail = document.getElementById('pipeline-detail');
  const step = pipelineSteps[index];

  if (!step) return;

  buttons.forEach((button, buttonIndex) => {
    button.classList.toggle('is-active', buttonIndex === index);
  });

  if (!detail) return;

  detail.innerHTML = `
    <h3>${step.title}</h3>
    <p>${step.summary}</p>
    <p>${step.detail}</p>
  `;
}


function initPipeline() {
  const buttons = document.querySelectorAll('.public-pipeline-step');

  buttons.forEach((button, index) => {
    button.addEventListener('click', () => {
      setActivePipelineStep(index);
    });

    button.addEventListener('mouseenter', () => {
      setActivePipelineStep(index);
    });
  });

  if (buttons.length > 0) {
    setActivePipelineStep(0);
  }
}


/* =========================================
   SCROLL REVEAL
========================================= */

function initReveal() {
  const elements = document.querySelectorAll('.public-reveal');

  if (!elements.length) return;

  // Fallback for older browsers
  if (!('IntersectionObserver' in window)) {
    elements.forEach((element) => {
      element.classList.add('is-visible');
    });

    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');

          // Stop observing after the element becomes visible
          observer.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.12
    }
  );

  elements.forEach((element) => {
    observer.observe(element);
  });
}


/* =========================================
   PUBLIC HEADER
========================================= */

function initHeader() {
  const header = document.getElementById('public-header');

  if (!header) return;

  const onScroll = () => {
    header.classList.toggle('is-scrolled', window.scrollY > 20);
  };

  onScroll();

  window.addEventListener('scroll', onScroll, {
    passive: true
  });
}


/* =========================================
   MOBILE MENU
========================================= */

function toggleMenu() {
  const nav = document.getElementById('public-nav');

  if (!nav) return;

  nav.classList.toggle('is-open');
}


/* =========================================
   AUTH / SIGN IN
========================================= */

function showAuth() {
  // The landing page is intentionally independent from the application.
  // Authentication and all protected functionality live in main.html.
  window.location.href = 'main.html';
}


/* =========================================
   INITIALIZE LANDING PAGE
========================================= */

function init() {
  const publicPage = document.getElementById('page-public');

  if (publicPage) {
    publicPage.classList.add('active');
  }

  initHeader();
  initPipeline();
  initReveal();
  initAnchorScroll();
  initActiveNavTracking();
}


/* =========================================
   DOM READY
========================================= */

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}


/* =========================================
   GLOBAL LANDING API
========================================= */

window.Landing = {
  init,
  toggleMenu,
  showAuth
};