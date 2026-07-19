/**
 * dashboard.js - Dashboard stats and recent activity
 */

import { FB } from './firebase.js';
import { getUser, isAdmin } from './auth.js';
import { safeStr, formatDate } from './utils.js';

// ── STATS ─────────────────────────────────────────────────────
export async function loadStats() {
  const user = getUser();
  if (!user) return;

  try {
    const [products, audits] = await Promise.all([
      _fetchProducts(),
      _fetchAudits()
    ]);

    const weekAgo    = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const thisWeek   = products.filter(p => (p.timestamp || 0) > weekAgo).length;
    const myProducts = products.filter(p => p.uid === user.uid);
    const versions   = products.reduce((a, p) => a + (p.versions?.length || 0), 0);
    const avgScore   = audits.length
      ? Math.round(audits.reduce((a, x) => a + (x.score || 0), 0) / audits.length)
      : 0;
    const langs = new Set(products.map(p => p.lang).filter(Boolean)).size;

    const statsData = [
      { icon: '&#x1F4E6;', label: 'Total Products',   val: products.length,    sub: 'All in Firebase' },
      { icon: '&#x1F4C5;', label: 'This Week',         val: thisWeek,           sub: 'Last 7 days' },
      { icon: '&#x1F4BE;', label: 'My Products',       val: myProducts.length,  sub: 'Under your account' },
      { icon: '&#x1F504;', label: 'Versions',          val: versions,           sub: 'Regenerations saved' },
      { icon: '&#x1F50D;', label: 'Total Audits',      val: audits.length,      sub: 'SEO audits run' },
      { icon: '&#x2B50;',  label: 'Avg Audit Score',   val: avgScore || '-',    sub: 'Average SEO score' },
      { icon: '&#x1F310;', label: 'Languages',         val: langs,              sub: 'EN / HI / TE' },
      { icon: '&#x1F525;', label: 'Firebase Status',   val: 'Live',             sub: 'abra-zylo-seo' }
    ];

    _renderStats(statsData);
    _renderRecent(products.slice(0, 6));
    _updateHistoryBadge(products.length);

  } catch (e) {
    console.warn('[Dashboard] loadStats error:', e.message);
  }
}

function _renderStats(data) {
  const grid = document.getElementById('dash-stats');
  if (!grid) return;
  grid.innerHTML = data.map(s => `
    <div class="stat-card fade-in">
      <div class="stat-icon">${s.icon}</div>
      <div class="stat-label">${s.label}</div>
      <div class="stat-val">${s.val}</div>
      <div class="stat-sub">${s.sub}</div>
    </div>`).join('');
}

function _renderRecent(items) {
  const el = document.getElementById('recent-list');
  if (!el) return;
  if (!items.length) { el.innerHTML = '<p class="empty-msg">No activity yet. Generate your first product!</p>'; return; }
  el.innerHTML = items.map(p => `
    <div class="recent-item">
      <div class="recent-thumb">
        ${p.imageThumb ? `<img src="${p.imageThumb}" alt="${safeStr(p.productName)}"/>` : '&#x1F4E6;'}
      </div>
      <div class="recent-info">
        <div class="recent-name">${safeStr(p.productName)}</div>
        <div class="recent-date">${formatDate(p.timestamp)}</div>
      </div>
    </div>`).join('');
}

function _updateHistoryBadge(count) {
  const badge = document.getElementById('history-badge');
  if (badge) badge.textContent = count;
}

async function _fetchProducts() {
  try {
    const snap = await FB.getDocs(FB.col('products'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  } catch { return []; }
}

async function _fetchAudits() {
  const user = getUser();
  if (!user) return [];
  try {
    const q    = FB.query(FB.col('seo_audits'), FB.where('uid', '==', user.uid));
    const snap = await FB.getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch { return []; }
}
