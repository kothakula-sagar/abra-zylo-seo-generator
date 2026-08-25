/**
 * ui.js - All DOM manipulation helpers
 * No Firebase, no AI logic here.
 */

// ── TOAST ────────────────────────────────────────────────────
let _toastTimer = null;
export function showToast(msg, duration = 4000) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), duration);
}

export function focusFirstInput(container = document) {
  const root = container && typeof container.querySelector === 'function' ? container : document;
  const priority = root.querySelector('input:not([type="hidden"]), select, textarea');
  if (priority) priority.focus();
}

// ── ALERTS ───────────────────────────────────────────────────
export function showAlert(id, msg, type = 'danger') {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = `alert alert-${type}`;
  el.textContent = msg;
  el.style.display = 'block';
}
export function hideAlert(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

// ── LOADING OVERLAY ──────────────────────────────────────────
export function showLoading(title, steps = []) {
  const el = document.getElementById('loading-overlay');
  if (!el) return;
  document.getElementById('loading-title').textContent    = title;
  document.getElementById('loading-subtitle').textContent = 'Please wait...';
  document.getElementById('progress-pct').textContent     = '0%';
  document.getElementById('progress-fill').style.width    = '0%';
  document.getElementById('loading-steps').innerHTML = steps.map((s, i) =>
    `<div class="loading-step" id="lstep-${i}">
       <div class="step-num">${i + 1}</div>
       <span>${s}</span>
     </div>`
  ).join('');
  el.style.display = 'flex';
}

export function setLoadingProgress(pct, subtitle) {
  const fill = document.getElementById('progress-fill');
  const pctEl = document.getElementById('progress-pct');
  if (fill)  fill.style.width = pct + '%';
  if (pctEl) pctEl.textContent = pct + '%';
  if (subtitle) {
    const sub = document.getElementById('loading-subtitle');
    if (sub) sub.textContent = subtitle;
  }
}

export function completeStep(index, pct, subtitle) {
  const step = document.getElementById(`lstep-${index}`);
  if (step) step.classList.add('done');
  setLoadingProgress(pct, subtitle);
}

export function hideLoading() {
  const el = document.getElementById('loading-overlay');
  if (el) el.style.display = 'none';
}

// ── MODALS ───────────────────────────────────────────────────
let _activeModalIds = new Set();
let _savedScrollTarget = null;
let _savedScrollPosition = { x: 0, y: 0 };

function getScrollTarget() {
  const docEl = document.documentElement;
  const bodyEl = document.body;

  if (docEl && (docEl.scrollTop || docEl.scrollLeft)) {
    return docEl;
  }

  if (bodyEl && (bodyEl.scrollTop || bodyEl.scrollLeft)) {
    return bodyEl;
  }

  const windowScrollX = window.scrollX || window.pageXOffset || 0;
  const windowScrollY = window.scrollY || window.pageYOffset || 0;
  if (windowScrollX || windowScrollY) {
    return window;
  }

  const scrollingElement = document.scrollingElement || docEl || bodyEl;
  return scrollingElement || window;
}

function getScrollPosition(scrollTarget) {
  if (scrollTarget === window) {
    return {
      x: window.scrollX || window.pageXOffset || 0,
      y: window.scrollY || window.pageYOffset || 0
    };
  }

  return {
    x: typeof scrollTarget.scrollLeft === 'number' ? scrollTarget.scrollLeft : 0,
    y: typeof scrollTarget.scrollTop === 'number' ? scrollTarget.scrollTop : 0
  };
}

function restoreModalScrollPosition(id) {
  if (id === 'campaign-item-modal' && typeof window.Marketing?.restoreCampaignDetailScrollState === 'function') {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.Marketing.restoreCampaignDetailScrollState();
      });
    });
    return;
  }

  if (id === 'product-modal' && typeof window.Marketing?.restoreProductsScrollState === 'function') {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.Marketing.restoreProductsScrollState();
      });
    });
  }
}

function lockBodyScroll() {
  if (_activeModalIds.size === 0) {
    const scrollTarget = getScrollTarget();
    _savedScrollTarget = scrollTarget;
    _savedScrollPosition = getScrollPosition(scrollTarget);

    console.log('[MODAL DEBUG] lockBodyScroll', {
      savedTarget: scrollTarget === window ? 'window' : scrollTarget?.tagName || 'unknown',
      docScrollTop: document.documentElement.scrollTop,
      bodyScrollTop: document.body.scrollTop,
      windowScrollY: window.scrollY,
      savedScrollPosition: _savedScrollPosition
    });

    const body = document.body;
    const html = document.documentElement;

    body.classList.add('modal-open');
    html.classList.add('modal-open');
    body.classList.add('no-scroll');
    html.classList.add('no-scroll');
    body.classList.add('overflow-hidden');
    html.classList.add('overflow-hidden');

    body.style.position = 'fixed';
    body.style.top = `-${_savedScrollPosition.y}px`;
    body.style.left = `-${_savedScrollPosition.x}px`;
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    html.style.overflow = 'hidden';
  }
}

function isSavedScrollTargetValid() {
  if (!_savedScrollTarget) return false;
  if (_savedScrollTarget === window) return true;
  return document.contains(_savedScrollTarget) && typeof _savedScrollTarget.scrollTo === 'function';
}

function unlockBodyScroll() {
  if (_activeModalIds.size === 0) {
    const body = document.body;
    const html = document.documentElement;
    [body, html].forEach(el => {
      el.classList.remove('modal-open', 'no-scroll', 'overflow-hidden');
    });

    body.style.position = '';
    body.style.top = '';
    body.style.left = '';
    body.style.width = '';
    body.style.overflow = '';
    html.style.overflow = '';
    html.style.position = '';

    console.log('[MODAL DEBUG] unlockBodyScroll restore start', {
      savedScrollTarget: _savedScrollTarget === window ? 'window' : _savedScrollTarget?.tagName || 'unknown',
      savedScrollPosition: _savedScrollPosition,
      docScrollTop: document.documentElement.scrollTop,
      bodyScrollTop: document.body.scrollTop,
      windowScrollY: window.scrollY
    });

    const restoreScroll = () => {
      const scrollTarget = isSavedScrollTargetValid() ? _savedScrollTarget : window;
      console.log('[MODAL DEBUG] restoreScroll executing', {
        scrollTarget: scrollTarget === window ? 'window' : scrollTarget?.tagName || 'unknown',
        docScrollTop: document.documentElement.scrollTop,
        bodyScrollTop: document.body.scrollTop,
        windowScrollY: window.scrollY,
        saved: _savedScrollPosition
      });

      if (scrollTarget === window) {
        window.scrollTo(_savedScrollPosition.x, _savedScrollPosition.y);
        document.documentElement.scrollTop = _savedScrollPosition.y;
        document.body.scrollTop = _savedScrollPosition.y;
      } else {
        scrollTarget.scrollTo(_savedScrollPosition.x, _savedScrollPosition.y);
      }

      console.log('[MODAL DEBUG] RESTORE', {
        scrollY: window.scrollY,
        docScrollTop: document.documentElement.scrollTop,
        bodyScrollTop: document.body.scrollTop,
        target: scrollTarget === window ? 'window' : _savedScrollTarget?.tagName || 'unknown',
        restoringTo: _savedScrollPosition
      });
      _savedScrollTarget = null;
    };

    restoreScroll();
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => {
        if (window.scrollX !== _savedScrollPosition.x || window.scrollY !== _savedScrollPosition.y) {
          restoreScroll();
        }
      });
    }
  }
}

export function hasOpenModal() {
  return _activeModalIds.size > 0;
}

export function openModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  if (_activeModalIds.has(id) || el.style.display === 'flex' || el.style.display === 'block') return;

  console.log('[MODAL DEBUG] shared openModal', {
    id,
    scrollY: window.scrollY,
    activeModals: Array.from(_activeModalIds)
  });

  if (_activeModalIds.size === 0) {
      // Capture and lock the current scroll position before registering
      // this modal as active so the first opened modal saves scroll.
      lockBodyScroll();
  }

  el.style.display = 'flex';
    _activeModalIds.add(id);
}

export function closeModal(id) {
  const el = document.getElementById(id);
  if (!el) return;

  const wasVisible = _activeModalIds.has(id) || el.style.display === 'flex' || el.style.display === 'block';
  if (!wasVisible) return;

  console.log('[MODAL DEBUG] CLOSE START', {
    id,
    scrollY: window.scrollY,
    activeModalsBefore: Array.from(_activeModalIds)
  });

  el.style.display = 'none';
  _activeModalIds.delete(id);

  if (_activeModalIds.size === 0) {
    unlockBodyScroll();
    restoreModalScrollPosition(id);
  }
}

/** Closes only the most recently opened modal (used by the Esc key handler). */
export function closeTopModal() {
  if (_activeModalIds.size === 0) return false;
  const topId = Array.from(_activeModalIds).pop();
  closeModal(topId);
  return true;
}

export function closeAllModals() {
  const activeModalIds = Array.from(_activeModalIds);
  const modalEls = Array.from(document.querySelectorAll('.overlay'));
  modalEls.forEach(el => {
    if (el.style.display !== 'none') {
      el.style.display = 'none';
    }
  });

  _activeModalIds.clear();
  if (_activeModalIds.size === 0) {
    unlockBodyScroll();
    if (activeModalIds.length > 0) {
      restoreModalScrollPosition(activeModalIds[activeModalIds.length - 1]);
    }
  }
}

// ── SIDEBAR ──────────────────────────────────────────────────
export function toggleSidebar() {
  document.querySelector('.sidebar')?.classList.toggle('open');
  document.getElementById('sidebar-backdrop')?.classList.toggle('show');
}
export function closeSidebar() {
  document.querySelector('.sidebar')?.classList.remove('open');
  document.getElementById('sidebar-backdrop')?.classList.remove('show');
}

// ── TABS ─────────────────────────────────────────────────────
const TAB_TITLES = {
  dashboard: 'Dashboard',
  generate:  'Generate SEO Content',
  history:   'Generation History',
  audit:     'SEO Audit Tool',
  auditHistory: 'Audit History',
  settings:  'Settings',
  accounts:  'Accounts',
  products:  'Products',
  campaigns: 'Sale Campaigns',
  'meta-catalog': 'Meta Product Catalog',
  'campaign-detail': 'Campaign Details',
  customers: 'Customer Details',
  'whatsapp-marketing': 'WhatsApp Marketing',
  'whatsapp-campaign-detail': 'WhatsApp Campaign',
  docs: 'Documentation'
};

export function switchTab(name) {
  console.log('[TAB DEBUG] switchTab', { section: name, scrollY: window.scrollY });
  document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const section = document.getElementById(`tab-${name}`);
  const navItem = document.getElementById(`nav-${name}`);
  if (section) section.classList.add('active');
  if (navItem)  navItem.classList.add('active');
  const title = document.getElementById('topbar-title');
  if (title) title.textContent = TAB_TITLES[name] || name;
  window.scrollTo(0, 0);
  if (window.innerWidth <= 768) closeSidebar();
}

// ── THEME ────────────────────────────────────────────────────
export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    root.setAttribute('data-theme', theme);
  }
  localStorage.setItem('az-theme', theme);
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

export function initTheme() {
  const saved = localStorage.getItem('az-theme') || 'light';
  applyTheme(saved);
}

// ── RESULT TABS ──────────────────────────────────────────────
export function switchResultTab(name, container) {
  const parent = container || document;
  parent.querySelectorAll('.tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === name)
  );
  parent.querySelectorAll('.tab-pane').forEach(p =>
    p.classList.toggle('active', p.id === `rtab-${name}`)
  );
}

// ── SCORE RING ───────────────────────────────────────────────
export function animateScoreRing(score, color, ringId, valId, circumference = 565) {
  const ring  = document.getElementById(ringId);
  const valEl = document.getElementById(valId);
  if (!ring || !valEl) return;
  ring.style.stroke = color;
  ring.style.strokeDashoffset = circumference;
  const offset = circumference - (circumference * Math.min(score, 100) / 100);
  setTimeout(() => { ring.style.strokeDashoffset = offset; }, 100);
  // Animate number
  let curr = 0;
  const step = Math.max(1, Math.ceil(score / 45));
  const iv = setInterval(() => {
    curr = Math.min(curr + step, score);
    valEl.textContent = curr;
    if (curr >= score) clearInterval(iv);
  }, 30);
}

// ── CHAR PILL ────────────────────────────────────────────────
export function charPill(len, min, max) {
  const cls = (len >= min && len <= max) ? 'char-ok' : (len < min ? 'char-warn' : 'char-bad');
  return `<span class="char-pill ${cls}">${len}/${max}</span>`;
}

// ── COPY TO CLIPBOARD ────────────────────────────────────────
export function copyText(text) {
  navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard'));
}