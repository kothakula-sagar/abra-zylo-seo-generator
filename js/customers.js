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

const DEFAULT_MESSAGE =
  'Hi {{name}}, We at ABRA ZYLO having the sale live on all products with more discounts the shoping like is here {{URL}}. To unsubscribe reply "STOP".';

let _customers = [];
let _campaigns = [];
let _activeCampaign = null;
let _campaignSent = new Set();
let _campaignSentBy = new Map();
let _editingCampaignId = null;
let _customerSearch = '';


/* =========================================================
   USER INFORMATION
========================================================= */

function currentUserMeta() {
  const user = getUser();
  const doc = getUserDoc() || {};

  return {
    uid: user?.uid || '',
    email: user?.email || '',
    name:
      doc.name ||
      doc.displayName ||
      user?.displayName ||
      user?.email?.split('@')[0] ||
      'User'
  };
}


/* =========================================================
   DATE HELPERS
========================================================= */

function timestampValue(ts) {
  if (!ts) return 0;

  if (typeof ts === 'number') {
    return ts;
  }

  if (ts?.toDate) {
    return ts.toDate().getTime();
  }

  const value = new Date(ts).getTime();

  return Number.isNaN(value) ? 0 : value;
}


function formatDate(ts) {
  const value = timestampValue(ts);

  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}


/* =========================================================
   CUSTOMER NAME CLEANING
========================================================= */

/**
 * Removes:
 * - Emojis
 * - ~
 * - Numbers
 * - Special symbols
 * - Unwanted punctuation
 *
 * Keeps:
 * - Letters
 * - Spaces
 * - Apostrophe
 * - Hyphen
 *
 * Examples:
 *
 * ~Sagar Kothakula      -> Sagar Kothakula
 * 🔥Sagar Kothakula🔥   -> Sagar Kothakula
 * Sagar123              -> Sagar
 * @Sagar!!!             -> Sagar
 */
function cleanCustomerName(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[^\p{L}\p{M}\s'-]/gu, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s'-]+|[\s'-]+$/g, '')
    .trim();
}


/**
 * Returns a clean name for displaying.
 *
 * If the stored name is empty or becomes empty after cleaning,
 * "Buddy" is displayed.
 */
function displayCustomerName(customer) {
  const cleaned = cleanCustomerName(customer?.name);

  return cleaned || 'Buddy';
}


/* =========================================================
   GENDER
========================================================= */

function normalizeGender(value) {
  const gender = String(value || '')
    .trim()
    .toLowerCase();

  if (['male', 'female'].includes(gender)) {
    return gender;
  }

  return '';
}


/* =========================================================
   PHONE NUMBER
========================================================= */

function normalizePhone(value) {
  const raw = String(value || '').trim();

  const digits = raw.replace(/\D/g, '');

  if (!digits) {
    return '';
  }

  if (raw.startsWith('+')) {
    return `+${digits}`;
  }

  /*
   * Indian 10 digit number
   * Automatically normalize to 91XXXXXXXXXX
   */
  if (digits.length === 10) {
    return `91${digits}`;
  }

  return digits;
}


function phoneForWhatsApp(value) {
  return normalizePhone(value).replace(/^\+/, '');
}


/* =========================================================
   CUSTOMER STATUS
========================================================= */

function customerStatus(customer) {
  return customer?.status === 'not-interested'
    ? 'not-interested'
    : 'interested';
}


function isSubscribed(customer) {
  return customerStatus(customer) === 'interested';
}


/* =========================================================
   GENDER MATCHING
========================================================= */

function genderMatches(customerGender, campaignGender) {
  return (
    campaignGender === 'all' ||
    normalizeGender(customerGender) === campaignGender
  );
}


/* =========================================================
   LOADING
========================================================= */

function renderLoading(targetId, text = 'Loading...') {
  const target = document.getElementById(targetId);

  if (target) {
    target.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⏳</div>
        <h3>${escapeHtml(text)}</h3>
      </div>
    `;
  }
}


/* =========================================================
   FIRESTORE ERROR HANDLING
========================================================= */

function friendlyFirestoreError(error, fallback) {
  if (error?.code === 'permission-denied') {
    return 'Firebase permissions are blocking this feature. Please merge the updated Firestore rules for the Abra Zylo Firebase project and reload the app.';
  }

  if (error?.code === 'failed-precondition') {
    return 'Firestore needs an index for this query. Create the suggested index in Firebase Console, then reload the app.';
  }

  return error?.message || fallback;
}


/* =========================================================
   LOAD CUSTOMERS
========================================================= */

export async function renderCustomers() {
  renderLoading(
    'customers-table-wrap',
    'Loading customers...'
  );

  try {
    const snap = await FB.getDocs(
      FB.query(
        FB.col(CUSTOMER_COLLECTION),
        FB.orderBy('addedAt', 'desc')
      )
    );

    _customers = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    renderCustomersTable();

  } catch (error) {
    console.error('[Customers] load error:', error);

    const target = document.getElementById(
      'customers-table-wrap'
    );

    if (target) {
      target.innerHTML = `
        <div class="alert alert-danger">
          Unable to load customers.
          ${escapeHtml(
            friendlyFirestoreError(
              error,
              'Unable to complete this request.'
            )
          )}
        </div>
      `;
    }
  }
}


/* =========================================================
   CUSTOMER SEARCH
========================================================= */

function getFilteredCustomers() {
  const query = _customerSearch
    .trim()
    .toLowerCase();

  const digitsQuery = query.replace(/\D/g, '');

  if (!query) {
    return _customers;
  }

  return _customers.filter(customer => {
    const name = displayCustomerName(customer)
      .toLowerCase();

    const number = String(
      customer.number || ''
    ).toLowerCase();

    const normalized = normalizePhone(
      customer.number
    );

    return (
      name.includes(query) ||
      number.includes(query) ||
      (
        digitsQuery &&
        normalized.includes(digitsQuery)
      )
    );
  });
}


/* =========================================================
   CUSTOMER TABLE ROWS
========================================================= */

function renderCustomerTableRows(filtered) {
  const tbody = document.getElementById(
    'customers-table-body'
  );

  const count = document.getElementById(
    'customer-result-count'
  );

  if (!tbody) {
    return;
  }

  if (count) {
    count.textContent =
      `Showing ${filtered.length} of ${_customers.length} customers`;
  }

  tbody.innerHTML = filtered.length
    ? filtered
        .map((customer, index) => {
          const status = customerStatus(customer);

          const name = displayCustomerName(
            customer
          );

          const gender =
            customer.gender
              ? customer.gender.charAt(0).toUpperCase() +
                customer.gender.slice(1)
              : '-';

          const addedBy =
            customer.addedByName ||
            customer.addedByEmail ||
            'Unknown';

          return `
            <tr>

              <td>
                ${index + 1}
              </td>

              <td>
                ${formatDate(customer.addedAt)}
              </td>

              <td>
                <strong>
                  ${escapeHtml(name)}
                </strong>
              </td>

              <td>
                ${escapeHtml(
                  customer.number || '-'
                )}
              </td>

              <td>
                ${escapeHtml(gender)}
              </td>

              <td>
                ${escapeHtml(addedBy)}
              </td>

              <td>

                <select
                  class="customer-status-select ${
                    status === 'interested'
                      ? 'status-subscribed'
                      : 'status-unsubscribed'
                  }"
                  onchange="window.Customers.updateStatus('${customer.id}', this.value)"
                >

                  <option
                    value="interested"
                    ${
                      status === 'interested'
                        ? 'selected'
                        : ''
                    }
                  >
                    Interested
                  </option>

                  <option
                    value="not-interested"
                    ${
                      status === 'not-interested'
                        ? 'selected'
                        : ''
                    }
                  >
                    Not Interested
                  </option>

                </select>

              </td>

              <td>

                ${
                  isAdmin()
                    ? `
                      <button
                        class="btn btn-danger btn-sm"
                        onclick="window.Customers.deleteCustomer('${customer.id}')"
                      >
                        Delete
                      </button>
                    `
                    : `
                      <span class="text-muted">
                        Admin only
                      </span>
                    `
                }

              </td>

            </tr>
          `;
        })
        .join('')
    : `
      <tr>
        <td
          colspan="8"
          class="customer-no-results"
        >
          No customers found for this search.
        </td>
      </tr>
    `;
}


/* =========================================================
   CUSTOMER TABLE
========================================================= */

function renderCustomersTable() {
  const target = document.getElementById(
    'customers-table-wrap'
  );

  if (!target) {
    return;
  }

  /*
   * If there are no customers, show empty state.
   */
  if (!_customers.length) {
    target.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">👥</div>

        <h3>
          No customers added yet
        </h3>

        <p>
          Add your first customer to start WhatsApp marketing.
        </p>
      </div>
    `;

    return;
  }

  /*
   * IMPORTANT:
   *
   * Do NOT recreate the search input on every keystroke.
   *
   * Recreating it causes:
   *
   * 9
   * click
   * 3
   * click
   * 8
   * click
   *
   * The search input is created only once.
   */
  if (
    !document.getElementById(
      'customer-universal-search'
    )
  ) {
    target.innerHTML = `
      <div class="customer-directory-toolbar">

        <div class="customer-search-box">

          <span class="customer-search-icon">
            ⌕
          </span>

          <input
            type="search"
            id="customer-universal-search"
            placeholder="Search by name or number..."
            autocomplete="off"
          >

        </div>

        <span
          class="customer-result-count"
          id="customer-result-count"
        ></span>

      </div>

      <div class="data-table-wrap customer-table-wrap">

        <table class="data-table customers-table">

          <thead>

            <tr>
              <th>Sl No</th>
              <th>Added Date</th>
              <th>Name</th>
              <th>Number</th>
              <th>Gender</th>
              <th>Added By</th>
              <th>Sub / Unsub</th>
              <th>Delete</th>
            </tr>

          </thead>

          <tbody id="customers-table-body"></tbody>

        </table>

      </div>
    `;

    const searchInput =
      document.getElementById(
        'customer-universal-search'
      );

    /*
     * LIVE SEARCH
     *
     * "input" fires immediately for:
     *
     * typing
     * deleting
     * paste
     * mobile keyboard
     *
     * No button required.
     */
    searchInput?.addEventListener(
      'input',
      event => {
        _customerSearch =
          event.target.value;

        renderCustomerTableRows(
          getFilteredCustomers()
        );
      }
    );
  }

  const searchInput =
    document.getElementById(
      'customer-universal-search'
    );

  if (
    searchInput &&
    searchInput.value !== _customerSearch
  ) {
    searchInput.value =
      _customerSearch;
  }

  renderCustomerTableRows(
    getFilteredCustomers()
  );
}


/* =========================================================
   EXTERNAL SEARCH FUNCTION
========================================================= */

export function searchCustomers(value) {
  _customerSearch =
    String(value || '');

  /*
   * Render only the rows.
   * Do not rebuild the entire search box.
   */
  const filtered =
    getFilteredCustomers();

  renderCustomerTableRows(
    filtered
  );

  const input =
    document.getElementById(
      'customer-universal-search'
    );

  if (
    input &&
    input.value !== _customerSearch
  ) {
    input.value =
      _customerSearch;

    input.focus();

    input.setSelectionRange(
      input.value.length,
      input.value.length
    );
  }
}


/* =========================================================
   ADD CUSTOMER MODAL
========================================================= */

export function showAddCustomer() {
  const form =
    document.getElementById(
      'customer-form'
    );

  if (form) {
    form.reset();
  }

  const gender =
    document.getElementById(
      'customer-gender'
    );

  if (gender) {
    gender.value = '';
  }

  const alert =
    document.getElementById(
      'customer-alert'
    );

  if (alert) {
    alert.style.display = 'none';
  }

  const modal =
    document.getElementById(
      'customer-modal'
    );

  if (modal) {
    modal.style.display = 'flex';
  }

  document
    .getElementById('customer-name')
    ?.focus();
}


export function hideCustomerModal() {
  const modal =
    document.getElementById(
      'customer-modal'
    );

  if (modal) {
    modal.style.display = 'none';
  }
}


/* =========================================================
   SAVE CUSTOMER
========================================================= */

export async function saveCustomer(event) {
  event?.preventDefault();

  /*
   * Clean name BEFORE saving.
   */
  const name =
    cleanCustomerName(
      document.getElementById(
        'customer-name'
      )?.value || ''
    );

  const number =
    document.getElementById(
      'customer-number'
    )?.value.trim() || '';

  const gender =
    normalizeGender(
      document.getElementById(
        'customer-gender'
      )?.value
    );

  const alert =
    document.getElementById(
      'customer-alert'
    );

  /*
   * Validation
   */
  if (!name) {
    return showCustomerAlert(
      alert,
      'Please enter the customer name.'
    );
  }

  if (
    !number ||
    normalizePhone(number).length < 10
  ) {
    return showCustomerAlert(
      alert,
      'Please enter a valid WhatsApp number.'
    );
  }

  if (!gender) {
    return showCustomerAlert(
      alert,
      'Please select the customer gender.'
    );
  }

  const button =
    document.querySelector(
      '#customer-form button[type="submit"]'
    );

  if (button) {
    button.disabled = true;
    button.textContent = 'Checking...';
  }

  try {

    /*
     * Refresh from Firestore before duplicate checking.
     *
     * This prevents:
     *
     * Member A adds number
     * Member B has old cached data
     * Member B adds same number
     *
     * The fresh Firestore list catches it.
     */
    const latestCustomersSnap =
      await FB.getDocs(
        FB.query(
          FB.col(CUSTOMER_COLLECTION),
          FB.orderBy(
            'addedAt',
            'desc'
          )
        )
      );

    _customers =
      latestCustomersSnap.docs.map(
        doc => ({
          id: doc.id,
          ...doc.data()
        })
      );

    /*
     * Normalize number before checking.
     */
    const normalizedNumber =
      normalizePhone(number);

    /*
     * Check every existing record.
     *
     * This works for:
     *
     * old records
     * new records
     * records without normalizedNumber
     */
    const duplicate =
      _customers.find(
        customer =>
          normalizePhone(
            customer.number
          ) === normalizedNumber
      );

    if (duplicate) {

      showCustomerAlert(
        alert,
        `This number is already added for ${displayCustomerName(
          duplicate
        )}. Please use a different number.`
      );

      return;
    }

    const meta =
      currentUserMeta();

    if (button) {
      button.textContent =
        'Adding...';
    }

    await FB.addDoc(
      FB.col(CUSTOMER_COLLECTION),
      {
        /*
         * Cleaned name.
         */
        name,

        /*
         * Keep original display number.
         */
        number,

        /*
         * Normalized number for future
         * duplicate checking.
         */
        normalizedNumber,

        gender,

        /*
         * New customers are subscribed
         * by default.
         */
        status: 'interested',

        addedAt:
          FB.serverTimestamp(),

        addedBy:
          meta.uid,

        addedByName:
          meta.name,

        addedByEmail:
          meta.email
      }
    );

    hideCustomerModal();

    showToast(
      'Customer added successfully.'
    );

    await renderCustomers();

  } catch (error) {

    console.error(
      '[Customers] save error:',
      error
    );

    showCustomerAlert(
      alert,
      `Could not add customer: ${friendlyFirestoreError(
        error,
        'Unknown error'
      )}`
    );

  } finally {

    if (button) {
      button.disabled = false;
      button.textContent =
        'Add Customer';
    }
  }
}


/* =========================================================
   CUSTOMER ALERT
========================================================= */

function showCustomerAlert(
  alert,
  message
) {
  if (!alert) {
    return;
  }

  alert.textContent =
    message;

  alert.className =
    'alert alert-danger';

  alert.style.display =
    'block';
}


/* =========================================================
   UPDATE CUSTOMER STATUS
========================================================= */

export async function updateStatus(
  customerId,
  status
) {
  if (
    ![
      'interested',
      'not-interested'
    ].includes(status)
  ) {
    return;
  }

  const customer =
    _customers.find(
      item =>
        item.id === customerId
    );

  if (!customer) {
    return;
  }

  try {

    const meta =
      currentUserMeta();

    await FB.updateDoc(
      FB.docRef(
        CUSTOMER_COLLECTION,
        customerId
      ),
      {
        status,

        updatedAt:
          FB.serverTimestamp(),

        updatedBy:
          meta.uid,

        updatedByName:
          meta.name
      }
    );

    customer.status =
      status;

    customer.updatedBy =
      meta.uid;

    customer.updatedByName =
      meta.name;

    renderCustomersTable();

    showToast(
      status === 'interested'
        ? 'Customer subscribed.'
        : 'Customer unsubscribed.'
    );

    /*
     * Immediately update an opened campaign.
     */
    if (_activeCampaign) {
      renderCampaignRecipients();
    }

  } catch (error) {

    console.error(
      '[Customers] status update error:',
      error
    );

    showToast(
      'Unable to update customer status.'
    );

    renderCustomersTable();
  }
}


/* =========================================================
   DELETE CUSTOMER
========================================================= */

export async function deleteCustomer(
  customerId
) {
  if (!isAdmin()) {
    return showToast(
      'Only admin can delete customers.'
    );
  }

  const customer =
    _customers.find(
      item =>
        item.id === customerId
    );

  if (!customer) {
    return;
  }

  const customerName =
    displayCustomerName(
      customer
    );

  if (
    !window.confirm(
      `Delete ${customerName}? This cannot be undone.`
    )
  ) {
    return;
  }

  try {

    await FB.deleteDoc(
      FB.docRef(
        CUSTOMER_COLLECTION,
        customerId
      )
    );

    _customers =
      _customers.filter(
        item =>
          item.id !== customerId
      );

    renderCustomersTable();

    if (_activeCampaign) {
      renderCampaignRecipients();
    }

    showToast(
      'Customer deleted.'
    );

  } catch (error) {

    console.error(
      '[Customers] delete error:',
      error
    );

    showToast(
      'Unable to delete customer.'
    );
  }
}


/* =========================================================
   WHATSAPP MARKETING
========================================================= */

export async function renderWhatsappMarketing() {
  renderLoading(
    'whatsapp-campaigns-wrap',
    'Loading WhatsApp campaigns...'
  );

  try {

    const snap =
      await FB.getDocs(
        FB.query(
          FB.col(
            CAMPAIGN_COLLECTION
          ),
          FB.orderBy(
            'createdAt',
            'desc'
          )
        )
      );

    _campaigns =
      snap.docs.map(
        doc => ({
          id: doc.id,
          ...doc.data()
        })
      );

    renderCampaigns();

  } catch (error) {

    console.error(
      '[WhatsApp] campaign load error:',
      error
    );

    const target =
      document.getElementById(
        'whatsapp-campaigns-wrap'
      );

    if (target) {
      target.innerHTML = `
        <div class="alert alert-danger">
          Unable to load campaigns.
          ${escapeHtml(
            friendlyFirestoreError(
              error,
              'Unable to complete this request.'
            )
          )}
        </div>
      `;
    }
  }
}


/* =========================================================
   RENDER CAMPAIGNS
========================================================= */

function renderCampaigns() {
  const target =
    document.getElementById(
      'whatsapp-campaigns-wrap'
    );

  if (!target) {
    return;
  }

  if (!_campaigns.length) {
    target.innerHTML = `
      <div class="empty-state">

        <div class="empty-icon">
          💬
        </div>

        <h3>
          No WhatsApp campaigns yet
        </h3>

        <p>
          Create a campaign to start
          sending prefilled WhatsApp messages.
        </p>

      </div>
    `;

    return;
  }

  target.innerHTML = `
    <div class="campaign-list-grid">

      ${_campaigns
        .map(
          campaign => `
            <div class="whatsapp-campaign-card">

              <div class="campaign-card-head">

                <div>

                  <h3>
                    ${escapeHtml(
                      campaign.name ||
                      'Untitled Campaign'
                    )}
                  </h3>

                  <p>
                    ${formatDate(
                      campaign.createdAt
                    )}
                    •
                    ${escapeHtml(
                      (
                        campaign.gender ||
                        'all'
                      ).toUpperCase()
                    )}
                  </p>

                </div>

                <span
                  class="campaign-live-pill"
                >
                  ${escapeHtml(
                    campaign.gender ||
                    'all'
                  )}
                </span>

              </div>

              <p
                class="campaign-message-preview"
              >
                ${escapeHtml(
                  campaign.message ||
                  ''
                )}
              </p>

              <div
                class="campaign-card-meta"
              >
                <span>
                  URL:
                  ${escapeHtml(
                    campaign.url ||
                    '-'
                  )}
                </span>
              </div>

              <div
                class="campaign-card-actions"
              >

                <button
                  class="btn btn-accent btn-full"
                  onclick="window.Customers.openWhatsappCampaign('${campaign.id}')"
                >
                  Open Campaign
                </button>

                <button
                  class="btn btn-outline btn-sm"
                  onclick="window.Customers.editWhatsappCampaign('${campaign.id}')"
                >
                  Edit
                </button>

                ${
                  isAdmin()
                    ? `
                      <button
                        class="btn btn-danger btn-sm"
                        onclick="window.Customers.deleteWhatsappCampaign('${campaign.id}')"
                      >
                        Delete
                      </button>
                    `
                    : ''
                }

              </div>

            </div>
          `
        )
        .join('')}

    </div>
  `;
}


/* =========================================================
   CREATE WHATSAPP CAMPAIGN
========================================================= */

export function showCreateWhatsappCampaign() {
  _editingCampaignId = null;

  const form =
    document.getElementById(
      'whatsapp-campaign-form'
    );

  if (form) {
    form.reset();
  }

  const message =
    document.getElementById(
      'whatsapp-campaign-message'
    );

  if (message) {
    message.value =
      DEFAULT_MESSAGE;
  }

  const gender =
    document.getElementById(
      'whatsapp-campaign-gender'
    );

  if (gender) {
    gender.value = 'all';
  }

  const title =
    document.getElementById(
      'whatsapp-campaign-modal-title'
    );

  if (title) {
    title.textContent =
      'Create WhatsApp Marketing';
  }

  const submit =
    document.querySelector(
      '#whatsapp-campaign-form button[type="submit"]'
    );

  if (submit) {
    submit.textContent =
      'Create Campaign';
  }

  const alert =
    document.getElementById(
      'whatsapp-campaign-alert'
    );

  if (alert) {
    alert.style.display =
      'none';
  }

  const modal =
    document.getElementById(
      'whatsapp-campaign-modal'
    );

  if (modal) {
    modal.style.display =
      'flex';
  }

  document
    .getElementById(
      'whatsapp-campaign-name'
    )
    ?.focus();
}


/* =========================================================
   EDIT WHATSAPP CAMPAIGN
========================================================= */

export function editWhatsappCampaign(
  campaignId
) {
  const campaign =
    _campaigns.find(
      item =>
        item.id === campaignId
    );

  if (!campaign) {
    return showToast(
      'Campaign not found.'
    );
  }

  _editingCampaignId =
    campaignId;

  const name =
    document.getElementById(
      'whatsapp-campaign-name'
    );

  const message =
    document.getElementById(
      'whatsapp-campaign-message'
    );

  const url =
    document.getElementById(
      'whatsapp-campaign-url'
    );

  const gender =
    document.getElementById(
      'whatsapp-campaign-gender'
    );

  if (name) {
    name.value =
      campaign.name || '';
  }

  if (message) {
    message.value =
      campaign.message ||
      DEFAULT_MESSAGE;
  }

  if (url) {
    url.value =
      campaign.url || '';
  }

  if (gender) {
    gender.value =
      [
        'male',
        'female',
        'all'
      ].includes(
        campaign.gender
      )
        ? campaign.gender
        : 'all';
  }

  const title =
    document.getElementById(
      'whatsapp-campaign-modal-title'
    );

  if (title) {
    title.textContent =
      'Edit WhatsApp Marketing';
  }

  const submit =
    document.querySelector(
      '#whatsapp-campaign-form button[type="submit"]'
    );

  if (submit) {
    submit.textContent =
      'Save Changes';
  }

  const alert =
    document.getElementById(
      'whatsapp-campaign-alert'
    );

  if (alert) {
    alert.style.display =
      'none';
  }

  const modal =
    document.getElementById(
      'whatsapp-campaign-modal'
    );

  if (modal) {
    modal.style.display =
      'flex';
  }

  name?.focus();
}


/* =========================================================
   HIDE CAMPAIGN MODAL
========================================================= */

export function hideWhatsappCampaignModal() {
  const modal =
    document.getElementById(
      'whatsapp-campaign-modal'
    );

  if (modal) {
    modal.style.display =
      'none';
  }

  _editingCampaignId =
    null;
}


/* =========================================================
   SAVE WHATSAPP CAMPAIGN
========================================================= */

export async function saveWhatsappCampaign(
  event
) {
  event?.preventDefault();

  const name =
    document.getElementById(
      'whatsapp-campaign-name'
    )?.value.trim() || '';

  const message =
    document.getElementById(
      'whatsapp-campaign-message'
    )?.value.trim() || '';

  const url =
    document.getElementById(
      'whatsapp-campaign-url'
    )?.value.trim() || '';

  const gender =
    document.getElementById(
      'whatsapp-campaign-gender'
    )?.value ||
    'all';

  const alert =
    document.getElementById(
      'whatsapp-campaign-alert'
    );

  if (!name) {
    return showWhatsappAlert(
      alert,
      'Please enter a campaign name.'
    );
  }

  if (!message) {
    return showWhatsappAlert(
      alert,
      'Please enter the WhatsApp message.'
    );
  }

  if (!url) {
    return showWhatsappAlert(
      alert,
      'Please enter the sale URL.'
    );
  }

  if (
    ![
      'male',
      'female',
      'all'
    ].includes(gender)
  ) {
    return showWhatsappAlert(
      alert,
      'Please select a gender.'
    );
  }

  const button =
    document.querySelector(
      '#whatsapp-campaign-form button[type="submit"]'
    );

  const editingId =
    _editingCampaignId;

  const isEditing =
    Boolean(editingId);

  if (button) {
    button.disabled = true;

    button.textContent =
      isEditing
        ? 'Saving...'
        : 'Creating...';
  }

  try {

    const meta =
      currentUserMeta();

    if (isEditing) {

      await FB.updateDoc(
        FB.docRef(
          CAMPAIGN_COLLECTION,
          editingId
        ),
        {
          name,
          message,
          url,
          gender,

          updatedAt:
            FB.serverTimestamp(),

          updatedBy:
            meta.uid,

          updatedByName:
            meta.name,

          updatedByEmail:
            meta.email
        }
      );

      const index =
        _campaigns.findIndex(
          item =>
            item.id === editingId
        );

      if (index >= 0) {
        _campaigns[index] = {
          ..._campaigns[index],
          name,
          message,
          url,
          gender
        };
      }

      if (
        _activeCampaign?.id ===
        editingId
      ) {
        _activeCampaign = {
          ..._activeCampaign,
          name,
          message,
          url,
          gender
        };
      }

      hideWhatsappCampaignModal();

      await renderWhatsappMarketing();

      showToast(
        'WhatsApp campaign updated.'
      );

      if (
        _activeCampaign?.id ===
        editingId
      ) {
        renderWhatsappCampaignDetail();
      }

    } else {

      const ref =
        await FB.addDoc(
          FB.col(
            CAMPAIGN_COLLECTION
          ),
          {
            name,
            message,
            url,
            gender,

            createdAt:
              FB.serverTimestamp(),

            createdBy:
              meta.uid,

            createdByName:
              meta.name,

            createdByEmail:
              meta.email
          }
        );

      hideWhatsappCampaignModal();

      await renderWhatsappMarketing();

      showToast(
        'WhatsApp campaign created.'
      );

      if (
        window.confirm(
          'Campaign created. Open it now?'
        )
      ) {
        await openWhatsappCampaign(
          ref.id
        );
      }
    }

  } catch (error) {

    console.error(
      `[WhatsApp] ${
        isEditing
          ? 'update'
          : 'create'
      } error:`,
      error
    );

    showWhatsappAlert(
      alert,
      `Could not ${
        isEditing
          ? 'update'
          : 'create'
      } campaign: ${friendlyFirestoreError(
        error,
        'Unknown error'
      )}`
    );

  } finally {

    if (button) {
      button.disabled =
        false;

      button.textContent =
        isEditing
          ? 'Save Changes'
          : 'Create Campaign';
    }
  }
}


/* =========================================================
   DELETE WHATSAPP CAMPAIGN
========================================================= */

export async function deleteWhatsappCampaign(
  campaignId
) {
  if (!isAdmin()) {
    return showToast(
      'Only admin can delete WhatsApp campaigns.'
    );
  }

  const campaign =
    _campaigns.find(
      item =>
        item.id === campaignId
    );

  if (!campaign) {
    return;
  }

  if (
    !window.confirm(
      `Delete "${
        campaign.name ||
        'this campaign'
      }"? Its sent-status records will also be deleted.`
    )
  ) {
    return;
  }

  try {

    /*
     * Firestore does NOT automatically
     * delete subcollections.
     *
     * So remove recipients first.
     */
    const recipientsSnap =
      await FB.getDocs(
        FB.col(
          `${CAMPAIGN_COLLECTION}/${campaignId}/recipients`
        )
      );

    const docs =
      recipientsSnap.docs;

    /*
     * Use batches of 400.
     * Firestore batch limit is 500.
     */
    for (
      let i = 0;
      i < docs.length;
      i += 400
    ) {

      const batch =
        FB.writeBatch();

      docs
        .slice(
          i,
          i + 400
        )
        .forEach(
          docSnap =>
            batch.delete(
              docSnap.ref
            )
        );

      await batch.commit();
    }

    await FB.deleteDoc(
      FB.docRef(
        CAMPAIGN_COLLECTION,
        campaignId
      )
    );

    _campaigns =
      _campaigns.filter(
        item =>
          item.id !== campaignId
      );

    if (
      _activeCampaign?.id ===
      campaignId
    ) {

      _activeCampaign =
        null;

      _campaignSent =
        new Set();

      _campaignSentBy =
        new Map();

      window.App.go(
        'whatsapp-marketing'
      );

    } else {

      renderCampaigns();
    }

    showToast(
      'WhatsApp campaign deleted.'
    );

  } catch (error) {

    console.error(
      '[WhatsApp] delete error:',
      error
    );

    showToast(
      `Unable to delete campaign: ${friendlyFirestoreError(
        error,
        'Unknown error'
      )}`
    );
  }
}


/* =========================================================
   WHATSAPP ALERT
========================================================= */

function showWhatsappAlert(
  alert,
  message
) {
  if (!alert) {
    return;
  }

  alert.textContent =
    message;

  alert.className =
    'alert alert-danger';

  alert.style.display =
    'block';
}


/* =========================================================
   OPEN WHATSAPP CAMPAIGN
========================================================= */

export async function openWhatsappCampaign(
  campaignId
) {
  const campaign =
    _campaigns.find(
      item =>
        item.id === campaignId
    );

  if (!campaign) {
    return;
  }

  _activeCampaign =
    campaign;

  _campaignSent =
    new Set();

  _campaignSentBy =
    new Map();

  window.App.go(
    'whatsapp-campaign-detail'
  );

  await loadCampaignSentStatuses(
    campaignId
  );

  await renderWhatsappCampaignDetail();
}


/* =========================================================
   LOAD SENT STATUS
========================================================= */

async function loadCampaignSentStatuses(
  campaignId
) {
  try {

    const snap =
      await FB.getDocs(
        FB.col(
          `${CAMPAIGN_COLLECTION}/${campaignId}/recipients`
        )
      );

    _campaignSent =
      new Set(
        snap.docs.map(
          doc =>
            doc.id
        )
      );

    _campaignSentBy =
      new Map(
        snap.docs.map(
          doc => [
            doc.id,
            doc.data().sentByName ||
              doc.data().sentByEmail ||
              'Unknown'
          ]
        )
      );

  } catch (error) {

    console.error(
      '[WhatsApp] sent status load error:',
      error
    );

    _campaignSent =
      new Set();

    _campaignSentBy =
      new Map();
  }
}


/* =========================================================
   RENDER CAMPAIGN DETAIL
========================================================= */

export async function renderWhatsappCampaignDetail() {
  if (!_activeCampaign) {
    return;
  }

  /*
   * IMPORTANT:
   *
   * Always refresh customers.
   *
   * This means:
   *
   * Campaign created Monday
   * Customer added Tuesday
   *
   * Customer will still appear in
   * the campaign automatically.
   */
  try {

    const snap =
      await FB.getDocs(
        FB.query(
          FB.col(
            CUSTOMER_COLLECTION
          ),
          FB.orderBy(
            'addedAt',
            'desc'
          )
        )
      );

    _customers =
      snap.docs.map(
        doc => ({
          id: doc.id,
          ...doc.data()
        })
      );

  } catch (error) {

    console.error(
      '[WhatsApp] customer refresh error:',
      error
    );
  }

  const name =
    document.getElementById(
      'whatsapp-detail-name'
    );

  const meta =
    document.getElementById(
      'whatsapp-detail-meta'
    );

  if (name) {
    name.textContent =
      _activeCampaign.name ||
      'WhatsApp Campaign';
  }

  if (meta) {
    meta.textContent =
      `${
        (
          _activeCampaign.gender ||
          'all'
        ).toUpperCase()
      } • ${
        formatDate(
          _activeCampaign.createdAt
        )
      } • Only subscribed customers are shown`;
  }

  renderCampaignRecipients();
}


/* =========================================================
   CAMPAIGN RECIPIENTS
========================================================= */

function getCampaignRecipients() {
  if (!_activeCampaign) {
    return [];
  }

  return _customers.filter(
    customer =>
      isSubscribed(customer) &&
      genderMatches(
        customer.gender,
        _activeCampaign.gender ||
          'all'
      )
  );
}


/* =========================================================
   PERSONALIZED WHATSAPP MESSAGE
========================================================= */

function buildPersonalizedMessage(
  customer
) {
  const customerName =
    displayCustomerName(
      customer
    );

  return String(
    _activeCampaign?.message ||
      DEFAULT_MESSAGE
  )
    .replace(
      /\{\{name\}\}/gi,
      customerName
    )
    .replace(
      /\{\{URL\}\}/gi,
      _activeCampaign?.url ||
        ''
    );
}


/* =========================================================
   RENDER RECIPIENT TABLE
========================================================= */

function renderCampaignRecipients() {
  const target =
    document.getElementById(
      'whatsapp-recipients-wrap'
    );

  if (
    !target ||
    !_activeCampaign
  ) {
    return;
  }

  const recipients =
    getCampaignRecipients();

  const count =
    document.getElementById(
      'whatsapp-recipient-count'
    );

  if (count) {
    count.textContent =
      `${recipients.length} subscribed recipient${
        recipients.length === 1
          ? ''
          : 's'
      }`;
  }

  if (!recipients.length) {

    target.innerHTML = `
      <div class="empty-state">

        <div class="empty-icon">
          📭
        </div>

        <h3>
          No eligible customers
        </h3>

        <p>
          Customers who are marked
          Not Interested are automatically
          excluded from this campaign.
        </p>

      </div>
    `;

    return;
  }

  target.innerHTML = `
    <div
      class="data-table-wrap whatsapp-table-wrap"
    >

      <table
        class="data-table whatsapp-table"
      >

        <thead>

          <tr>
            <th>Sl No</th>
            <th>Name</th>
            <th>Number</th>
            <th>Gender</th>
            <th>WhatsApp</th>
            <th>Sent Status</th>
            <th>Sent By</th>
          </tr>

        </thead>

        <tbody>

          ${recipients
            .map(
              (customer, index) => {

                const sent =
                  _campaignSent.has(
                    customer.id
                  );

                const sentBy =
                  _campaignSentBy.get(
                    customer.id
                  ) || '-';

                const gender =
                  customer.gender
                    ? customer.gender
                        .charAt(0)
                        .toUpperCase() +
                      customer.gender.slice(1)
                    : '-';

                return `
                  <tr>

                    <td>
                      ${index + 1}
                    </td>

                    <td>
                      <strong>
                        ${escapeHtml(
                          displayCustomerName(
                            customer
                          )
                        )}
                      </strong>
                    </td>

                    <td>
                      ${escapeHtml(
                        customer.number ||
                          '-'
                      )}
                    </td>

                    <td>
                      ${escapeHtml(
                        gender
                      )}
                    </td>

                    <td>

                      <button
                        class="btn btn-whatsapp btn-sm"
                        onclick="window.Customers.openWhatsApp('${customer.id}')"
                      >
                        Open WhatsApp
                      </button>

                    </td>

                    <td>

                      <span
                        class="sent-status ${
                          sent
                            ? 'sent'
                            : 'pending'
                        }"
                      >
                        ${
                          sent
                            ? 'Sent'
                            : 'Not Sent'
                        }
                      </span>

                    </td>

                    <td>
                      ${escapeHtml(
                        sentBy
                      )}
                    </td>

                  </tr>
                `;
              }
            )
            .join('')}

        </tbody>

      </table>

    </div>
  `;
}


/* =========================================================
   OPEN WHATSAPP
========================================================= */

export async function openWhatsApp(
  customerId
) {
  if (!_activeCampaign) {
    return;
  }

  const customer =
    _customers.find(
      item =>
        item.id === customerId
    );

  /*
   * Check subscription again before
   * opening WhatsApp.
   */
  if (
    !customer ||
    !isSubscribed(customer) ||
    !genderMatches(
      customer.gender,
      _activeCampaign.gender ||
        'all'
    )
  ) {

    showToast(
      'This customer is unsubscribed or no longer matches the campaign.'
    );

    renderCampaignRecipients();

    return;
  }

  const phone =
    phoneForWhatsApp(
      customer.number
    );

  if (!phone) {
    return showToast(
      'Customer number is invalid.'
    );
  }

  /*
   * Build personalized message.
   *
   * {{name}} -> Customer name
   * {{URL}}  -> Campaign URL
   */
  const message =
    buildPersonalizedMessage(
      customer
    );

  const whatsappUrl =
    `https://web.whatsapp.com/send?phone=${encodeURIComponent(
      phone
    )}&text=${encodeURIComponent(
      message
    )}`;

  /*
   * Open WhatsApp first.
   *
   * This reduces popup blocker problems.
   */
  window.open(
    whatsappUrl,
    '_blank',
    'noopener,noreferrer'
  );

  try {

    const meta =
      currentUserMeta();

    /*
     * Store sent status.
     *
     * Recipient document ID =
     * customer ID.
     *
     * This prevents duplicate recipient
     * documents for the same customer.
     */
    await FB.setDoc(
      FB.docRef(
        `${CAMPAIGN_COLLECTION}/${_activeCampaign.id}/recipients`,
        customer.id
      ),
      {
        customerId:
          customer.id,

        customerName:
          displayCustomerName(
            customer
          ),

        customerNumber:
          customer.number ||
          '',

        sentAt:
          FB.serverTimestamp(),

        sentBy:
          meta.uid,

        sentByName:
          meta.name
      },
      {
        merge: true
      }
    );

    _campaignSent.add(
      customer.id
    );

    _campaignSentBy.set(
      customer.id,
      meta.name
    );

    renderCampaignRecipients();

  } catch (error) {

    console.error(
      '[WhatsApp] sent status update error:',
      error
    );

    showToast(
      'WhatsApp opened, but sent status could not be saved.'
    );
  }
}


/* =========================================================
   BACK TO WHATSAPP MARKETING
========================================================= */

export function backToWhatsappMarketing() {
  _activeCampaign =
    null;

  _campaignSent =
    new Set();

  _campaignSentBy =
    new Map();

  window.App.go(
    'whatsapp-marketing'
  );
}


/* =========================================================
   DEFAULT MESSAGE
========================================================= */

export function getDefaultWhatsappMessage() {
  return DEFAULT_MESSAGE;
}