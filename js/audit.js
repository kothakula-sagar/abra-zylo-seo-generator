/**
 * audit.js - SEO Audit Tool + Performance Audit (PageSpeed Insights)
 */

import { FB } from './firebase.js';
import { getUser, isAdmin } from './auth.js';
import { safeStr, formatDate } from './utils.js';
import { showAlert, hideAlert, showToast, animateScoreRing, showLoading, completeStep, hideLoading } from './ui.js';
import { runPageSpeedAudit, saveAuditToFirestore } from './pagespeed.js';

let _currentAudit = null;
let _currentPerformanceAudit = null;

// ── RUN AUDIT ─────────────────────────────────────────────────
export function run() {
  hideAlert('audit-alert');
  const title   = (document.getElementById('audit-title')?.value   || '').trim();
  const desc    = (document.getElementById('audit-meta')?.value    || '').trim();
  const keyword = (document.getElementById('audit-kw')?.value      || '').trim().toLowerCase();
  const content = (document.getElementById('audit-content')?.value || '').trim();
  const url     = (document.getElementById('audit-url')?.value     || '').trim();

  if (!title && !desc && !keyword && !content) {
    showAlert('audit-alert', 'Please fill in at least one field to run the audit.');
    return;
  }

  const checks = _computeChecks(title, desc, keyword, content);
  const pass   = checks.filter(c => c.status === 'pass').length;
  const warn   = checks.filter(c => c.status === 'warn').length;
  const fail   = checks.filter(c => c.status === 'fail').length;

  let score = 100;
  checks.forEach(c => {
    if (c.status === 'fail') score -= (c.weight || 10);
    if (c.status === 'warn') score -= (c.weight || 10) / 2;
  });
  score = Math.max(0, Math.min(100, Math.round(score)));

  const recs = _buildRecs(checks, keyword);

  _currentAudit = { score, pass, warn, fail, checks, recs, title, desc, keyword, url, timestamp: Date.now(), uid: getUser()?.uid };

  _renderAuditResults(_currentAudit);
  document.getElementById('audit-results').style.display = 'block';
  setTimeout(() => document.getElementById('audit-results')?.scrollIntoView({ behavior: 'smooth' }), 100);
  showToast(`Audit complete - Score: ${score}/100`);
}

// ── SWITCH TAB ────────────────────────────────────────────────
export function switchAuditTab(tab) {
  // Update tab buttons
  document.querySelectorAll('.audit-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  
  // Update tab content
  document.querySelectorAll('.audit-tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `audit-tab-${tab}`);
  });
}

// ── RUN PERFORMANCE AUDIT ─────────────────────────────────────
export async function runPerformanceAudit() {
  hideAlert('perf-alert');
  
  const url = (document.getElementById('perf-url')?.value || '').trim();
  const strategyEl = document.querySelector('input[name="perf-strategy"]:checked');
  const strategy = strategyEl ? strategyEl.value : 'mobile';
  
  if (!url) {
    showAlert('perf-alert', 'Please enter a website URL.');
    return;
  }
  
  // Basic URL validation
  try {
    new URL(url);
  } catch {
    showAlert('perf-alert', 'Please enter a valid URL (including http:// or https://).');
    return;
  }
  
  // Show loading overlay with steps
  showLoading('Running Performance Audit', [
    'Connecting to Google PageSpeed API',
    'Running Lighthouse Analysis',
    'Collecting Performance Metrics',
    'Generating Report'
  ]);
  
  const btn = document.getElementById('perf-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Analyzing...'; }
  
  try {
    // Step 1: Connecting
    completeStep(0, 25, 'Connecting to Google PageSpeed API...');
    await new Promise(r => setTimeout(r, 500));
    
    // Step 2: Running Lighthouse
    completeStep(1, 40, 'Running Lighthouse Analysis...');
    const auditData = await runPageSpeedAudit(url, strategy);
    
    // Step 3: Collecting Metrics
    completeStep(2, 75, 'Collecting Performance Metrics...');
    await new Promise(r => setTimeout(r, 300));
    
    // Step 4: Generating Report
    completeStep(3, 100, 'Generating Report...');
    await new Promise(r => setTimeout(r, 300));
    
    hideLoading();
    
    // Store and render
    _currentPerformanceAudit = auditData;
    _renderPerformanceResults(auditData);
    document.getElementById('perf-results').style.display = 'block';
    setTimeout(() => document.getElementById('perf-results')?.scrollIntoView({ behavior: 'smooth' }), 100);
    showToast('Performance audit complete!');
    
  } catch (e) {
    hideLoading();
    showAlert('perf-alert', e.message);
    console.error('[Audit] Performance audit error:', e);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Analyze Performance'; }
  }
}

// ── RENDER PERFORMANCE RESULTS ────────────────────────────────
function _renderPerformanceResults(data) {
  const { scores, coreWebVitals, opportunities, diagnostics, passed, url, strategy } = data;
  
  // Score card colors
  const getScoreColor = (score) => {
    if (score >= 90) return '#10b981';
    if (score >= 50) return '#f59e0b';
    return '#ef4444';
  };
  
  const getScoreLabel = (score) => {
    if (score >= 90) return 'Good';
    if (score >= 50) return 'Needs Improvement';
    return 'Poor';
  };
  
  // Main score cards
  const scoresHtml = `
    <div class="perf-scores-grid">
      <div class="perf-score-card">
        <div class="perf-score-label">Performance</div>
        <div class="perf-score-circle" style="--score: ${scores.performance}; --color: ${getScoreColor(scores.performance)}">
          <span class="perf-score-val">${scores.performance}</span>
        </div>
        <div class="perf-score-status" style="color: ${getScoreColor(scores.performance)}">${getScoreLabel(scores.performance)}</div>
      </div>
      <div class="perf-score-card">
        <div class="perf-score-label">Accessibility</div>
        <div class="perf-score-circle" style="--score: ${scores.accessibility}; --color: ${getScoreColor(scores.accessibility)}">
          <span class="perf-score-val">${scores.accessibility}</span>
        </div>
        <div class="perf-score-status" style="color: ${getScoreColor(scores.accessibility)}">${getScoreLabel(scores.accessibility)}</div>
      </div>
      <div class="perf-score-card">
        <div class="perf-score-label">Best Practices</div>
        <div class="perf-score-circle" style="--score: ${scores.bestPractices}; --color: ${getScoreColor(scores.bestPractices)}">
          <span class="perf-score-val">${scores.bestPractices}</span>
        </div>
        <div class="perf-score-status" style="color: ${getScoreColor(scores.bestPractices)}">${getScoreLabel(scores.bestPractices)}</div>
      </div>
      <div class="perf-score-card">
        <div class="perf-score-label">SEO</div>
        <div class="perf-score-circle" style="--score: ${scores.seo}; --color: ${getScoreColor(scores.seo)}">
          <span class="perf-score-val">${scores.seo}</span>
        </div>
        <div class="perf-score-status" style="color: ${getScoreColor(scores.seo)}">${getScoreLabel(scores.seo)}</div>
      </div>
    </div>
  `;
  
  // Core Web Vitals
  const cwvHtml = Object.entries(coreWebVitals).map(([key, metric]) => {
    const color = metric.score >= 0.9 ? '#10b981' : metric.score >= 0.5 ? '#f59e0b' : '#ef4444';
    return `
      <div class="cwv-item" style="border-left-color: ${color}">
        <div class="cwv-title">${metric.title}</div>
        <div class="cwv-value" style="color: ${color}">${metric.displayValue}</div>
      </div>
    `;
  }).join('');
  
  // Opportunities
  const oppHtml = opportunities.length > 0 
    ? opportunities.slice(0, 10).map(opp => `
        <div class="perf-item">
          <div class="perf-item-title">${opp.title}</div>
          <div class="perf-item-desc">${opp.description}</div>
          ${opp.displayValue ? `<div class="perf-item-value">${opp.displayValue}</div>` : ''}
        </div>
      `).join('')
    : '<p class="empty-msg">No optimization opportunities found. Great job!</p>';
  
  // Diagnostics
  const diagHtml = diagnostics.length > 0
    ? diagnostics.slice(0, 10).map(diag => `
        <div class="perf-item">
          <div class="perf-item-title">${diag.title}</div>
          <div class="perf-item-desc">${diag.description}</div>
          ${diag.displayValue ? `<div class="perf-item-value">${diag.displayValue}</div>` : ''}
        </div>
      `).join('')
    : '<p class="empty-msg">No diagnostic information available.</p>';
  
  // Passed audits
  const passedHtml = passed.length > 0
    ? `<div class="perf-passed-grid">${passed.slice(0, 20).map(p => `
        <div class="perf-passed-item">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          <span>${p.title}</span>
        </div>
      `).join('')}</div>`
    : '<p class="empty-msg">No passed audits.</p>';
  
  // Render complete results
  document.getElementById('perf-results').innerHTML = `
    <div class="card" style="margin-bottom:1.25rem">
      <div class="card-header">
        <h3>Performance Report</h3>
        <div style="display:flex;gap:.4rem">
          <button class="btn btn-outline btn-sm" onclick="window.Audit.copyPerformanceReport()">Copy</button>
          <button class="btn btn-primary btn-sm" onclick="window.Audit.savePerformanceAudit()">Save to Firebase</button>
        </div>
      </div>
      <div class="card-body">
        <div style="font-size:.85rem;color:var(--text2);margin-bottom:1rem">
          <div><strong>URL:</strong> ${url}</div>
          <div><strong>Strategy:</strong> ${strategy.charAt(0).toUpperCase() + strategy.slice(1)}</div>
          <div><strong>Date:</strong> ${formatDate(data.timestamp)}</div>
        </div>
        ${scoresHtml}
      </div>
    </div>
    
    <div class="card" style="margin-bottom:1.25rem">
      <div class="card-header"><h3>Core Web Vitals</h3></div>
      <div class="card-body">
        <div class="cwv-grid">${cwvHtml}</div>
      </div>
    </div>
    
    <div class="card" style="margin-bottom:1.25rem">
      <div class="card-header"><h3>Opportunities</h3></div>
      <div class="card-body">${oppHtml}</div>
    </div>
    
    <div class="card" style="margin-bottom:1.25rem">
      <div class="card-header"><h3>Diagnostics</h3></div>
      <div class="card-body">${diagHtml}</div>
    </div>
    
    <div class="card" style="margin-bottom:1.25rem">
      <div class="card-header"><h3>Passed Audits</h3></div>
      <div class="card-body">${passedHtml}</div>
    </div>
  `;
}

// ── SAVE PERFORMANCE AUDIT ────────────────────────────────────
export async function savePerformanceAudit() {
  if (!_currentPerformanceAudit) {
    showToast('No performance audit to save.');
    return;
  }
  
  try {
    await saveAuditToFirestore(_currentPerformanceAudit);
  } catch (e) {
    showToast('Save failed: ' + e.message);
  }
}

// ── COPY PERFORMANCE REPORT ───────────────────────────────────
export function copyPerformanceReport() {
  if (!_currentPerformanceAudit) {
    showToast('No performance audit to copy.');
    return;
  }
  
  const data = _currentPerformanceAudit;
  const lines = [
    'PERFORMANCE AUDIT REPORT - Abra Zylo',
    `Date: ${formatDate(data.timestamp)}`,
    `URL: ${data.url}`,
    `Strategy: ${data.strategy}`,
    '',
    'SCORES:',
    `  Performance: ${data.scores.performance}/100`,
    `  Accessibility: ${data.scores.accessibility}/100`,
    `  Best Practices: ${data.scores.bestPractices}/100`,
    `  SEO: ${data.scores.seo}/100`,
    '',
    'CORE WEB VITALS:',
    ...Object.entries(data.coreWebVitals).map(([key, m]) => `  ${m.title}: ${m.displayValue}`),
    '',
    'OPPORTUNITIES:',
    ...data.opportunities.slice(0, 10).map(o => `  • ${o.title}: ${o.displayValue || 'N/A'}`),
    '',
    'DIAGNOSTICS:',
    ...data.diagnostics.slice(0, 10).map(d => `  • ${d.title}: ${d.displayValue || 'N/A'}`)
  ];
  
  navigator.clipboard.writeText(lines.join('\n')).then(() => showToast('Report copied!'));
}

// ── CLEAR PERFORMANCE ─────────────────────────────────────────
export function clearPerformance() {
  document.getElementById('perf-url').value = '';
  document.getElementById('perf-results').style.display = 'none';
  hideAlert('perf-alert');
  _currentPerformanceAudit = null;
}

// ── RENDER ────────────────────────────────────────────────────
function _renderAuditResults(r) {
  const circ  = 2 * Math.PI * 65;
  const color = r.score >= 80 ? '#10b981' : r.score >= 60 ? '#3b82f6' : r.score >= 40 ? '#f59e0b' : '#ef4444';
  const label = r.score >= 80 ? 'Great SEO' : r.score >= 60 ? 'Good SEO' : r.score >= 40 ? 'Needs Work' : 'Poor SEO';
  const pillCls = r.score >= 80 ? 'asp-great' : r.score >= 60 ? 'asp-good' : r.score >= 40 ? 'asp-ok' : 'asp-poor';

  const checksHtml = r.checks.map(c => {
    const icon = c.status === 'pass' ? '&#x2713;' : c.status === 'warn' ? '!' : '&#x2717;';
    return `<div class="audit-check">
      <div class="aci ${c.status}">${icon}</div>
      <div>
        <div class="ach-label">${c.label}</div>
        <div class="ach-detail">${c.detail} - ${c.hint}</div>
      </div>
      <span class="ach-badge badge-${c.status}">${c.status.charAt(0).toUpperCase() + c.status.slice(1)}</span>
    </div>`;
  }).join('');

  const recsHtml = r.recs.map(rec => `<li>${rec}</li>`).join('');

  document.getElementById('audit-results').innerHTML = `
    <div class="audit-results-grid">
      <div class="card">
        <div class="card-header"><h3>Overall Score</h3></div>
        <div class="card-body" style="text-align:center">
          <div class="audit-score-wrap">
            <svg class="audit-score-ring" viewBox="0 0 140 140" width="160" height="160">
              <circle class="audit-ring-bg" cx="70" cy="70" r="65"/>
              <circle class="audit-ring-fill" id="audit-ring-fill" cx="70" cy="70" r="65"/>
            </svg>
            <div class="audit-score-center">
              <div class="audit-score-num" id="audit-score-num">0</div>
              <div class="audit-score-denom">/100</div>
            </div>
          </div>
          <div class="audit-score-label" style="color:${color}">${label}</div>
          <div class="audit-summary-cards">
            <div class="asc asc-pass"><div class="asc-val">${r.pass}</div><div class="asc-lbl">Pass</div></div>
            <div class="asc asc-warn"><div class="asc-val">${r.warn}</div><div class="asc-lbl">Warn</div></div>
            <div class="asc asc-fail"><div class="asc-val">${r.fail}</div><div class="asc-lbl">Fail</div></div>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-header">
          <h3>Audit Summary</h3>
          <div style="display:flex;gap:.4rem">
            <button class="btn btn-outline btn-sm" onclick="window.Audit.copyReport()">Copy</button>
            <button class="btn btn-accent btn-sm" onclick="window.Audit.exportPdf()">PDF</button>
            <button class="btn btn-primary btn-sm" onclick="window.Audit.saveToFirebase()">Save</button>
          </div>
        </div>
        <div class="card-body">
          <div style="font-size:.85rem;color:var(--text2);line-height:2">
            <div><strong>URL:</strong> ${r.url || 'N/A'}</div>
            <div><strong>Keyword:</strong> ${r.keyword || 'N/A'}</div>
            <div><strong>Checks:</strong> ${r.checks.length}</div>
            <div><strong>Date:</strong> ${formatDate(r.timestamp)}</div>
          </div>
        </div>
      </div>
    </div>
    <div class="card" style="margin-bottom:1.25rem">
      <div class="card-header"><h3>SEO Checks</h3></div>
      <div class="card-body"><div class="audit-checks">${checksHtml}</div></div>
    </div>
    <div class="card" style="margin-bottom:1.25rem">
      <div class="card-header"><h3>Recommendations</h3></div>
      <div class="card-body"><ul class="audit-rec-list">${recsHtml}</ul></div>
    </div>`;

  // Animate ring
  setTimeout(() => {
    animateScoreRing(r.score, color, 'audit-ring-fill', 'audit-score-num', 408);
  }, 100);
}

// ── CLEAR ─────────────────────────────────────────────────────
export function clear() {
  ['audit-url','audit-title','audit-meta','audit-kw','audit-content'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('audit-results').style.display = 'none';
  hideAlert('audit-alert');
  _currentAudit = null;
}

// ── SAVE TO FIREBASE ──────────────────────────────────────────
export async function saveToFirebase() {
  if (!_currentAudit || !getUser()) return;
  try {
    await FB.addDoc(FB.col('seo_audits'), {
      uid:            getUser().uid,
      score:          _currentAudit.score,
      pass:           _currentAudit.pass,
      warn:           _currentAudit.warn,
      fail:           _currentAudit.fail,
      title:          _currentAudit.title  || '',
      metaDesc:       _currentAudit.desc   || '',
      keyword:        _currentAudit.keyword || '',
      url:            _currentAudit.url    || '',
      recommendations: _currentAudit.recs  || [],
      checksSnapshot: _currentAudit.checks.map(c => ({ id: c.id, label: c.label, status: c.status, detail: c.detail })),
      timestamp:      _currentAudit.timestamp,
      createdAt:      FB.serverTimestamp(),
      createdBy:      getUser().email || ''
    });
    showToast('Audit saved to Firebase!');
    renderHistory();
  } catch (e) { showToast('Save failed: ' + e.message); }
}

// ── HISTORY ───────────────────────────────────────────────────
export async function renderHistory() {
  const el = document.getElementById('audit-history-list');
  if (!el) return;
  el.innerHTML = '<p class="empty-msg">Loading...</p>';
  const audits = await _fetchAudits();
  if (!audits.length) {
    el.innerHTML = '<p class="empty-msg">No audits saved yet.</p>'; return;
  }
  el.innerHTML = audits.map((a, i) => {
    const pillCls = a.score >= 80 ? 'asp-great' : a.score >= 60 ? 'asp-good' : a.score >= 40 ? 'asp-ok' : 'asp-poor';
    return `<div class="audit-hist-item" onclick="window.Audit.loadHistory(${i})">
      <div>
        <div style="font-size:.875rem;font-weight:700;margin-bottom:2px">${a.title || a.keyword || 'Untitled Audit'}</div>
        <div style="font-size:.75rem;color:var(--text2)">${a.keyword ? 'KW: ' + a.keyword + ' &middot; ' : ''}${formatDate(a.timestamp)}</div>
        <div style="font-size:.72rem;color:var(--text3);margin-top:2px">Pass: ${a.pass || 0} &middot; Warn: ${a.warn || 0} &middot; Fail: ${a.fail || 0}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px">
        <span class="audit-score-pill ${pillCls}">${a.score}/100</span>
        ${isAdmin() ? `<button class="btn btn-danger btn-xs" onclick="event.stopPropagation();window.Audit.deleteHistory('${a.id}')">Del</button>` : ''}
      </div>
    </div>`;
  }).join('');
  window._auditHistCache = audits;
}

export function loadHistory(idx) {
  const a = window._auditHistCache?.[idx];
  if (!a) return;
  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
  setVal('audit-url',     a.url);
  setVal('audit-title',   a.title);
  setVal('audit-meta',    a.metaDesc);
  setVal('audit-kw',      a.keyword);
  setVal('audit-content', '');
  // Reconstruct minimal audit result for display
  _currentAudit = { ...a, checks: (a.checksSnapshot || []).map(c => ({ ...c, hint: '' })), recs: a.recommendations || [] };
  _renderAuditResults(_currentAudit);
  document.getElementById('audit-results').style.display = 'block';
  window.scrollTo(0, 0);
  showToast('Audit loaded from history');
}

export async function deleteHistory(docId) {
  if (!isAdmin()) return;
  if (!confirm('Delete this audit?')) return;
  try {
    await FB.deleteDoc(FB.docRef('seo_audits', docId));
    showToast('Deleted.'); renderHistory();
  } catch (e) { showToast('Delete failed: ' + e.message); }
}

export async function clearHistory() {
  if (!isAdmin()) return;
  if (!confirm('Delete ALL audit records?')) return;
  try {
    const user = getUser();
    const q    = FB.query(FB.col('seo_audits'), FB.where('uid', '==', user.uid));
    const snap = await FB.getDocs(q);
    await Promise.all(snap.docs.map(d => FB.deleteDoc(FB.docRef('seo_audits', d.id))));
    showToast('All audit records cleared.'); renderHistory();
  } catch (e) { showToast('Error: ' + e.message); }
}

export function copyReport() {
  if (!_currentAudit) { showToast('No audit to copy.'); return; }
  const r = _currentAudit;
  const lines = [
    'SEO AUDIT REPORT - Abra Zylo',
    `Date: ${formatDate(r.timestamp)}`,
    `URL: ${r.url || 'N/A'}`,
    `Focus Keyword: ${r.keyword || 'N/A'}`,
    `Title: ${r.title || 'N/A'}`,
    `SCORE: ${r.score}/100  |  Pass: ${r.pass}  Warn: ${r.warn}  Fail: ${r.fail}`,
    '',
    'CHECKS:',
    ...r.checks.map(c => `  [${c.status.toUpperCase()}] ${c.label}: ${c.detail}`),
    '',
    'RECOMMENDATIONS:',
    ...r.recs.map(rec => `  > ${rec}`)
  ];
  navigator.clipboard.writeText(lines.join('\n')).then(() => showToast('Report copied!'));
}

export function exportPdf() {
  if (!_currentAudit) { showToast('No audit to export.'); return; }
  const r     = _currentAudit;
  const color = r.score >= 80 ? '#10b981' : r.score >= 60 ? '#3b82f6' : r.score >= 40 ? '#f59e0b' : '#ef4444';
  const rows  = r.checks.map(c => {
    const cl = c.status === 'pass' ? '#10b981' : c.status === 'warn' ? '#b45309' : '#ef4444';
    return `<tr><td style="padding:6px 8px;border-bottom:1px solid #e2e8f0"><strong>${c.label}</strong><br/><small style="color:#64748b">${c.detail}</small></td><td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;color:${cl};font-weight:700;text-align:center">${c.status}</td></tr>`;
  }).join('');
  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>SEO Audit - Abra Zylo</title><style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;color:#0f172a}table{width:100%;border-collapse:collapse}th{background:#f1f5f9;padding:8px;text-align:left;font-size:.82rem}@media print{@page{margin:20mm}}</style></head><body><h1>SEO Audit Report</h1><p><strong>Abra Zylo AI SEO Portal</strong> &middot; ${formatDate(r.timestamp)}</p><table><tr><th>URL</th><td>${r.url || 'N/A'}</td></tr><tr><th>Keyword</th><td>${r.keyword || 'N/A'}</td></tr></table><h2 style="color:${color}">Score: ${r.score}/100</h2><p>Pass: <strong>${r.pass}</strong> &nbsp; Warn: <strong>${r.warn}</strong> &nbsp; Fail: <strong>${r.fail}</strong></p><h3>Checks</h3><table><tr><th>Check</th><th>Status</th></tr>${rows}</table><h3>Recommendations</h3><ul>${r.recs.map(rec => `<li>${rec}</li>`).join('')}</ul><p style="font-size:.75rem;color:#94a3b8;margin-top:2rem">Abra Zylo AI SEO Portal &middot; by Sagar K</p><script>window.print();</scr` + `ipt></body></html>`);
  win.document.close();
}

// ── CHECKS LOGIC ──────────────────────────────────────────────
function _computeChecks(title, desc, keyword, content) {
  const kw        = keyword.toLowerCase();
  const titleLow  = title.toLowerCase();
  const descLow   = desc.toLowerCase();
  const contLow   = content.toLowerCase();
  const wordCount = content.split(/\s+/).filter(Boolean).length;
  const h1Count   = (content.match(/<h1[^>]*>/gi) || []).length;
  const h2Count   = (content.match(/<h2[^>]*>/gi) || []).length;
  const imgCount  = (content.match(/<img[^>]+alt=["'][^"']+["'][^>]*>/gi) || []).length;
  const linkCount = (content.match(/<a\s[^>]*href=/gi) || []).length;

  let kwDensity = 0;
  if (kw && wordCount > 0) {
    const kwWords   = kw.split(/\s+/).filter(Boolean);
    const contWords = contLow.split(/\s+/).filter(Boolean);
    let hits = 0;
    for (let i = 0; i <= contWords.length - kwWords.length; i++) {
      if (kwWords.every((w, j) => contWords[i + j] === w)) hits++;
    }
    kwDensity = parseFloat(((hits / wordCount) * 100).toFixed(2));
  }

  return [
    { id:'title-len',   label:'Title Length',         weight:12,
      detail: title ? `${title.length} chars` : 'No title',
      status: !title ? 'fail' : (title.length >= 50 && title.length <= 70) ? 'pass' : (title.length >= 40) ? 'warn' : 'fail',
      hint: !title ? 'Add a title.' : title.length < 40 ? 'Too short. Target 50-70 chars.' : title.length > 70 ? 'Too long. Keep under 70.' : 'Slightly short. Aim for 50-70.' },
    { id:'desc-len',    label:'Meta Description',     weight:12,
      detail: desc ? `${desc.length} chars` : 'No description',
      status: !desc ? 'fail' : (desc.length >= 140 && desc.length <= 160) ? 'pass' : (desc.length >= 120) ? 'warn' : 'fail',
      hint: !desc ? 'Add a meta description.' : desc.length < 120 ? 'Too short. Aim for 140-160.' : desc.length > 160 ? 'Too long. Keep under 160.' : 'Slightly short. Try to reach 140.' },
    { id:'kw-title',    label:'Keyword in Title',     weight:10,
      detail: kw ? (titleLow.includes(kw) ? 'Found' : 'Not found') : 'No keyword',
      status: !kw ? 'warn' : titleLow.includes(kw) ? 'pass' : 'fail',
      hint: !kw ? 'Set a focus keyword.' : titleLow.includes(kw) ? 'Keyword in title.' : 'Add keyword to title.' },
    { id:'kw-desc',     label:'Keyword in Meta Desc', weight:8,
      detail: kw ? (descLow.includes(kw) ? 'Found' : 'Not found') : 'No keyword',
      status: !kw ? 'warn' : descLow.includes(kw) ? 'pass' : 'fail',
      hint: !kw ? 'Set a keyword.' : descLow.includes(kw) ? 'Keyword in description.' : 'Add keyword to description.' },
    { id:'kw-content',  label:'Keyword in Content',   weight:10,
      detail: kw && content ? (contLow.includes(kw) ? 'Found' : 'Not found') : 'N/A',
      status: !kw || !content ? 'warn' : contLow.includes(kw) ? 'pass' : 'fail',
      hint: !kw ? 'Set a keyword.' : !content ? 'Add content.' : contLow.includes(kw) ? 'Keyword in content.' : 'Add keyword to content.' },
    { id:'content-len', label:'Content Length',       weight:10,
      detail: content ? `${wordCount} words` : 'No content',
      status: !content ? 'fail' : wordCount >= 300 ? 'pass' : wordCount >= 150 ? 'warn' : 'fail',
      hint: !content ? 'Add page content.' : wordCount < 150 ? 'Very thin. Aim for 300+ words.' : 'A bit thin. 300+ words recommended.' },
    { id:'kw-density',  label:'Keyword Density',      weight:8,
      detail: kw && content ? `${kwDensity}%` : 'N/A',
      status: !kw || !content ? 'warn' : (kwDensity >= 0.5 && kwDensity <= 2.5) ? 'pass' : (kwDensity > 2.5 && kwDensity <= 4) ? 'warn' : 'fail',
      hint: kwDensity < 0.5 ? 'Too low. Add more keyword mentions.' : kwDensity > 4 ? 'Too high. Reduce keyword frequency.' : 'Good density (0.5-2.5%).' },
    { id:'h1',          label:'H1 Tag',               weight:8,
      detail: content ? `${h1Count} H1 tag(s)` : 'No content',
      status: !content ? 'warn' : h1Count === 1 ? 'pass' : h1Count === 0 ? 'fail' : 'warn',
      hint: h1Count === 0 ? 'Add one H1 tag.' : h1Count === 1 ? 'Perfect.' : 'Use only one H1.' },
    { id:'h2',          label:'H2 Tags',              weight:6,
      detail: content ? `${h2Count} H2 tag(s)` : 'No content',
      status: !content ? 'warn' : h2Count >= 2 ? 'pass' : h2Count === 1 ? 'warn' : 'fail',
      hint: h2Count === 0 ? 'Add H2 subheadings.' : h2Count === 1 ? 'Add more H2s for structure.' : 'Good H2 usage.' },
    { id:'links',       label:'Internal Links',       weight:8,
      detail: content ? `${linkCount} link(s)` : 'No content',
      status: !content ? 'warn' : linkCount >= 2 ? 'pass' : linkCount === 1 ? 'warn' : 'fail',
      hint: linkCount === 0 ? 'Add internal links.' : linkCount === 1 ? 'Add more links.' : 'Good link count.' },
    { id:'img-alt',     label:'Image Alt Text',       weight:8,
      detail: content ? `${imgCount} image(s) with alt` : 'No content',
      status: !content ? 'warn' : imgCount >= 1 ? 'pass' : (content.includes('<img') ? 'fail' : 'warn'),
      hint: imgCount === 0 && content.includes('<img') ? 'Add alt text to all images.' : imgCount >= 1 ? 'Images have alt text.' : 'No images detected.' }
  ];
}

function _buildRecs(checks, kw) {
  const recs = checks.filter(c => c.status !== 'pass').map(c => c.hint);
  if (!kw) recs.push('Set a focus keyword to enable keyword density and placement checks.');
  return recs.length ? recs : ['All checks passed. Your SEO looks well-optimised!'];
}

async function _fetchAudits() {
  const user = getUser();
  if (!user) return [];
  try {
    const q    = FB.query(FB.col('seo_audits'), FB.where('uid', '==', user.uid));
    const snap = await FB.getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  } catch { return []; }
}
