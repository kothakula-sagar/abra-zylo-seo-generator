/**
 * history.js - Generation history page
 */

import { FB } from './firebase.js';
import { getUser, isAdmin } from './auth.js';
import { safeStr, formatDate } from './utils.js';
import { showToast, openModal, closeModal } from './ui.js';
import { renderResult, setCurrentResult } from './seo-generator.js';
import { computeSeoScore } from './utils.js';

let _cache = [];

// ── RENDER HISTORY LIST ───────────────────────────────────────
export async function render() {
  const list   = document.getElementById('history-list');
  if (!list) return;
  list.innerHTML = '<p class="empty-msg" style="text-align:center;padding:2rem">Loading from Firebase...</p>';

  const search  = (document.getElementById('hist-search')?.value || '').toLowerCase();
  const langF   = document.getElementById('hist-lang')?.value || '';

  let products = await _fetchAll();

  if (search) products = products.filter(p => safeStr(p.productName).toLowerCase().includes(search));
  if (langF)  products = products.filter(p => p.lang === langF);

  _cache = products;

  if (!products.length) {
    list.innerHTML = `<div style="text-align:center;padding:3rem">
      <p style="color:var(--text3);font-size:.875rem">${search || langF ? 'No results found.' : 'No history yet. Generate your first product!'}</p>
    </div>`;
    return;
  }

  const langLabels = { en: 'EN', hi: 'HI', te: 'TE' };
  list.innerHTML = products.map((p, i) => `
    <div class="history-item" onclick="window.History.open(${i})">
      <div class="history-thumb">
        ${p.imageThumb ? `<img src="${p.imageThumb}" alt="${safeStr(p.productName)}"/>` : '&#x1F4E6;'}
      </div>
      <div class="history-info">
        <h4>${safeStr(p.productName)}</h4>
        <p>${safeStr(p.category) || 'No category'} &middot; ${safeStr(p.meta_title).substring(0, 55)}${safeStr(p.meta_title).length > 55 ? '...' : ''}</p>
      </div>
      <div class="history-meta">
        <div class="history-date">${formatDate(p.timestamp)}</div>
        <div class="history-badges">
          <span class="lang-badge">${langLabels[p.lang] || 'EN'}</span>
          <span style="background:#fff7ed;color:#ea580c;padding:2px 8px;border-radius:99px;font-size:.65rem;font-weight:700">&#x1F525;</span>
          ${(p.versions || []).length > 0 ? `<span class="versions-badge">${p.versions.length}v</span>` : ''}
        </div>
      </div>
    </div>`).join('');
}

// ── OPEN DETAIL MODAL ─────────────────────────────────────────
export function open(idx) {
  const p = _cache[idx];
  if (!p) return;
  const langLabels = { en: 'English', hi: 'Hindi', te: 'Telugu' };
  document.getElementById('hm-title').textContent = safeStr(p.productName);

  const versionsHtml = (p.versions || []).length > 0 ? `
    <div style="margin-top:1rem">
      <p style="font-size:.75rem;font-weight:700;text-transform:uppercase;color:var(--text2);margin-bottom:.5rem">
        Version History (${p.versions.length})
      </p>
      ${p.versions.map((v, vi) => `
        <div class="version-item">
          <div class="version-head">
            <span class="version-num">Version ${vi + 1}</span>
            <span class="version-date">${formatDate(v.savedAt || v.timestamp)}</span>
          </div>
          <div class="version-title">${safeStr(v.meta_title)}</div>
        </div>`).join('')}
    </div>` : '';

  document.getElementById('hm-body').innerHTML = `
    ${p.imageThumb ? `<img src="${p.imageThumb}" style="max-height:110px;border-radius:10px;margin-bottom:1rem"/>` : ''}
    <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:1rem">
      <span class="lang-badge">${langLabels[p.lang] || p.lang}</span>
      ${p.category ? `<span style="background:var(--surface2);color:var(--text2);padding:2px 10px;border-radius:99px;font-size:.72rem">${p.category}</span>` : ''}
      <span style="background:#fff7ed;color:#ea580c;padding:2px 10px;border-radius:99px;font-size:.72rem">&#x1F525; Firebase</span>
      ${p.seoScore ? `<span style="background:var(--green-bg);color:var(--green);padding:2px 10px;border-radius:99px;font-size:.72rem;font-weight:700">Score: ${p.seoScore}</span>` : ''}
    </div>
    <div class="seo-field"><div class="seo-field-head"><span class="seo-label">Meta Title</span></div><div class="seo-val">${safeStr(p.meta_title)}</div></div>
    <div class="seo-field"><div class="seo-field-head"><span class="seo-label">Meta Description</span></div><div class="seo-val">${safeStr(p.meta_description)}</div></div>
    <div class="seo-field"><div class="seo-field-head"><span class="seo-label">SEO Slug</span></div><div class="seo-val mono">${safeStr(p.seo_slug)}</div></div>
    <div class="seo-field"><div class="seo-field-head"><span class="seo-label">Keywords</span></div><div class="kw-wrap">${(p.focus_keywords || []).map(k => `<span class="kw-tag">${k}</span>`).join('')}</div></div>
    <div class="seo-field"><div class="seo-field-head"><span class="seo-label">Description</span></div><div class="seo-val" style="white-space:pre-wrap;max-height:140px;overflow-y:auto">${safeStr(p.product_description)}</div></div>
    ${versionsHtml}
    <div style="margin-top:1.25rem;display:flex;gap:.5rem;flex-wrap:wrap">
      <button class="btn btn-accent btn-sm" onclick="window.History.loadIntoGenerator(${idx})">Load &amp; Edit</button>
      ${isAdmin() ? `<button class="btn btn-danger btn-sm" onclick="window.History.deleteItem(${idx},'${p.id}')">Delete</button>` : ''}
      <button class="btn btn-outline btn-sm" onclick="window.UI.closeModal('hist-modal')">Close</button>
    </div>`;

  openModal('hist-modal');
}

export function loadIntoGenerator(idx) {
  const p = _cache[idx];
  if (!p) return;
  closeModal('hist-modal');
  // Set values in form
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  setVal('prod-name', p.productName);
  setVal('prod-cat',  p.category);
  setVal('prod-lang', p.lang || 'en');
  // Render result
  setCurrentResult(p);
  const sd = computeSeoScore(p);
  renderResult(p, sd);
  window.App.go('generate');
}

export async function deleteItem(idx, docId) {
  if (!isAdmin()) return;
  if (!confirm('Delete this product from Firebase? This cannot be undone.')) return;
  try {
    await FB.deleteDoc(FB.docRef('products', docId));
    closeModal('hist-modal');
    showToast('Deleted.');
    render();
  } catch (e) { showToast('Delete failed: ' + e.message); }
}

export async function clearAll() {
  if (!isAdmin()) return;
  if (!confirm('Delete ALL products from Firebase? This CANNOT be undone.')) return;
  try {
    const snap = await FB.getDocs(FB.col('products'));
    await Promise.all(snap.docs.map(d => FB.deleteDoc(FB.docRef('products', d.id))));
    showToast('All cleared.');
    render();
  } catch (e) { showToast('Error: ' + e.message); }
}

export async function exportJSON() {
  const products = await _fetchAll();
  const blob = new Blob(
    [JSON.stringify({ exported: new Date().toISOString(), count: products.length, products }, null, 2)],
    { type: 'application/json' }
  );
  const a = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `abrazylo-history-${Date.now()}.json`;
  a.click();
}

// ── FETCH ─────────────────────────────────────────────────────
async function _fetchAll() {
  try {
    const snap = await FB.getDocs(FB.col('products'));
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  } catch { return []; }
}
