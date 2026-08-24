/**
 * customers.js - Customer details + WhatsApp marketing
 * Shared customer directory for approved Abra Zylo members/admins.
 */
import { FB } from './firebase.js';
import { getUser, getUserDoc, isAdmin } from './auth.js';
import { showToast } from './ui.js';
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
              <option value="interested" ${status === 'interested' ? 'selected' : ''}>Interested</option>
              <option value="not-interested" ${status === 'not-interested' ? 'selected' : ''}>Not Interested</option>
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
          <thead><tr><th>Sl No</th><th>Added Date</th><th>Name</th><th>Number</th><th>Gender</th><th>Added By</th><th>Sub / Unsub</th><th>Delete</th></tr></thead>
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
  document.getElementById('customer-modal').style.display = 'flex';
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
  document.getElementById('customer-modal').style.display = 'none';
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
  document.getElementById('whatsapp-campaign-modal').style.display = 'flex';
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
  document.getElementById('whatsapp-campaign-modal').style.display = 'flex';
  document.getElementById('whatsapp-campaign-name')?.focus();
}

export function hideWhatsappCampaignModal() {
  document.getElementById('whatsapp-campaign-modal').style.display = 'none';
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

function renderCampaignRecipients() {
  const target = document.getElementById('whatsapp-recipients-wrap');
  if (!target || !_activeCampaign) return;
  const previousScrollTop = target.querySelector('.whatsapp-table-wrap')?.scrollTop || 0;
  const recipients = getCampaignRecipients();
  const count = document.getElementById('whatsapp-recipient-count');
  if (count) count.textContent = `${recipients.length} subscribed recipient${recipients.length === 1 ? '' : 's'}`;

  if (!recipients.length) {
    target.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><h3>No eligible customers</h3><p>Customers who are marked Not Interested are automatically excluded from this campaign.</p></div>';
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
            return `<tr>
              <td>${index + 1}</td>
              <td><strong>${escapeHtml(displayCustomerName(customer))}</strong></td>
              <td>${escapeHtml(formatPhoneDisplay(customer.number))}</td>
              <td>${escapeHtml(customer.gender ? customer.gender.charAt(0).toUpperCase() + customer.gender.slice(1) : '-')}</td>
              <td><button class="btn btn-whatsapp btn-sm" onclick="window.Customers.openWhatsApp('${customer.id}')">Open WhatsApp</button></td>
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

export async function openWhatsApp(customerId) {
  if (!_activeCampaign) return;
  const customer = _customers.find(item => item.id === customerId);
  if (!customer || !isSubscribed(customer) || !genderMatches(customer.gender, _activeCampaign.gender || 'all')) {
    showToast('This customer is unsubscribed or no longer matches the campaign.');
    renderCampaignRecipients();
    return;
  }
  const phone = phoneForWhatsApp(customer.number);
  if (!phone) return showToast('Customer number is invalid.');
  const campaignTable = document.querySelector('.whatsapp-table-wrap');
  const campaignTableScrollTop = campaignTable?.scrollTop || 0;
  const pageScrollTop = window.scrollY || document.documentElement.scrollTop || 0;
  const message = buildPersonalizedMessage(customer);
  const url = `https://web.whatsapp.com/send?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(message)}`;

  // Open first so popup blockers are less likely to interfere, then mark as sent.
  window.open(url, '_blank', 'noopener,noreferrer');
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
    renderCampaignRecipients();

    requestAnimationFrame(() => {
      const restoredTable = document.querySelector('.whatsapp-table-wrap');
      if (restoredTable) restoredTable.scrollTop = campaignTableScrollTop;
      window.scrollTo(0, pageScrollTop);
    });
  } catch (error) {
    console.error('[WhatsApp] sent status update error:', error);
    showToast('WhatsApp opened, but sent status could not be saved.');
  }
}

export function backToWhatsappMarketing() {
  _activeCampaign = null;
  _campaignSent = new Set();
  _campaignSentBy = new Map();
  window.App.go('whatsapp-marketing');
}

export function getDefaultWhatsappMessage() {
  return DEFAULT_MESSAGE;
}
