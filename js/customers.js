/**
 * customers.js - Customer details + WhatsApp marketing
 * Shared customer directory for approved Abra Zylo members/admins.
 */
import { FB } from './firebase.js';
import { getUser, getUserDoc, isAdmin } from './auth.js';
import { showToast, openModal, closeModal } from './ui.js';
import { escapeHtml } from './utils.js';

const CUSTOMER_COLLECTION = 'customers';
const CAMPAIGN_COLLECTION = 'whatsappCampaigns';
const DEFAULT_MESSAGE = 'Hi {{name}}, We at ABRA ZYLO having the sale live on all products with more discounts the shoping like is here {{URL}}. To unsubscribe reply "STOP".';

let _customers = [];
let _campaigns = [];
let _activeCampaign = null;
let _campaignSent = new Set();
let _campaignSentBy = new Map();
let _editingCampaignId = null;
let _customerSearch = '';
let _customerImportFile = null;
let _customerCharts = [];
let _whatsappCharts = [];
const CUSTOMER_IMPORT_SECURITY_KEY = 'Sagar Kothakula';
const CUSTOMER_IMPORT_MAX_ROWS = 500;

// Temporary WhatsApp campaign pacing guard. This is a client-side UX safety
// control only; it does not bypass WhatsApp restrictions or replace the
// official WhatsApp Business Platform.
const WHATSAPP_BATCH_SIZE = 10;
const WHATSAPP_COOLDOWN_MS = 5 * 60 * 1000;
const WHATSAPP_PACING_STORAGE_KEY = 'abraZyloWhatsAppPacingV1';
let _campaignCooldownTimer = null;
let _campaignSending = new Set();

function currentUserMeta() {
  const user = getUser();
  const doc = getUserDoc() || {};
  return {
    uid: user?.uid || '',
    email: user?.email || '',
    name: doc.name || doc.displayName || user?.displayName || user?.email?.split('@')[0] || 'User'
  };
}

function timestampValue(ts) {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  if (ts?.toDate) return ts.toDate().getTime();
  const value = new Date(ts).getTime();
  return Number.isNaN(value) ? 0 : value;
}

function formatDate(ts) {
  const value = timestampValue(ts);
  if (!value) return '-';
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function cleanCustomerName(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[^\p{L}\p{M}\s'-]/gu, '')
    .replace(/[\s]+/g, ' ')
    .replace(/^[\s'-]+|[\s'-]+$/g, '')
    .trim();
}

function displayCustomerName(customer) {
  const cleaned = cleanCustomerName(customer?.name);
  return cleaned || 'Buddy';
}

function normalizeGender(value) {
  const gender = String(value || '').trim().toLowerCase();
  return ['male', 'female'].includes(gender) ? gender : '';
}

function normalizePhone(value) {
  const raw = String(value || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (raw.startsWith('+')) return `+${digits}`;
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

function phoneForWhatsApp(value) {
  return normalizePhone(value).replace(/^\+/, '');
}

function formatPhoneDisplay(value) {
  const raw = String(value || '').trim();
  const hasCountryCode = raw.replace(/\D/g, '').length > 10 || raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');

  if (digits.length === 10) {
    return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  }

  if (hasCountryCode && digits.length >= 12 && digits.startsWith('91')) {
    const local = digits.slice(2);
    if (local.length === 10) {
      return `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
    }
  }

  return raw || '-';
}

function customerStatus(customer) {
  return customer?.status === 'not-interested' ? 'not-interested' : 'interested';
}

function isSubscribed(customer) {
  return customerStatus(customer) === 'interested';
}

function genderMatches(customerGender, campaignGender) {
  return campaignGender === 'all' || normalizeGender(customerGender) === campaignGender;
}


function getChartConstructor() {
  return window.Chart || null;
}

function destroyCharts(list) {
  list.forEach(chart => {
    try { chart?.destroy(); } catch (error) { console.warn('[Charts] destroy failed:', error); }
  });
  list.length = 0;
}

function chartDefaults() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 850, easing: 'easeOutQuart' },
    plugins: { legend: { labels: { usePointStyle: true, boxWidth: 8, color: '#64748b' } } },
    scales: {
      x: { grid: { color: 'rgba(148,163,184,.12)' }, ticks: { color: '#64748b' } },
      y: { beginAtZero: true, grid: { color: 'rgba(148,163,184,.12)' }, ticks: { color: '#64748b', precision: 0 } }
    }
  };
}

function dayLabels(days = 7) {
  const labels = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    labels.push(d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit' }));
  }
  return labels;
}

function dayKey(value) {
  const ts = timestampValue(value);
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function recentDateKeys(days = 7) {
  const keys = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return keys;
}

function renderCustomerAnalytics() {
  const target = document.getElementById('customer-analytics-wrap');
  if (!target) return;
  const ChartCtor = getChartConstructor();
  destroyCharts(_customerCharts);
  const subscribed = _customers.filter(isSubscribed).length;
  const unsubscribed = _customers.length - subscribed;
  const keys = recentDateKeys(7);
  const counts = Object.fromEntries(keys.map(key => [key, 0]));
  _customers.forEach(customer => {
    const key = dayKey(customer.addedAt);
    if (key in counts) counts[key] += 1;
  });
  const labels = dayLabels(7);
  const newCustomers = keys.map(key => counts[key]);

  target.innerHTML = `
    <div class="analytics-stat-grid customer-stat-grid">
      <div class="analytics-stat-card"><span>Total Customers</span><strong>${_customers.length}</strong><small>All customer records</small></div>
      <div class="analytics-stat-card"><span>Subscribed</span><strong>${subscribed}</strong><small>Eligible for WhatsApp</small></div>
      <div class="analytics-stat-card"><span>Unsubscribed</span><strong>${unsubscribed}</strong><small>Excluded from campaigns</small></div>
      <div class="analytics-stat-card"><span>New (7 Days)</span><strong>${newCustomers.reduce((a,b) => a + b, 0)}</strong><small>Recently added</small></div>
    </div>
    <div class="analytics-chart-grid">
      <div class="analytics-chart-card"><div class="analytics-chart-head"><h3>Customer Growth</h3><span>Last 7 days</span></div><div class="analytics-chart-canvas"><canvas id="customer-growth-chart"></canvas></div></div>
      <div class="analytics-chart-card"><div class="analytics-chart-head"><h3>Subscription Overview</h3><span>Current status</span></div><div class="analytics-chart-canvas analytics-doughnut"><canvas id="customer-subscription-chart"></canvas></div></div>
      <div class="analytics-chart-card analytics-chart-wide"><div class="analytics-chart-head"><h3>Daily Customer Additions</h3><span>Last 7 days</span></div><div class="analytics-chart-canvas"><canvas id="customer-daily-chart"></canvas></div></div>
    </div>`;

  if (!ChartCtor) return;
  const common = chartDefaults();
  const growth = new ChartCtor(document.getElementById('customer-growth-chart'), {
    type: 'line', data: { labels, datasets: [{ label: 'New Customers', data: newCustomers, tension: .35, fill: true, borderWidth: 2 }] }, options: common
  });
  const doughnut = new ChartCtor(document.getElementById('customer-subscription-chart'), {
    type: 'doughnut', data: { labels: ['Subscribed', 'Unsubscribed'], datasets: [{ data: [subscribed, unsubscribed], borderWidth: 0 }] },
    options: { ...common, cutout: '68%', plugins: { ...common.plugins, legend: { position: 'bottom', labels: { usePointStyle: true, color: '#64748b' } } } }
  });
  const daily = new ChartCtor(document.getElementById('customer-daily-chart'), {
    type: 'bar', data: { labels, datasets: [{ label: 'Customers Added', data: newCustomers, borderRadius: 8, maxBarThickness: 44 }] }, options: common
  });
  _customerCharts.push(growth, doughnut, daily);
}

function renderWhatsappAnalytics(recipientStats = []) {
  const target = document.getElementById('whatsapp-analytics-wrap');
  if (!target) return;
  const ChartCtor = getChartConstructor();
  destroyCharts(_whatsappCharts);
  const subscribed = _customers.filter(isSubscribed).length;
  const sentTotal = recipientStats.reduce((sum, item) => sum + item.sentCount, 0);
  const activeCampaigns = _campaigns.length;
  const eligible = _customers.filter(customer => isSubscribed(customer)).length;
  const campaignLabels = _campaigns.map(c => c.name || 'Untitled').slice(0, 8);
  const campaignData = _campaigns.slice(0, 8).map(c => recipientStats.find(x => x.id === c.id)?.sentCount || 0);
  const keys = recentDateKeys(7);
  const daily = Object.fromEntries(keys.map(key => [key, 0]));
  recipientStats.forEach(stat => stat.sentDates.forEach(date => { if (date in daily) daily[date] += 1; }));

  target.innerHTML = `
    <div class="analytics-stat-grid whatsapp-stat-grid">
      <div class="analytics-stat-card"><span>Campaigns</span><strong>${activeCampaigns}</strong><small>Total WhatsApp campaigns</small></div>
      <div class="analytics-stat-card"><span>Subscribed Recipients</span><strong>${subscribed}</strong><small>Current eligible customers</small></div>
      <div class="analytics-stat-card"><span>Messages Sent</span><strong>${sentTotal}</strong><small>Tracked campaign opens</small></div>
      <div class="analytics-stat-card"><span>Pending Audience</span><strong>${eligible}</strong><small>Available for outreach</small></div>
    </div>
    <div class="analytics-chart-grid">
      <div class="analytics-chart-card"><div class="analytics-chart-head"><h3>Messages by Campaign</h3><span>Top campaigns</span></div><div class="analytics-chart-canvas"><canvas id="whatsapp-campaign-chart"></canvas></div></div>
      <div class="analytics-chart-card"><div class="analytics-chart-head"><h3>Daily Sending Trend</h3><span>Last 7 days</span></div><div class="analytics-chart-canvas"><canvas id="whatsapp-daily-chart"></canvas></div></div>
      <div class="analytics-chart-card analytics-chart-wide"><div class="analytics-chart-head"><h3>WhatsApp Audience</h3><span>Current customer status</span></div><div class="analytics-chart-canvas analytics-doughnut"><canvas id="whatsapp-audience-chart"></canvas></div></div>
    </div>`;

  if (!ChartCtor) return;
  const common = chartDefaults();
  const campaign = new ChartCtor(document.getElementById('whatsapp-campaign-chart'), {
    type: 'bar', data: { labels: campaignLabels, datasets: [{ label: 'Messages Sent', data: campaignData, borderRadius: 8, maxBarThickness: 36 }] },
    options: { ...common, indexAxis: 'y' }
  });
  const dailyChart = new ChartCtor(document.getElementById('whatsapp-daily-chart'), {
    type: 'line', data: { labels: dayLabels(7), datasets: [{ label: 'Messages Sent', data: keys.map(k => daily[k]), tension: .35, fill: true, borderWidth: 2 }] }, options: common
  });
  const audience = new ChartCtor(document.getElementById('whatsapp-audience-chart'), {
    type: 'doughnut', data: { labels: ['Subscribed', 'Unsubscribed'], datasets: [{ data: [subscribed, _customers.length - subscribed], borderWidth: 0 }] },
    options: { ...common, cutout: '68%', plugins: { ...common.plugins, legend: { position: 'bottom', labels: { usePointStyle: true, color: '#64748b' } } } }
  });
  _whatsappCharts.push(campaign, dailyChart, audience);
}

function setImportStep(step, status = 'active') {
  document.querySelectorAll('#customer-import-progress .import-step').forEach(el => {
    const n = Number(el.dataset.step);
    el.classList.toggle('active', n === step && status === 'active');
    el.classList.toggle('complete', n < step || status === 'complete');
    el.classList.toggle('failed', n === step && status === 'failed');
  });
}

function updateImportProgress(step, label, percent, status = 'active') {
  const labelEl = document.getElementById('customer-import-progress-label');
  const percentEl = document.getElementById('customer-import-progress-percent');
  const fill = document.getElementById('customer-import-progress-fill');
  if (labelEl) labelEl.textContent = label;
  if (percentEl) percentEl.textContent = `${percent}%`;
  if (fill) fill.style.width = `${percent}%`;
  setImportStep(step, status);
}

function resetImportUI() {
  const progress = document.getElementById('customer-import-progress');
  const upload = document.getElementById('customer-import-dropzone');
  const info = document.getElementById('customer-import-file-info');
  const alert = document.getElementById('customer-import-alert');
  const result = document.getElementById('customer-import-result');
  const start = document.getElementById('customer-import-start');
  if (progress) progress.style.display = 'none';
  if (upload) upload.style.display = '';
  if (info) { info.style.display = 'none'; info.innerHTML = ''; }
  if (alert) { alert.style.display = 'none'; alert.textContent = ''; }
  if (result) result.innerHTML = '';
  if (start) { start.disabled = true; start.textContent = 'Upload & Create Customers'; }
  setImportStep(0, 'active');
}

export async function downloadCustomerTemplate() {
  // Keep one fixed, version-controlled template in the app so every user
  // downloads the same approved Excel format and security code.
  const templateUrl = new URL('assets/Abra_Zylo_Customer_Import_Template.xlsx', document.baseURI).href;
  try {
    const response = await fetch(templateUrl, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Template request failed: ${response.status}`);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Abra_Zylo_Customer_Import_Template.xlsx';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast('Default Excel template downloaded. Fill it and upload the same file format.');
  } catch (error) {
    // Local-file fallback: generate the same template if the static asset
    // cannot be fetched (for example when opening the HTML directly from disk).
    if (!window.XLSX) return showToast('The default Excel template could not be loaded. Please run the CRM from its web server.');
    const rows = Array.from({ length: CUSTOMER_IMPORT_MAX_ROWS }, () => ({
      'Name': '',
      'Mobile Number': '',
      'Security Code': CUSTOMER_IMPORT_SECURITY_KEY
    }));
    const ws = window.XLSX.utils.json_to_sheet(rows, { header: ['Name', 'Mobile Number', 'Security Code'] });
    ws['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 24 }];
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'Customers');
    window.XLSX.writeFile(wb, 'Abra_Zylo_Customer_Import_Template.xlsx');
    showToast('Default Excel template generated and downloaded.');
  }
}

export function showCustomerImport() {
  _customerImportFile = null;
  resetImportUI();
  const input = document.getElementById('customer-import-file');
  if (input) input.value = '';
  openModal('customer-import-modal');
}

export function hideCustomerImport() {
  _customerImportFile = null;
  closeModal('customer-import-modal');
}

export async function handleCustomerImportFile(file) {
  const alert = document.getElementById('customer-import-alert');
  if (alert) alert.style.display = 'none';
  if (!file) return;
  if (!window.XLSX) return showCustomerImportAlert('Excel reader is not loaded yet. Please try again.');
  if (!/\.(xlsx|xls)$/i.test(file.name)) return showCustomerImportAlert('Please upload an .xlsx or .xls Excel file.');
  _customerImportFile = file;
  const info = document.getElementById('customer-import-file-info');
  if (info) {
    info.innerHTML = `<strong>${escapeHtml(file.name)}</strong><span>${Math.round(file.size / 1024)} KB</span>`;
    info.style.display = 'flex';
  }
  const start = document.getElementById('customer-import-start');
  if (start) start.disabled = false;
}

function showCustomerImportAlert(message) {
  const alert = document.getElementById('customer-import-alert');
  if (!alert) return;
  alert.textContent = message;
  alert.className = 'alert alert-danger';
  alert.style.display = 'block';
}

function normalizeImportRow(row) {
  const name = cleanCustomerName(row['Name'] ?? row['name'] ?? '');
  const rawNumber = String(row['Mobile Number'] ?? row['Mobile'] ?? row['Number'] ?? row['number'] ?? '').trim();
  const numberDigits = rawNumber.replace(/\D/g, '');
  const securityCode = String(row['Security Code'] ?? row['security code'] ?? row['Security'] ?? '').trim();
  return { name, rawNumber, numberDigits, securityCode };
}

function parseCustomerWorkbook(file) {
  return file.arrayBuffer().then(buffer => {
    const workbook = window.XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames.find(name => name.toLowerCase() === 'customers') || workbook.SheetNames[0];
    if (!sheetName) throw new Error('The workbook does not contain a worksheet.');
    const rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '', raw: false });
    return rows;
  });
}

export async function startCustomerImport() {
  if (!_customerImportFile) return showCustomerImportAlert('Choose an Excel file first.');
  const start = document.getElementById('customer-import-start');
  const progress = document.getElementById('customer-import-progress');
  const upload = document.getElementById('customer-import-dropzone');
  const result = document.getElementById('customer-import-result');
  const alert = document.getElementById('customer-import-alert');
  if (start) start.disabled = true;
  if (upload) upload.style.display = 'none';
  if (progress) progress.style.display = 'block';
  if (alert) alert.style.display = 'none';
  if (result) result.innerHTML = '';

  try {
    updateImportProgress(1, 'Checking uploaded file', 15);
    await new Promise(resolve => setTimeout(resolve, 500));
    const rows = await parseCustomerWorkbook(_customerImportFile);
    // The default template intentionally contains the security code on every blank
    // row. Treat rows that contain only the approved security code as blank rows.
    // This lets users fill any number of rows without Excel's prepared rows being
    // mistaken for incomplete customers.
    const normalizedAllRows = rows.map((row, index) => ({ ...normalizeImportRow(row), excelRowNumber: index + 2 }));
    const populatedRows = normalizedAllRows.filter(row => {
      const hasCustomerFields = Boolean(row.name || row.numberDigits);
      const hasSecurityOnly = !hasCustomerFields && row.securityCode === CUSTOMER_IMPORT_SECURITY_KEY;
      return hasCustomerFields || (row.securityCode && !hasSecurityOnly);
    });
    if (!populatedRows.length) throw new Error('The Excel file has no customer data. Fill the template and upload it again.');
    if (populatedRows.length > CUSTOMER_IMPORT_MAX_ROWS) throw new Error(`Maximum ${CUSTOMER_IMPORT_MAX_ROWS} customer rows are allowed per upload.`);

    // Security remains a hard gate. Check every populated row BEFORE removing
    // invalid customer data, so a missing/wrong security code can never be
    // hidden inside an otherwise invalid row.
    const securityFailure = populatedRows.findIndex(row => row.securityCode !== CUSTOMER_IMPORT_SECURITY_KEY);
    if (securityFailure !== -1) {
      setImportStep(4, 'failed');
      throw new Error(`Security check failed on Excel row ${populatedRows[securityFailure].excelRowNumber}. The Security Code must be exactly "${CUSTOMER_IMPORT_SECURITY_KEY}".`);
    }

    // Invalid customer rows are deliberately skipped instead of rejecting the
    // entire workbook. Names and mobile numbers are the only customer-data
    // validation fields here. Blank template rows were already removed above.
    const invalidRows = populatedRows.filter(row => !row.name || !/^[6-9]\d{9}$/.test(row.numberDigits));
    const validRows = populatedRows.filter(row => row.name && /^[6-9]\d{9}$/.test(row.numberDigits));
    if (!validRows.length) throw new Error('No valid customer rows were found in the Excel file. Invalid rows were skipped.');

    updateImportProgress(2, 'Checking marketing duplicates', 35);
    await new Promise(resolve => setTimeout(resolve, 500));
    const latestCustomersSnap = await FB.getDocs(FB.query(FB.col(CUSTOMER_COLLECTION), FB.orderBy('addedAt', 'desc')));
    const latestCustomers = latestCustomersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const existingNumbers = new Set(latestCustomers.map(customer => normalizePhone(customer.number)).filter(Boolean));
    // Duplicate logic is based ONLY on normalized mobile number. Names are not
    // considered, so two customers with different names but the same mobile
    // number are still duplicates. Blank template rows are excluded.
    const seenNumbers = new Set();
    const duplicateNumbersInFile = new Set();
    const duplicateRowsInFile = [];
    const existingDuplicateRows = [];
    const candidates = [];
    validRows.forEach((row, index) => {
      const normalizedNumber = normalizePhone(row.numberDigits);
      const excelRowNumber = row.excelRowNumber;
      if (seenNumbers.has(normalizedNumber)) {
        duplicateNumbersInFile.add(normalizedNumber);
        duplicateRowsInFile.push(excelRowNumber);
        return;
      }
      seenNumbers.add(normalizedNumber);
      if (existingNumbers.has(normalizedNumber)) {
        existingDuplicateRows.push(excelRowNumber);
        return;
      }
      candidates.push({ ...row, normalizedNumber });
    });

    updateImportProgress(3, 'Creating new customers', 55);
    await new Promise(resolve => setTimeout(resolve, 450));
    if (result) result.innerHTML = `<div class="import-result-line"><span>Valid rows</span><strong>${validRows.length}</strong></div><div class="import-result-line"><span>Invalid rows skipped</span><strong>${invalidRows.length}</strong></div><div class="import-result-line"><span>Duplicate numbers in file</span><strong>${duplicateNumbersInFile.size}</strong></div><div class="import-result-line"><span>Duplicate rows in file</span><strong>${duplicateRowsInFile.length}</strong></div><div class="import-result-line"><span>Existing customer duplicates</span><strong>${existingDuplicateRows.length}</strong></div>`;

    updateImportProgress(4, 'Checking security rules', 78);
    await new Promise(resolve => setTimeout(resolve, 500));
    // Security was fully validated before this point, so no write can happen
    // unless every customer row contains the exact approved code.

    const meta = currentUserMeta();
    const batches = [];
    let batch = FB.writeBatch();
    let batchSize = 0;
    for (const row of candidates) {
      const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      batch.set(FB.docRef(CUSTOMER_COLLECTION, id), {
        name: row.name,
        number: `${row.numberDigits.slice(0, 5)} ${row.numberDigits.slice(5)}`,
        normalizedNumber: row.normalizedNumber,
        status: 'interested',
        addedAt: FB.serverTimestamp(),
        addedBy: meta.uid,
        addedByName: meta.name,
        addedByEmail: meta.email,
        importedFrom: _customerImportFile.name
      });
      batchSize += 1;
      if (batchSize === 450) {
        batches.push(batch.commit());
        batch = FB.writeBatch();
        batchSize = 0;
      }
    }
    if (batchSize) batches.push(batch.commit());
    await Promise.all(batches);
    updateImportProgress(4, 'Security verified • Import complete', 100, 'complete');
    const totalDuplicateRows = duplicateRowsInFile.length + existingDuplicateRows.length;
    if (result) result.innerHTML = `<div class="import-result-success"><strong>Import completed successfully.</strong><span>${candidates.length} new customers created${totalDuplicateRows ? `, ${totalDuplicateRows} duplicate rows skipped` : ''}${invalidRows.length ? `, ${invalidRows.length} invalid rows skipped` : ''}.</span>${duplicateNumbersInFile.size ? `<span>${duplicateNumbersInFile.size} duplicate mobile number${duplicateNumbersInFile.size === 1 ? '' : 's'} found inside this file.</span>` : ''}</div>`;
    if (start) start.textContent = 'Import Complete';
    showToast(`${candidates.length} new customers imported.`);
    await renderCustomers();
  } catch (error) {
    console.error('[Customers] Excel import error:', error);
    updateImportProgress(4, 'Import rejected', 100, 'failed');
    showCustomerImportAlert(error?.message || 'Unable to import the Excel file.');
    if (start) { start.disabled = false; start.textContent = 'Try Again'; }
  }
}

function renderLoading(targetId, text = 'Loading...') {
  const target = document.getElementById(targetId);
  if (target) target.innerHTML = `<div class="empty-state"><div class="empty-icon">⏳</div><h3>${escapeHtml(text)}</h3></div>`;
}

function friendlyFirestoreError(error, fallback) {
  if (error?.code === 'permission-denied') {
    return 'Firebase permissions are blocking this feature. merge the included Firestore rules snippet for the Abra Zylo Firebase project, then reload the app.';
  }
  if (error?.code === 'failed-precondition') {
    return 'Firestore needs an index for this query. Create the suggested index in Firebase Console, then reload the app.';
  }
  return error?.message || fallback;
}

export async function renderCustomers() {
  renderLoading('customers-table-wrap', 'Loading customers...');
  try {
    const snap = await FB.getDocs(FB.query(FB.col(CUSTOMER_COLLECTION), FB.orderBy('addedAt', 'desc')));
    _customers = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderCustomerAnalytics();
    renderCustomersTable();
  } catch (error) {
    console.error('[Customers] load error:', error);
    const target = document.getElementById('customers-table-wrap');
    if (target) target.innerHTML = `<div class="alert alert-danger">Unable to load customers. ${escapeHtml(friendlyFirestoreError(error, 'Unable to complete this request.'))}</div>`;
  }
}

function getFilteredCustomers() {
  const query = _customerSearch.trim().toLowerCase();
  const digitsQuery = query.replace(/\D/g, '');

  if (!query) return _customers;

  return _customers.filter(customer => {
    const name = displayCustomerName(customer).toLowerCase();
    const number = String(customer.number || '').toLowerCase();
    const normalized = normalizePhone(customer.number);

    return (
      name.includes(query) ||
      number.includes(query) ||
      (digitsQuery && normalized.includes(digitsQuery))
    );
  });
}

function renderCustomerTableRows(filtered) {
  const tbody = document.getElementById('customers-table-body');
  const count = document.getElementById('customer-result-count');
  if (!tbody) return;

  if (count) {
    count.textContent = `Showing ${filtered.length} of ${_customers.length} customers`;
  }

  tbody.innerHTML = filtered.length
    ? filtered.map((customer, index) => {
        const status = customerStatus(customer);
        const name = displayCustomerName(customer);
        return `<tr>
          <td>${index + 1}</td>
          <td>${formatDate(customer.addedAt)}</td>
          <td><strong>${escapeHtml(name)}</strong></td>
          <td>${escapeHtml(formatPhoneDisplay(customer.number))}</td>
          <td>${escapeHtml(customer.gender ? customer.gender.charAt(0).toUpperCase() + customer.gender.slice(1) : '-')}</td>
          <td>${escapeHtml(customer.addedByName || customer.addedByEmail || 'Unknown')}</td>
          <td>
            <select class="customer-status-select ${status === 'interested' ? 'status-subscribed' : 'status-unsubscribed'}" onchange="window.Customers.updateStatus('${customer.id}', this.value)">
              <option value="interested" ${status === 'interested' ? 'selected' : ''}>Subscribed</option>
              <option value="not-interested" ${status === 'not-interested' ? 'selected' : ''}>Unsubscribed</option>
            </select>
          </td>
          <td>${isAdmin() ? `<button class="btn btn-danger btn-sm" onclick="window.Customers.deleteCustomer('${customer.id}')">Delete</button>` : '<span class="text-muted">Admin only</span>'}</td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="8" class="customer-no-results">No customers found for this search.</td></tr>';
}

function renderCustomersTable() {
  const target = document.getElementById('customers-table-wrap');
  if (!target) return;

  if (!_customers.length) {
    target.innerHTML = '<div class="empty-state"><div class="empty-icon">👥</div><h3>No customers added yet</h3><p>Add your first customer to start WhatsApp marketing.</p></div>';
    return;
  }

  // Build the search input only when the customer table is first rendered.
  // Replacing the input on every keystroke causes the cursor/focus to jump,
  // which makes live search feel like it needs an extra click.
  if (!document.getElementById('customer-universal-search')) {
    target.innerHTML = `
      <div class="customer-directory-toolbar">
        <div class="customer-search-box">
          <span class="customer-search-icon">⌕</span>
          <input type="search" id="customer-universal-search" placeholder="Search by name or number..." autocomplete="off">
        </div>
        <span class="customer-result-count" id="customer-result-count"></span>
      </div>
      <div class="data-table-wrap customer-table-wrap">
        <table class="data-table customers-table">
          <thead><tr><th>Sl No</th><th>Added Date</th><th>Name</th><th>Number</th><th>Gender</th><th>Added By</th><th>Subscription</th><th>Delete</th></tr></thead>
          <tbody id="customers-table-body"></tbody>
        </table>
      </div>`;

    const searchInput = document.getElementById('customer-universal-search');
    searchInput?.addEventListener('input', event => {
      _customerSearch = event.target.value;
      renderCustomerTableRows(getFilteredCustomers());
    });
  }

  const searchInput = document.getElementById('customer-universal-search');
  if (searchInput && searchInput.value !== _customerSearch) {
    searchInput.value = _customerSearch;
  }

  renderCustomerTableRows(getFilteredCustomers());
}

export function searchCustomers(value) {
  _customerSearch = String(value || '');
  renderCustomersTable();
  const input = document.getElementById('customer-universal-search');
  if (input && input.value !== _customerSearch) {
    input.value = _customerSearch;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
}

export function showAddCustomer() {
  const form = document.getElementById('customer-form');
  if (form) form.reset();
  const gender = document.getElementById('customer-gender');
  if (gender) gender.value = '';
  const alert = document.getElementById('customer-alert');
  if (alert) alert.style.display = 'none';
  openModal('customer-modal');
  const numberInput = document.getElementById('customer-number');
  if (numberInput) {
    numberInput.setAttribute('maxlength', '11');
    numberInput.setAttribute('inputmode', 'numeric');
    numberInput.setAttribute('type', 'tel');
    if (!numberInput.dataset.customerNumberHandler) {
      numberInput.addEventListener('input', handleCustomerNumberInput);
      numberInput.dataset.customerNumberHandler = 'true';
    }
  }
  document.getElementById('customer-name')?.focus();
}

function handleCustomerNumberInput(event) {
  const input = event.target;
  const digits = input.value.replace(/\D/g, '').slice(0, 10);
  input.value = digits.length > 5 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : digits;
}

export function hideCustomerModal() {
  closeModal('customer-modal');
}

export async function saveCustomer(event) {
  event?.preventDefault();
  const name = cleanCustomerName(document.getElementById('customer-name')?.value || '');
  const number = document.getElementById('customer-number')?.value.trim() || '';
  const gender = normalizeGender(document.getElementById('customer-gender')?.value);
  const alert = document.getElementById('customer-alert');

  const numberDigits = number.replace(/\D/g, '');

  if (!name) return showCustomerAlert(alert, 'Please enter the customer name.');
  if (!/^\d{10}$/.test(numberDigits) || !/^[6-9]\d{9}$/.test(numberDigits)) {
    return showCustomerAlert(alert, 'Mobile number must be exactly 10 digits and start with 6, 7, 8, or 9.');
  }
  if (!gender) return showCustomerAlert(alert, 'Please select the customer gender.');

  const button = document.querySelector('#customer-form button[type="submit"]');
  if (button) { button.disabled = true; button.textContent = 'Checking...'; }

  try {
    // Refresh the directory before checking so a customer added by another
    // team member is also considered. This catches both old records and the
    // normalizedNumber field used by new records.
    const latestCustomersSnap = await FB.getDocs(FB.query(FB.col(CUSTOMER_COLLECTION), FB.orderBy('addedAt', 'desc')));
    _customers = latestCustomersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Prevent duplicate customers by comparing normalized WhatsApp numbers.
    // This catches older records that were created before normalizedNumber
    // was introduced as well as all newly-created customer records.
    const normalizedNumber = normalizePhone(number);
    const duplicate = _customers.find(customer => normalizePhone(customer.number) === normalizedNumber);
    if (duplicate) {
      showCustomerAlert(alert, `This number is already added for ${displayCustomerName(duplicate) || 'an existing customer'}. Please use a different number.`);
      return;
    }

    const meta = currentUserMeta();
    if (button) button.textContent = 'Adding...';
    await FB.addDoc(FB.col(CUSTOMER_COLLECTION), {
      name,
      number: `${numberDigits.slice(0, 5)} ${numberDigits.slice(5)}`,
      normalizedNumber,
      gender,
      status: 'interested',
      addedAt: FB.serverTimestamp(),
      addedBy: meta.uid,
      addedByName: meta.name,
      addedByEmail: meta.email
    });
    hideCustomerModal();
    showToast('Customer added successfully.');
    await renderCustomers();
  } catch (error) {
    console.error('[Customers] save error:', error);
    showCustomerAlert(alert, `Could not add customer: ${friendlyFirestoreError(error, 'Unknown error')}`);
  } finally {
    if (button) { button.disabled = false; button.textContent = 'Add Customer'; }
  }
}

function showCustomerAlert(alert, message) {
  if (!alert) return;
  alert.textContent = message;
  alert.className = 'alert alert-danger';
  alert.style.display = 'block';
}

export async function updateStatus(customerId, status) {
  if (!['interested', 'not-interested'].includes(status)) return;
  const customer = _customers.find(item => item.id === customerId);
  if (!customer) return;
  try {
    await FB.updateDoc(FB.docRef(CUSTOMER_COLLECTION, customerId), {
      status,
      updatedAt: FB.serverTimestamp(),
      updatedBy: currentUserMeta().uid,
      updatedByName: currentUserMeta().name
    });
    customer.status = status;
    renderCustomerAnalytics();
    renderCustomersTable();
    showToast(status === 'interested' ? 'Customer subscribed.' : 'Customer unsubscribed.');
    if (_activeCampaign) renderCampaignRecipients();
  } catch (error) {
    console.error('[Customers] status update error:', error);
    showToast('Unable to update customer status.');
    renderCustomersTable();
  }
}

export async function deleteCustomer(customerId) {
  if (!isAdmin()) return showToast('Only admin can delete customers.');
  const customer = _customers.find(item => item.id === customerId);
  if (!customer) return;
  if (!window.confirm(`Delete ${customer.name || 'this customer'}? This cannot be undone.`)) return;
  try {
    await FB.deleteDoc(FB.docRef(CUSTOMER_COLLECTION, customerId));
    _customers = _customers.filter(item => item.id !== customerId);
    renderCustomerAnalytics();
    renderCustomersTable();
    if (_activeCampaign) renderCampaignRecipients();
    showToast('Customer deleted.');
  } catch (error) {
    console.error('[Customers] delete error:', error);
    showToast('Unable to delete customer.');
  }
}

export async function renderWhatsappMarketing() {
  renderLoading('whatsapp-campaigns-wrap', 'Loading WhatsApp campaigns...');
  try {
    const snap = await FB.getDocs(FB.query(FB.col(CAMPAIGN_COLLECTION), FB.orderBy('createdAt', 'desc')));
    _campaigns = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    try {
      const customerSnap = await FB.getDocs(FB.query(FB.col(CUSTOMER_COLLECTION), FB.orderBy('addedAt', 'desc')));
      _customers = customerSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (customerError) {
      console.warn('[WhatsApp] customer analytics refresh failed:', customerError);
    }
    let recipientStats = [];
    try {
      recipientStats = await Promise.all(_campaigns.map(async campaign => {
        const recipientSnap = await FB.getDocs(FB.col(`${CAMPAIGN_COLLECTION}/${campaign.id}/recipients`));
        return {
          id: campaign.id,
          sentCount: recipientSnap.size,
          sentDates: recipientSnap.docs.map(doc => dayKey(doc.data().sentAt)).filter(Boolean)
        };
      }));
    } catch (chartError) {
      console.warn('[WhatsApp] analytics recipient stats unavailable:', chartError);
    }
    renderWhatsappAnalytics(recipientStats);
    renderCampaigns();
  } catch (error) {
    console.error('[WhatsApp] campaign load error:', error);
    const target = document.getElementById('whatsapp-campaigns-wrap');
    if (target) target.innerHTML = `<div class="alert alert-danger">Unable to load campaigns. ${escapeHtml(friendlyFirestoreError(error, 'Unable to complete this request.'))}</div>`;
  }
}

function renderCampaigns() {
  const target = document.getElementById('whatsapp-campaigns-wrap');
  if (!target) return;
  if (!_campaigns.length) {
    target.innerHTML = '<div class="empty-state"><div class="empty-icon">💬</div><h3>No WhatsApp campaigns yet</h3><p>Create a campaign to start sending prefilled WhatsApp messages.</p></div>';
    return;
  }
  target.innerHTML = `
    <div class="campaign-list-grid">
      ${_campaigns.map(campaign => `<div class="whatsapp-campaign-card">
        <div class="campaign-card-head"><div><h3>${escapeHtml(campaign.name || 'Untitled Campaign')}</h3><p>${formatDate(campaign.createdAt)} • ${escapeHtml((campaign.gender || 'all').toUpperCase())}</p></div><span class="campaign-live-pill">${escapeHtml(campaign.gender || 'all')}</span></div>
        <p class="campaign-message-preview">${escapeHtml(campaign.message || '')}</p>
        <div class="campaign-card-meta"><span>URL: ${escapeHtml(campaign.url || '-')}</span></div>
        <div class="campaign-card-actions">
          <button class="btn btn-accent btn-full" onclick="window.Customers.openWhatsappCampaign('${campaign.id}')">Open Campaign</button>
          <button class="btn btn-outline btn-sm" onclick="window.Customers.editWhatsappCampaign('${campaign.id}')">Edit</button>
          ${isAdmin() ? `<button class="btn btn-danger btn-sm" onclick="window.Customers.deleteWhatsappCampaign('${campaign.id}')">Delete</button>` : ''}
        </div>
      </div>`).join('')}
    </div>`;
}

export function showCreateWhatsappCampaign() {
  _editingCampaignId = null;
  const form = document.getElementById('whatsapp-campaign-form');
  if (form) form.reset();
  const message = document.getElementById('whatsapp-campaign-message');
  if (message) message.value = DEFAULT_MESSAGE;
  const gender = document.getElementById('whatsapp-campaign-gender');
  if (gender) gender.value = 'all';
  const title = document.getElementById('whatsapp-campaign-modal-title');
  if (title) title.textContent = 'Create WhatsApp Marketing';
  const submit = document.querySelector('#whatsapp-campaign-form button[type="submit"]');
  if (submit) submit.textContent = 'Create Campaign';
  const alert = document.getElementById('whatsapp-campaign-alert');
  if (alert) alert.style.display = 'none';
  openModal('whatsapp-campaign-modal');
  document.getElementById('whatsapp-campaign-name')?.focus();
}

export function editWhatsappCampaign(campaignId) {
  const campaign = _campaigns.find(item => item.id === campaignId);
  if (!campaign) return showToast('Campaign not found.');

  _editingCampaignId = campaignId;
  document.getElementById('whatsapp-campaign-name').value = campaign.name || '';
  document.getElementById('whatsapp-campaign-message').value = campaign.message || DEFAULT_MESSAGE;
  document.getElementById('whatsapp-campaign-url').value = campaign.url || '';
  document.getElementById('whatsapp-campaign-gender').value = ['male', 'female', 'all'].includes(campaign.gender) ? campaign.gender : 'all';

  const title = document.getElementById('whatsapp-campaign-modal-title');
  if (title) title.textContent = 'Edit WhatsApp Marketing';
  const submit = document.querySelector('#whatsapp-campaign-form button[type="submit"]');
  if (submit) submit.textContent = 'Save Changes';
  const alert = document.getElementById('whatsapp-campaign-alert');
  if (alert) alert.style.display = 'none';
  openModal('whatsapp-campaign-modal');
  document.getElementById('whatsapp-campaign-name')?.focus();
}

export function hideWhatsappCampaignModal() {
  closeModal('whatsapp-campaign-modal');
  _editingCampaignId = null;
}

export async function saveWhatsappCampaign(event) {
  event?.preventDefault();
  const name = document.getElementById('whatsapp-campaign-name')?.value.trim() || '';
  const message = document.getElementById('whatsapp-campaign-message')?.value.trim() || '';
  const url = document.getElementById('whatsapp-campaign-url')?.value.trim() || '';
  const gender = document.getElementById('whatsapp-campaign-gender')?.value || 'all';
  const alert = document.getElementById('whatsapp-campaign-alert');

  if (!name) return showWhatsappAlert(alert, 'Please enter a campaign name.');
  if (!message) return showWhatsappAlert(alert, 'Please enter the WhatsApp message.');
  if (!url) return showWhatsappAlert(alert, 'Please enter the sale URL.');
  if (!['male', 'female', 'all'].includes(gender)) return showWhatsappAlert(alert, 'Please select a gender.');

  const button = document.querySelector('#whatsapp-campaign-form button[type="submit"]');
  const editingId = _editingCampaignId;
  const isEditing = Boolean(editingId);
  if (button) { button.disabled = true; button.textContent = isEditing ? 'Saving...' : 'Creating...'; }

  try {
    const meta = currentUserMeta();
    if (isEditing) {
      await FB.updateDoc(FB.docRef(CAMPAIGN_COLLECTION, editingId), {
        name,
        message,
        url,
        gender,
        updatedAt: FB.serverTimestamp(),
        updatedBy: meta.uid,
        updatedByName: meta.name,
        updatedByEmail: meta.email
      });
      const index = _campaigns.findIndex(item => item.id === editingId);
      if (index >= 0) _campaigns[index] = { ..._campaigns[index], name, message, url, gender };
      if (_activeCampaign?.id === editingId) {
        _activeCampaign = { ..._activeCampaign, name, message, url, gender };
      }
      hideWhatsappCampaignModal();
      await renderWhatsappMarketing();
      showToast('WhatsApp campaign updated.');
      if (_activeCampaign?.id === editingId) renderWhatsappCampaignDetail();
    } else {
      const ref = await FB.addDoc(FB.col(CAMPAIGN_COLLECTION), {
        name,
        message,
        url,
        gender,
        createdAt: FB.serverTimestamp(),
        createdBy: meta.uid,
        createdByName: meta.name,
        createdByEmail: meta.email
      });
      hideWhatsappCampaignModal();
      await renderWhatsappMarketing();
      showToast('WhatsApp campaign created.');
      if (window.confirm('Campaign created. Open it now?')) {
        await openWhatsappCampaign(ref.id);
      }
    }
  } catch (error) {
    console.error(`[WhatsApp] ${isEditing ? 'update' : 'create'} error:`, error);
    showWhatsappAlert(alert, `Could not ${isEditing ? 'update' : 'create'} campaign: ${friendlyFirestoreError(error, 'Unknown error')}`);
  } finally {
    if (button) { button.disabled = false; button.textContent = isEditing ? 'Save Changes' : 'Create Campaign'; }
  }
}

export async function deleteWhatsappCampaign(campaignId) {
  if (!isAdmin()) return showToast('Only admin can delete WhatsApp campaigns.');
  const campaign = _campaigns.find(item => item.id === campaignId);
  if (!campaign) return;
  if (!window.confirm(`Delete "${campaign.name || 'this campaign'}"? Its sent-status records will also be deleted.`)) return;

  try {
    // Clean up the campaign's recipient subcollection before deleting the parent.
    // Firestore does not automatically cascade-delete subcollections.
    const recipientsSnap = await FB.getDocs(FB.col(`${CAMPAIGN_COLLECTION}/${campaignId}/recipients`));
    const docs = recipientsSnap.docs;
    for (let i = 0; i < docs.length; i += 400) {
      const batch = FB.writeBatch();
      docs.slice(i, i + 400).forEach(docSnap => batch.delete(docSnap.ref));
      await batch.commit();
    }

    await FB.deleteDoc(FB.docRef(CAMPAIGN_COLLECTION, campaignId));
    _campaigns = _campaigns.filter(item => item.id !== campaignId);
    if (_activeCampaign?.id === campaignId) {
      _activeCampaign = null;
      _campaignSent = new Set();
      window.App.go('whatsapp-marketing');
    } else {
      renderCampaigns();
    }
    showToast('WhatsApp campaign deleted.');
  } catch (error) {
    console.error('[WhatsApp] delete error:', error);
    showToast(`Unable to delete campaign: ${friendlyFirestoreError(error, 'Unknown error')}`);
  }
}

function showWhatsappAlert(alert, message) {
  if (!alert) return;
  alert.textContent = message;
  alert.className = 'alert alert-danger';
  alert.style.display = 'block';
}

export async function openWhatsappCampaign(campaignId) {
  const campaign = _campaigns.find(item => item.id === campaignId);
  if (!campaign) return;
  _activeCampaign = campaign;
  _campaignSent = new Set();
  _campaignSentBy = new Map();
  window.App.go('whatsapp-campaign-detail');
  await loadCampaignSentStatuses(campaignId);
  renderWhatsappCampaignDetail();
}

async function loadCampaignSentStatuses(campaignId) {
  try {
    const snap = await FB.getDocs(FB.col(`${CAMPAIGN_COLLECTION}/${campaignId}/recipients`));
    _campaignSent = new Set(snap.docs.map(doc => doc.id));
    _campaignSentBy = new Map(snap.docs.map(doc => [doc.id, doc.data().sentByName || doc.data().sentByEmail || 'Unknown']));
  } catch (error) {
    console.error('[WhatsApp] sent status load error:', error);
    _campaignSent = new Set();
    _campaignSentBy = new Map();
  }
}

export async function renderWhatsappCampaignDetail() {
  if (!_activeCampaign) return;

  // Always refresh the customer directory when opening/rendering a campaign.
  // Customers can be added after the campaign was created, so relying on the
  // cached array would leave newly-added eligible customers out of the table.
  try {
    const snap = await FB.getDocs(FB.query(FB.col(CUSTOMER_COLLECTION), FB.orderBy('addedAt', 'desc')));
    _customers = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('[WhatsApp] customer refresh error:', error);
  }
  const name = document.getElementById('whatsapp-detail-name');
  const meta = document.getElementById('whatsapp-detail-meta');
  if (name) name.textContent = _activeCampaign.name || 'WhatsApp Campaign';
  if (meta) meta.textContent = `${(_activeCampaign.gender || 'all').toUpperCase()} • ${formatDate(_activeCampaign.createdAt)} • Only subscribed customers are shown`;
  renderCampaignRecipients();
}

function getCampaignRecipients() {
  if (!_activeCampaign) return [];
  return _customers.filter(customer => isSubscribed(customer) && genderMatches(customer.gender, _activeCampaign.gender || 'all'));
}

function buildPersonalizedMessage(customer) {
  const customerName = displayCustomerName(customer);
  return String(_activeCampaign?.message || DEFAULT_MESSAGE)
    .replace(/\{\{name\}\}/gi, customerName)
    .replace(/\{\{URL\}\}/gi, _activeCampaign?.url || '');
}

function readWhatsappPacingStore() {
  try {
    const raw = localStorage.getItem(WHATSAPP_PACING_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.warn('[WhatsApp] pacing state read failed:', error);
    return {};
  }
}

function writeWhatsappPacingStore(store) {
  try {
    localStorage.setItem(WHATSAPP_PACING_STORAGE_KEY, JSON.stringify(store));
  } catch (error) {
    console.warn('[WhatsApp] pacing state write failed:', error);
  }
}

function getCampaignPacing() {
  if (!_activeCampaign?.id) return { batchCount: 0, cooldownUntil: 0 };
  const store = readWhatsappPacingStore();
  const state = store[_activeCampaign.id] || {};
  const batchCount = Math.max(0, Number(state.batchCount) || 0);
  const cooldownUntil = Math.max(0, Number(state.cooldownUntil) || 0);

  // A stale cooldown is cleared lazily so a reload cannot leave the campaign locked.
  if (cooldownUntil && cooldownUntil <= Date.now()) {
    delete store[_activeCampaign.id];
    writeWhatsappPacingStore(store);
    return { batchCount, cooldownUntil: 0 };
  }

  return { batchCount: Math.min(batchCount, WHATSAPP_BATCH_SIZE - 1), cooldownUntil };
}

function setCampaignPacing(nextState) {
  if (!_activeCampaign?.id) return;
  const store = readWhatsappPacingStore();
  store[_activeCampaign.id] = {
    batchCount: Math.max(0, Math.min(Number(nextState.batchCount) || 0, WHATSAPP_BATCH_SIZE - 1)),
    cooldownUntil: Math.max(0, Number(nextState.cooldownUntil) || 0)
  };
  writeWhatsappPacingStore(store);
}

function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function stopCampaignCooldownTimer() {
  if (_campaignCooldownTimer) {
    clearInterval(_campaignCooldownTimer);
    _campaignCooldownTimer = null;
  }
}

function updateCampaignPacingUI(pacing = getCampaignPacing()) {
  const title = document.getElementById('whatsapp-detail-name');
  const baseTitle = _activeCampaign?.name || 'WhatsApp Campaign';
  const cooldown = pacing.cooldownUntil > Date.now();

  if (title) {
    title.innerHTML = `${escapeHtml(baseTitle)}${cooldown ? ` <span class="whatsapp-cooldown-badge">Cooldown <span id="whatsapp-cooldown-countdown">${formatCountdown(pacing.cooldownUntil - Date.now())}</span></span>` : ''}`;
  }

  stopCampaignCooldownTimer();
  if (!cooldown) return;

  _campaignCooldownTimer = window.setInterval(() => {
    const current = getCampaignPacing();
    const remaining = current.cooldownUntil - Date.now();
    const countdown = document.getElementById('whatsapp-cooldown-countdown');

    if (remaining <= 0) {
      stopCampaignCooldownTimer();
      const store = readWhatsappPacingStore();
      if (_activeCampaign?.id) delete store[_activeCampaign.id];
      writeWhatsappPacingStore(store);
      renderCampaignRecipients();
      return;
    }

    if (countdown) countdown.textContent = formatCountdown(remaining);
  }, 1000);
}

function renderCampaignRecipients() {
  const target = document.getElementById('whatsapp-recipients-wrap');
  if (!target || !_activeCampaign) return;
  const previousScrollTop = target.querySelector('.whatsapp-table-wrap')?.scrollTop || 0;
  const recipients = getCampaignRecipients();
  const count = document.getElementById('whatsapp-recipient-count');
  if (count) count.textContent = `${recipients.length} subscribed recipient${recipients.length === 1 ? '' : 's'}`;

  const pacing = getCampaignPacing();
  updateCampaignPacingUI(pacing);

  if (!recipients.length) {
    target.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><h3>No eligible customers</h3><p>Customers who are marked Unsubscribed are automatically excluded from this campaign.</p></div>';
    return;
  }

  target.innerHTML = `
    <div class="data-table-wrap whatsapp-table-wrap">
      <table class="data-table whatsapp-table">
        <thead><tr><th>Sl No</th><th>Name</th><th>Number</th><th>Gender</th><th>WhatsApp</th><th>Sent Status</th><th>Sent By</th></tr></thead>
        <tbody>
          ${recipients.map((customer, index) => {
            const sent = _campaignSent.has(customer.id);
            const sentBy = _campaignSentBy.get(customer.id) || '-';
            const pacing = getCampaignPacing();
            const cooldown = pacing.cooldownUntil > Date.now();
            const buttonClass = cooldown ? 'btn btn-whatsapp btn-sm whatsapp-cooldown-btn' : 'btn btn-whatsapp btn-sm';
            const buttonText = cooldown ? 'Wait' : 'Open WhatsApp';
            const buttonDisabled = cooldown || sent;
            const phone = phoneForWhatsApp(customer.number);
            const message = buildPersonalizedMessage(customer);
            const whatsappUrl = phone
              ? `https://web.whatsapp.com/send?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(message)}`
              : '#';
            const actionControl = buttonDisabled
              ? `<button class="${buttonClass}" disabled>${buttonText}</button>`
              : `<a class="${buttonClass}" href="${whatsappUrl}" target="_blank" rel="noopener noreferrer" data-customer-id="${escapeHtml(String(customer.id))}" onclick="window.Customers.recordWhatsAppOpen(this.dataset.customerId)">${buttonText}</a>`;
            return `<tr>
              <td>${index + 1}</td>
              <td><strong>${escapeHtml(displayCustomerName(customer))}</strong></td>
              <td>${escapeHtml(formatPhoneDisplay(customer.number))}</td>
              <td>${escapeHtml(customer.gender ? customer.gender.charAt(0).toUpperCase() + customer.gender.slice(1) : '-')}</td>
              <td>${actionControl}</td>
              <td><span class="sent-status ${sent ? 'sent' : 'pending'}">${sent ? 'Sent' : 'Not Sent'}</span></td>
              <td>${escapeHtml(sentBy)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;

  const tableWrap = target.querySelector('.whatsapp-table-wrap');
  if (tableWrap) {
    requestAnimationFrame(() => {
      tableWrap.scrollTop = previousScrollTop;
    });
  }
}

export async function recordWhatsAppOpen(customerId) {
  if (!_activeCampaign) return;

  // The WhatsApp URL is now a real <a target="_blank"> link, so Chrome
  // handles the new tab directly from the user's click. This function only
  // records the campaign action after the browser has handled navigation.
  const pacing = getCampaignPacing();
  if (pacing.cooldownUntil > Date.now()) {
    showToast(`Please wait ${formatCountdown(pacing.cooldownUntil - Date.now())}.`);
    renderCampaignRecipients();
    return;
  }

  const customer = _customers.find(item => item.id === customerId);
  if (!customer || !isSubscribed(customer) || !genderMatches(customer.gender, _activeCampaign.gender || 'all')) {
    showToast('This customer is unsubscribed or no longer matches the campaign.');
    renderCampaignRecipients();
    return;
  }
  if (_campaignSent.has(customer.id) || _campaignSending.has(customer.id)) {
    showToast(_campaignSent.has(customer.id) ? 'Already sent for this campaign.' : 'Opening already recorded.');
    return;
  }

  const phone = phoneForWhatsApp(customer.number);
  if (!phone) {
    showToast('Customer number is invalid.');
    return;
  }

  _campaignSending.add(customer.id);
  const campaignTable = document.querySelector('.whatsapp-table-wrap');
  const campaignTableScrollTop = campaignTable?.scrollTop || 0;
  const pageScrollTop = window.scrollY || document.documentElement.scrollTop || 0;

  try {
    await FB.setDoc(FB.docRef(`${CAMPAIGN_COLLECTION}/${_activeCampaign.id}/recipients`, customer.id), {
      customerId: customer.id,
      customerName: displayCustomerName(customer),
      customerNumber: customer.number || '',
      sentAt: FB.serverTimestamp(),
      sentBy: currentUserMeta().uid,
      sentByName: currentUserMeta().name
    }, { merge: true });

    _campaignSent.add(customer.id);
    _campaignSentBy.set(customer.id, currentUserMeta().name);

    const nextCount = pacing.batchCount + 1;
    if (nextCount >= WHATSAPP_BATCH_SIZE) {
      setCampaignPacing({
        batchCount: 0,
        cooldownUntil: Date.now() + WHATSAPP_COOLDOWN_MS
      });
      showToast('10 completed. Cooldown started for 5 minutes.');
    } else {
      setCampaignPacing({
        batchCount: nextCount,
        cooldownUntil: 0
      });
    }

    renderCampaignRecipients();

    requestAnimationFrame(() => {
      const restoredTable = document.querySelector('.whatsapp-table-wrap');
      if (restoredTable) restoredTable.scrollTop = campaignTableScrollTop;
      window.scrollTo(0, pageScrollTop);
    });
  } catch (error) {
    console.error('[WhatsApp] sent status update error:', error);
    showToast('WhatsApp opened, but sent status could not be saved.');
  } finally {
    _campaignSending.delete(customer.id);
  }
}

// Keep the old function name available for any existing UI integrations.
// It now uses the same tracking path; the rendered campaign uses direct links
// so a browser popup blocker does not interfere with opening WhatsApp.
export async function openWhatsApp(customerId) {
  return recordWhatsAppOpen(customerId);
}

export function backToWhatsappMarketing() {
  stopCampaignCooldownTimer();
  _activeCampaign = null;
  _campaignSent = new Set();
  _campaignSentBy = new Map();
  _campaignSending = new Set();
  window.App.go('whatsapp-marketing');
}

export function getDefaultWhatsappMessage() {
  return DEFAULT_MESSAGE;
}