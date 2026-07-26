/**
 * marketing.js - AI Marketing Creative Generator Module
 * Handles Products and Sale Campaigns functionality with Cloudinary integration
 */

import { FB } from './firebase.js';
import { getUser, getUserDoc, isAdmin } from './auth.js';
import { showToast, showAlert, hideAlert, openModal, closeModal } from './ui.js';
import { safeStr, escapeHtml, formatDate } from './utils.js';
import { uploadImage, getThumbnail, getResponsive, isFirebaseStorageUrl } from './cloudinary.js';

// ── STATE ────────────────────────────────────────────────────
let _products = [];
let _compareProductSelection = []; // store selected product ids for comparison
let _campaigns = [];
let _campaignItems = [];
let _currentCampaign = null;
let _selectedProductIds = new Set();
let _currentEditingProduct = null;
let _currentCampaignItem = null;
let _currentActiveTab = 'pending';

// ── PRODUCTS MODULE ──────────────────────────────────────────

/**
 * Load and render products list
 */
async function renderProducts() {
  const container = document.getElementById('products-grid');
  if (!container) return;
  
  try {
    // Load products from Firestore
    const q = FB.query(
      FB.col('products'),
      FB.orderBy('createdAt', 'desc')
    );
    const snapshot = await FB.getDocs(q);
    
    _products = [];
    snapshot.forEach(doc => {
      const product = { id: doc.id, ...doc.data() };
      _products.push(product);
    });
    
    // Apply search filter
    const searchTerm = document.getElementById('products-search')?.value?.toLowerCase() || '';
    const filteredProducts = _products.filter(product =>
      product.productName?.toLowerCase().includes(searchTerm)
    );
    
    // Update badge count
    const badge = document.getElementById('products-badge');
    if (badge) badge.textContent = _products.length;
    
    // Render products
    if (filteredProducts.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
          </svg>
          <h3>No Products Found</h3>
          <p>${searchTerm ? 'No products match your search.' : 'Get started by adding your first product.'}</p>
          ${!searchTerm ? '<button class="btn btn-accent" onclick="window.Marketing.showAddProduct()">Add Product</button>' : ''}
        </div>`;
      return;
    }
    
    container.innerHTML = filteredProducts.map(product => {
      // Safe image URL handling with fallbacks
      let imageSrc = '';
      if (product.imageUrl) {
        imageSrc = getResponsive(product.imageUrl, 280);
      } else if (product.image) {
        // Legacy field fallback
        imageSrc = getResponsive(product.image, 280);
      }
      
      return `
      <div class="product-card">
          <div class="product-compare">
            <label style="display:flex;align-items:center;gap:.5rem;cursor:pointer">
              <input type="checkbox" ${_compareProductSelection.includes(product.id) ? 'checked' : ''} onclick="event.stopPropagation(); window.Marketing.toggleProductCompare('${product.id}')" />
              <span style="font-size:.75rem">Compare</span>
            </label>
          </div>
        <div class="product-image ${!imageSrc ? 'empty' : ''}">
          ${imageSrc 
            ? `<img src="${escapeHtml(imageSrc)}" alt="${escapeHtml(product.productName || 'Product')}" loading="lazy" onerror="this.onerror=null;this.parentElement.innerHTML='No Image';"/>`
            : 'No Image'
          }
        </div>
        <div class="product-name">${escapeHtml(product.productName || 'Untitled Product')}</div>
        <div class="product-pricing">
          <div class="product-mrp">MRP ₹${product.mrp || 0}</div>
          <div class="product-selling-price">₹${product.sellingPrice || 0}</div>
          <div class="product-discount">
            <span class="you-save">Save ₹${product.youSave || 0}</span>
            <span class="discount-badge">${product.discount || 0}% OFF</span>
          </div>
        </div>
        <div class="product-meta">
          <div class="product-date">${formatDate(product.createdAt)}</div>
          <div class="product-actions">
            ${canEditProduct(product) ? `
              <button class="btn btn-outline btn-sm" onclick="window.Marketing.editProduct('${product.id}')">
                Edit
              </button>
            ` : ''}
            ${canDeleteProduct(product) ? `
              <button class="btn btn-danger btn-sm" onclick="window.Marketing.deleteProduct('${product.id}')">
                Delete
              </button>
            ` : ''}
            
          </div>
        </div>
      </div>`;
    }).join('');
    
  } catch (error) {
    console.error('Error loading products:', error);
    showToast('Failed to load products');
    container.innerHTML = '<div class="empty-state"><p>Error loading products</p></div>';
  }
}

function toggleProductCompare(productId) {
  const idx = _compareProductSelection.indexOf(productId);
  if (idx > -1) {
    _compareProductSelection.splice(idx, 1);
    showToast('Removed from compare');
  } else {
    if (_compareProductSelection.length >= 2) {
      showToast('You can compare up to 2 products only');
      return;
    }
    _compareProductSelection.push(productId);
    showToast('Selected for compare');
  }
  // Update compare button state
  const btn = document.getElementById('product-compare-btn');
  if (btn) btn.disabled = _compareProductSelection.length !== 2;
  renderProducts();
}

async function compareSelectedProducts() {
  if (_compareProductSelection.length !== 2) {
    showToast('Select 2 products to compare');
    return;
  }

  const p1 = _products.find(p => p.id === _compareProductSelection[0]);
  const p2 = _products.find(p => p.id === _compareProductSelection[1]);
  if (!p1 || !p2) {
    showToast('Selected products not found');
    return;
  }

  // Try to fetch latest performance reports for both products
  try {
    const report1 = await window.AuditHistory.getLatestReportForProduct(p1);
    const report2 = await window.AuditHistory.getLatestReportForProduct(p2);

    if (!report1 && !report2) {
      showToast('No saved performance reports found for the selected products');
      return;
    }

    if (!report1 || !report2) {
      showToast('One of the selected products does not have a saved performance report');
      return;
    }

    // Open comparison modal using audit-history helper
    window.AuditHistory.openComparisonModalForReports(report1, report2);
  } catch (e) {
    console.error('Error comparing products:', e);
    showToast('Failed to compare products');
  }
}

/**
 * Show add product modal
 */
function showAddProduct() {
  _currentEditingProduct = null;
  document.getElementById('product-modal-title').textContent = 'Add Product';
  document.getElementById('product-form').reset();
  document.getElementById('product-img-preview').style.display = 'none';
  document.getElementById('product-upload-placeholder').style.display = 'flex';
  document.getElementById('product-discount').value = '';
  document.getElementById('product-you-save').value = '';
  hideAlert('product-alert');
  openModal('product-modal');
}

/**
 * Edit existing product
 */
async function editProduct(productId) {
  try {
    const product = _products.find(p => p.id === productId);
    if (!product) {
      showToast('Product not found');
      return;
    }
    
    if (!canEditProduct(product)) {
      showToast('Please log in to edit products');
      return;
    }
    
    _currentEditingProduct = product;
    document.getElementById('product-modal-title').textContent = 'Edit Product';
    document.getElementById('product-name').value = product.productName || '';
    document.getElementById('product-mrp').value = product.mrp || '';
    document.getElementById('product-selling-price').value = product.sellingPrice || '';
    
    // Show image if exists
    const preview = document.getElementById('product-img-preview');
    const placeholder = document.getElementById('product-upload-placeholder');
    
    if (product.imageUrl) {
      preview.src = getResponsive(product.imageUrl, 400);
      preview.style.display = 'block';
      placeholder.style.display = 'none';
    } else {
      preview.style.display = 'none';
      placeholder.style.display = 'flex';
    }
    
    calculateDiscount();
    hideAlert('product-alert');
    openModal('product-modal');
    
  } catch (error) {
    console.error('Error loading product for edit:', error);
    showToast('Failed to load product details');
  }
}

/**
 * Handle product image selection
 */
function onProductImageSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  // Validate file
  if (!file.type.startsWith('image/')) {
    showAlert('product-alert', 'Please select a valid image file');
    return;
  }
  
  if (file.size > 10 * 1024 * 1024) {
    showAlert('product-alert', 'Image size must be less than 10MB');
    return;
  }
  
  // Show preview
  const reader = new FileReader();
  reader.onload = (e) => {
    const preview = document.getElementById('product-img-preview');
    const placeholder = document.getElementById('product-upload-placeholder');
    
    preview.src = e.target.result;
    preview.style.display = 'block';
    placeholder.style.display = 'none';
  };
  reader.readAsDataURL(file);
}

/**
 * Calculate discount and you save amounts
 */
function calculateDiscount() {
  const mrp = parseFloat(document.getElementById('product-mrp').value) || 0;
  const sellingPrice = parseFloat(document.getElementById('product-selling-price').value) || 0;
  
  if (mrp <= 0 || sellingPrice <= 0) {
    document.getElementById('product-discount').value = '';
    document.getElementById('product-you-save').value = '';
    return;
  }
  
  if (sellingPrice > mrp) {
    document.getElementById('product-discount').value = '';
    document.getElementById('product-you-save').value = '';
    return;
  }
  
  const youSave = mrp - sellingPrice;
  const discount = ((youSave / mrp) * 100).toFixed(1);
  
  document.getElementById('product-discount').value = `${discount}%`;
  document.getElementById('product-you-save').value = `₹${youSave}`;
}

/**
 * Hide product modal
 */
function hideProductModal() {
  closeModal('product-modal');
}

/**
 * Handle product form submission
 */
async function handleProductSubmit(event) {
  event.preventDefault();
  
  const user = getUser();
  if (!user) {
    showAlert('product-alert', 'Please log in to continue');
    return;
  }
  
  // Get form data
  const productName = document.getElementById('product-name').value.trim();
  const mrp = parseFloat(document.getElementById('product-mrp').value);
  const sellingPrice = parseFloat(document.getElementById('product-selling-price').value);
  const fileInput = document.getElementById('product-file-inp');
  
  // Validate
  if (!productName) {
    showAlert('product-alert', 'Product name is required');
    return;
  }
  
  if (!mrp || mrp <= 0) {
    showAlert('product-alert', 'Valid MRP is required');
    return;
  }
  
  if (!sellingPrice || sellingPrice <= 0) {
    showAlert('product-alert', 'Valid selling price is required');
    return;
  }
  
  if (sellingPrice > mrp) {
    showAlert('product-alert', 'Selling price cannot be greater than MRP');
    return;
  }
  
  // Check if image is required for new products
  if (!_currentEditingProduct && !fileInput.files[0] && !document.getElementById('product-img-preview').src) {
    showAlert('product-alert', 'Product image is required');
    return;
  }
  // Get button reference and store original text before try block
  const submitBtn = event.target.querySelector('button[type="submit"]');
  const originalText = submitBtn?.textContent || '';
  
  try {
    hideAlert('product-alert');
    if (submitBtn) {
      submitBtn.textContent = 'Saving...';
      submitBtn.disabled = true;
    }
    
    let imageUrl = _currentEditingProduct?.imageUrl || '';
    let publicId = _currentEditingProduct?.publicId || '';
    
    // Upload new image if selected
    if (fileInput.files[0]) {
      const file = fileInput.files[0];
      
      showToast('Uploading image to Cloudinary...');
      
      try {
        // Upload to Cloudinary with optimized settings for products
        const uploadResult = await uploadImage(file, 'products', {
          publicId: `product_${user.uid}_${Date.now()}`
        });
        
        imageUrl = uploadResult.secure_url;
        publicId = uploadResult.public_id;
        
        console.log('[Marketing] Upload result:', {
          secure_url: uploadResult.secure_url,
          public_id: uploadResult.public_id
        });
        
        showToast('Image uploaded successfully!');
        
      } catch (uploadError) {
        console.error('Cloudinary upload error:', uploadError);
        showAlert('product-alert', uploadError.message);
        return;
      }
    }
    
    // Calculate derived values with safe defaults
    const youSave = (mrp || 0) - (sellingPrice || 0);
    const discount = mrp > 0 ? parseFloat(((youSave / mrp) * 100).toFixed(1)) : 0;
    
    const productData = {
      productName,
      imageUrl,
      publicId,
      mrp: mrp || 0,
      sellingPrice: sellingPrice || 0,
      discount,
      youSave,
      createdBy: _currentEditingProduct?.createdBy || user.uid, // FIX: Preserve original product owner when editing
      updatedAt: FB.serverTimestamp()
    };
    
    if (_currentEditingProduct) {
      // Update existing product - this will automatically update all references
      await FB.updateDoc(FB.docRef('products', _currentEditingProduct.id), productData);
      showToast('Product updated successfully');
    } else {
      // Create new product
      productData.createdAt = FB.serverTimestamp();
      await FB.addDoc(FB.col('products'), productData);
      showToast('Product added successfully');
    }
    
    hideProductModal();
    renderProducts();
    
  } catch (error) {
    console.error('Error saving product:', error);
    showAlert('product-alert', 'Failed to save product. Please try again.');
  } finally {
    if (submitBtn) {
      submitBtn.textContent = originalText; // FIX: Product submit button reset
      submitBtn.disabled = false;
    }
  }
}

/**
 * Delete campaign and its items
 */
async function deleteCampaign(campaignId) {
  if (!confirm('Are you sure you want to delete this campaign and all its items?')) return;

  try {
    const campaign = _campaigns.find(c => c.id === campaignId) || (await FB.getDoc(FB.docRef('saleCampaigns', campaignId))).data();
    if (!campaign) {
      showToast('Campaign not found');
      return;
    }

    // Fetch campaign items and delete in a batch
    const itemsQuery = FB.query(
      FB.col('campaignItems'),
      FB.where('campaignId', '==', campaignId)
    );
    const itemsSnapshot = await FB.getDocs(itemsQuery);

    const batch = FB.writeBatch();
    itemsSnapshot.forEach(doc => {
      batch.delete(FB.docRef('campaignItems', doc.id));
    });

    // Delete the campaign document
    batch.delete(FB.docRef('saleCampaigns', campaignId));

    await batch.commit();

    showToast('Campaign deleted successfully');
    // Refresh list
    renderCampaigns();

    // If we were viewing this campaign, navigate back to campaigns list
    if (_currentCampaign && _currentCampaign.id === campaignId) {
      _currentCampaign = null;
      window.App.go('campaigns');
    }

  } catch (error) {
    console.error('Error deleting campaign:', error);
    showToast('Failed to delete campaign');
  }
}

/**
 * Delete product
 */
async function deleteProduct(productId) {
  if (!confirm('Are you sure you want to delete this product?')) return;
  
  try {
    const product = _products.find(p => p.id === productId);
    if (!product) {
      showToast('Product not found');
      return;
    }
    
    if (!canDeleteProduct(product)) {
      showToast('Only admins can delete products');
      return;
    }
    
    await FB.deleteDoc(FB.docRef('products', productId));
    showToast('Product deleted successfully');
    renderProducts();
    
  } catch (error) {
    console.error('Error deleting product:', error);
    showToast('Failed to delete product');
  }
}

// ── CAMPAIGNS MODULE ─────────────────────────────────────────

/**
 * Load and render campaigns list
 */
async function renderCampaigns() {
  if (!isAdmin()) return;
  
  const container = document.getElementById('campaigns-grid');
  if (!container) return;
  
  try {
    // Load campaigns from Firestore
    const q = FB.query(
      FB.col('saleCampaigns'),
      FB.orderBy('createdAt', 'desc')
    );
    const snapshot = await FB.getDocs(q);
    
    _campaigns = [];
    snapshot.forEach(doc => {
      _campaigns.push({ id: doc.id, ...doc.data() });
    });
    
    // Apply search filter
    const searchTerm = document.getElementById('campaigns-search')?.value?.toLowerCase() || '';
    const filteredCampaigns = _campaigns.filter(campaign =>
      campaign.saleName?.toLowerCase().includes(searchTerm)
    );
    
    // Update badge count
    const badge = document.getElementById('campaigns-badge');
    if (badge) badge.textContent = _campaigns.length;
    // Render campaigns
    if (filteredCampaigns.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
            <path d="M8 12l2 2 4-4"/>
          </svg>
          <h3>No Campaigns Found</h3>
          <p>${searchTerm ? 'No campaigns match your search.' : 'Create your first sale campaign to get started.'}</p>
          ${!searchTerm ? '<button class="btn btn-accent" onclick="window.Marketing.showCreateCampaign()">Create Campaign</button>' : ''}
        </div>`;
      return;
    }
    
    container.innerHTML = filteredCampaigns.map(campaign => `
      <div class="campaign-card" onclick="window.Marketing.openCampaign('${campaign.id}')">
        <div class="campaign-name">${escapeHtml(campaign.saleName)}</div>
        <div class="campaign-prompt">${escapeHtml(campaign.prompt)}</div>
        <div class="campaign-meta">
          <div class="campaign-date">${formatDate(campaign.createdAt)}</div>
<div class="campaign-actions">

    <button
        class="btn btn-accent btn-sm"
        onclick="event.stopPropagation(); window.Marketing.openCampaign('${campaign.id}')">
        Open
    </button>

    <button
        class="btn btn-outline btn-sm"
        onclick="event.stopPropagation(); window.Marketing.editCampaign('${campaign.id}')">
        Edit
    </button>

    <button
        class="btn btn-danger btn-sm"
        onclick="event.stopPropagation(); window.Marketing.deleteCampaign('${campaign.id}')">
        Delete
    </button>

</div>
        </div>
      </div>
    `).join('');
    
  } catch (error) {
    console.error('Error loading campaigns:', error);
    showToast('Failed to load campaigns');
    container.innerHTML = '<div class="empty-state"><p>Error loading campaigns</p></div>';
  }
}

/**
 * Show create campaign modal
 */
function showCreateCampaign() {
    if (!isAdmin()) {
        showToast("Only admins can create campaigns");
        return;
    }

    _currentEditingCampaign = null;

    document.getElementById("campaign-modal-title").textContent = "Create Campaign";

    document.getElementById("campaign-form").reset();

    const submitBtn = document.querySelector("#campaign-form button[type='submit']");
    if (submitBtn) submitBtn.textContent = "Create Campaign";

    hideAlert("campaign-alert");

    openModal("campaign-modal");
}
let _currentEditingCampaign = null;

async function editCampaign(campaignId) {

    try {

        const campaign = _campaigns.find(c => c.id === campaignId);

        if (!campaign) {
            showToast("Campaign not found");
            return;
        }

        _currentEditingCampaign = campaign;

        document.getElementById("campaign-modal-title").textContent = "Edit Campaign";

        document.getElementById("campaign-name").value = campaign.saleName || "";

        document.getElementById("campaign-prompt").value = campaign.prompt || "";
        const submitBtn = document.querySelector("#campaign-form button[type='submit']");
if (submitBtn) submitBtn.textContent = "Update Campaign";
        hideAlert("campaign-alert");

        openModal("campaign-modal");

    } catch (error) {

        console.error(error);

        showToast("Failed to load campaign");

    }

}
/**
 * Hide campaign modal
 */
function hideCampaignModal() {
  closeModal('campaign-modal');
}

/**
 * Handle campaign form submission
 */
async function handleCampaignSubmit(event) {
  event.preventDefault();
  
  const user = getUser();
  if (!user || !isAdmin()) {
    showAlert('campaign-alert', 'Only admins can create campaigns');
    return;
  }
  
  // Get form data
  const saleName = document.getElementById('campaign-name').value.trim();
  const prompt = document.getElementById('campaign-prompt').value.trim();
  
  // Validate
  if (!saleName) {
    showAlert('campaign-alert', 'Sale name is required');
    return;
  }
  
  if (!prompt) {
    showAlert('campaign-alert', 'Prompt is required');
    return;
  }
  
  // Get button reference and store original text before try block
  const submitBtn = event.target.querySelector('button[type="submit"]');
  const originalText = submitBtn?.textContent || '';
  const isEditing = Boolean(_currentEditingCampaign);
  
  try {
    hideAlert('campaign-alert');
    if (submitBtn) {
      submitBtn.textContent = isEditing ? 'Updating...' : 'Creating...'; // FIX: Campaign button loading state
      submitBtn.disabled = true;
    }
    
    const campaignData = {
      saleName,
      prompt,
      updatedAt: FB.serverTimestamp() // FIX: Preserve createdAt and createdBy on update
    };

    if (isEditing) {
      await FB.updateDoc(
        FB.docRef('saleCampaigns', _currentEditingCampaign.id),
        campaignData
      );

      showToast('Campaign updated successfully');

      if (_currentCampaign && _currentCampaign.id === _currentEditingCampaign.id) {
        _currentCampaign.saleName = saleName; // FIX: Campaign edit refresh
        _currentCampaign.prompt = prompt; // FIX: Campaign edit refresh
        const detailName = document.getElementById('campaign-detail-name');
        const detailPrompt = document.getElementById('campaign-detail-prompt');
        if (detailName) detailName.textContent = saleName;
        if (detailPrompt) detailPrompt.textContent = prompt;
      }

      const regeneratePending = confirm('Campaign updated. Regenerate pending campaign items with the new prompt? This will only update pending items.');
      if (regeneratePending) {
        await regeneratePendingCampaignItems(_currentEditingCampaign.id, prompt);
      }

      if (_currentCampaign && _currentCampaign.id === _currentEditingCampaign.id) {
        await renderCampaignDetail();
      }
    } else {
      const createCampaignData = {
        ...campaignData,
        createdBy: user.uid,
        createdAt: FB.serverTimestamp()
      };

      await FB.addDoc(
        FB.col('saleCampaigns'),
        createCampaignData
      );

      showToast('Campaign created successfully');
    }
    
    hideCampaignModal();
    renderCampaigns();
    
  } catch (error) {
    console.error('Error creating campaign:', error);
    showAlert('campaign-alert', 'Failed to create campaign. Please try again.');
  } finally {
    if (submitBtn) {
      submitBtn.textContent = originalText; // FIX: Campaign button restore
      submitBtn.disabled = false;
    }
  }
}
/**
 * Open campaign details
 */
async function openCampaign(campaignId) {
  if (!isAdmin()) {
    showToast('Only admins can access campaigns');
    return;
  }
  
  try {
    const campaign = _campaigns.find(c => c.id === campaignId) || 
                    (await FB.getDoc(FB.docRef('saleCampaigns', campaignId))).data();
    
    if (!campaign) {
      showToast('Campaign not found');
      return;
    }
    
    _currentCampaign = { id: campaignId, ...campaign };
    
    // Update UI
    document.getElementById('campaign-detail-name').textContent = campaign.saleName;
    document.getElementById('campaign-detail-prompt').textContent = campaign.prompt;
    
    // Check if campaign has been started (has campaign items)
    const itemsQuery = FB.query(
      FB.col('campaignItems'),
      FB.where('campaignId', '==', campaignId)
    );
    const itemsSnapshot = await FB.getDocs(itemsQuery);
    
    if (itemsSnapshot.empty) {
      // Show product selection
      document.getElementById('product-selection').style.display = 'block';
      document.getElementById('campaign-tabs').style.display = 'none';
      document.getElementById('campaign-items-grid').style.display = 'none';
      renderCampaignProducts();
    } else {
      // Show campaign tabs and items
      document.getElementById('product-selection').style.display = 'none';
      document.getElementById('campaign-tabs').style.display = 'flex';
      document.getElementById('campaign-items-grid').style.display = 'grid';
      await loadCampaignItems(); // FIX: Await items before switching tabs
      switchCampaignTab(_currentActiveTab);
    }
    
    window.App.go('campaign-detail');
    
  } catch (error) {
    console.error('Error loading campaign:', error);
    showToast('Failed to load campaign details');
  }
}

/**
 * Render products for campaign selection
 */
async function renderCampaignProducts() {
  const container = document.getElementById('campaign-products-list');
  if (!container) return;
  
  // Apply search filter
  const searchTerm = document.getElementById('campaign-products-search')?.value?.toLowerCase() || '';
  const filteredProducts = _products.filter(product =>
    product.productName?.toLowerCase().includes(searchTerm)
  );
  
  if (filteredProducts.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>${searchTerm ? 'No products match your search.' : 'No products available.'}</p>
      </div>`;
    return;
  }
  
  container.innerHTML = filteredProducts.map(product => {
    // Safe image URL handling with fallbacks
    let imageSrc = '';
    if (product.imageUrl) {
      imageSrc = getThumbnail(product.imageUrl, 40);
    } else if (product.image) {
      // Legacy field fallback
      imageSrc = getThumbnail(product.image, 40);
    }
    
    return `
    <div class="campaign-product-item ${_selectedProductIds.has(product.id) ? 'selected' : ''}" 
         onclick="window.Marketing.toggleProductSelection('${product.id}')">
      <div class="campaign-product-header">
        <input type="checkbox" ${_selectedProductIds.has(product.id) ? 'checked' : ''} 
               onchange="window.Marketing.toggleProductSelection('${product.id}')" 
               onclick="event.stopPropagation()"/>
        <div class="campaign-product-image">
          ${imageSrc 
            ? `<img src="${escapeHtml(imageSrc)}" alt="${escapeHtml(product.productName || 'Product')}" onerror="this.style.display='none'; console.error('Failed to load campaign product image:', '${escapeHtml(imageSrc)}');"/>`
            : '<div style="width:40px;height:40px;background:#f0f0f0;border-radius:4px;"></div>'
          }
        </div>
        <div class="campaign-product-info">
          <div class="campaign-product-name">${escapeHtml(product.productName || 'Untitled Product')}</div>
          <div class="campaign-product-price">₹${product.sellingPrice || 0} (${product.discount || 0}% OFF)</div>
        </div>
      </div>
    </div>`;
  }).join('');
}

/**
 * Toggle product selection
 */
function toggleProductSelection(productId) {
  if (_selectedProductIds.has(productId)) {
    _selectedProductIds.delete(productId);
  } else {
    _selectedProductIds.add(productId);
  }
  
  // Update select all checkbox
  const selectAllCheckbox = document.getElementById('select-all-products');
  if (selectAllCheckbox) {
    selectAllCheckbox.checked = _selectedProductIds.size === _products.length;
  }
  
  renderCampaignProducts();
}
/**
 * Toggle select all products
 */
function toggleSelectAll() {
  const selectAllCheckbox = document.getElementById('select-all-products');
  const isChecked = selectAllCheckbox.checked;
  
  if (isChecked) {
    _products.forEach(product => _selectedProductIds.add(product.id));
  } else {
    _selectedProductIds.clear();
  }
  
  renderCampaignProducts();
}

/**
 * Start campaign with selected products
 */
async function startCampaign() {
  if (!_currentCampaign || _selectedProductIds.size === 0) {
    showToast('Please select at least one product');
    return;
  }
  
  try {
    hideAlert('product-alert');
    const batch = FB.writeBatch();
    const selectedProductIds = [..._selectedProductIds];
    const selectedProducts = await Promise.all(selectedProductIds.map(async id => {
      const latestProduct = await getLatestProductData(id);
      return latestProduct || _products.find(p => p.id === id);
    }));
    
    showToast('Starting campaign...');
    
    for (const product of selectedProducts) {
      if (!product) continue;
      const generatedPrompt = buildGeneratedPrompt(_currentCampaign.prompt || '', product); // FIX: Prompt placeholder generation
      const campaignItemData = {
        campaignId: _currentCampaign.id,
        productId: product.id, // Store only productId, not image URL
        productName: product.productName || 'Untitled Product',
        // Remove imageUrl - will be fetched from product document when needed
        mrp: product.mrp || 0,
        sellingPrice: product.sellingPrice || 0,
        discount: product.discount || 0,
        youSave: product.youSave || 0,
        generatedPrompt,
        status: 'pending',
        createdAt: FB.serverTimestamp()
      };
      
      const docRef = FB.docRef('campaignItems', `${_currentCampaign.id}_${product.id}_${Date.now()}`);
      batch.set(docRef, campaignItemData);
    }
    
    await batch.commit();
    
    // Clear selection and reload
    _selectedProductIds.clear();
    showToast('Campaign started successfully');
    
    // Switch to campaign view
    document.getElementById('product-selection').style.display = 'none';
    document.getElementById('campaign-tabs').style.display = 'flex';
    document.getElementById('campaign-items-grid').style.display = 'grid';
    
    await loadCampaignItems();
    switchCampaignTab('pending');
    
  } catch (error) {
    console.error('Error starting campaign:', error);
    showToast('Failed to start campaign');
  }
}

/**
 * Build prompt from campaign template and product values
 */
function buildGeneratedPrompt(template, product) {
  if (!template) return '';
  return template
    .replace(/\{\{PRODUCT_NAME\}\}/g, product.productName || '')
    .replace(/\{\{MRP\}\}/g, product.mrp || 0)
    .replace(/\{\{SALE_PRICE\}\}/g, product.sellingPrice || 0)
    .replace(/\{\{DISCOUNT\}\}/g, product.discount || 0)
    .replace(/\{\{YOU_SAVE\}\}/g, product.youSave || 0);
}

async function getLatestProductData(productId) {
  try {
    const productDoc = await FB.getDoc(FB.docRef('products', productId));
    if (!productDoc.exists()) return null;
    return { id: productDoc.id, ...productDoc.data() };
  } catch (error) {
    console.error('Error fetching latest product data:', error);
    return null;
  }
}

/**
 * Regenerate only pending campaign items when campaign prompt updates
 */
async function regeneratePendingCampaignItems(campaignId, promptTemplate) {
  try {
    const itemsQuery = FB.query(
      FB.col('campaignItems'),
      FB.where('campaignId', '==', campaignId),
      FB.where('status', '==', 'pending')
    );
    const snapshot = await FB.getDocs(itemsQuery);

    if (snapshot.empty) return;

    const updates = [];
    snapshot.forEach(doc => {
      updates.push({ id: doc.id, data: doc.data() });
    });

    const chunks = [];
    for (let i = 0; i < updates.length; i += 500) {
      chunks.push(updates.slice(i, i + 500));
    }

    for (const chunk of chunks) {
      const batch = FB.writeBatch();
      for (const item of chunk) {
        const data = item.data;
        const latestProduct = await getLatestProductData(data.productId);
        const productData = latestProduct || {
          productName: data.productName || '',
          mrp: data.mrp || 0,
          sellingPrice: data.sellingPrice || 0,
          discount: data.discount || 0,
          youSave: data.youSave || 0
        };
        const regeneratedPrompt = buildGeneratedPrompt(promptTemplate, productData);
        const updatePayload = {
          generatedPrompt: regeneratedPrompt,
          updatedAt: FB.serverTimestamp()
        };
        if (latestProduct && latestProduct.productName) {
          updatePayload.productName = latestProduct.productName;
        }
        batch.update(FB.docRef('campaignItems', item.id), updatePayload);
      }
      await batch.commit();
    }
  } catch (error) {
    console.error('Error regenerating pending campaign items:', error);
  }
}

/**
 * Load campaign items
 */
async function loadCampaignItems() {
  if (!_currentCampaign) return;
  
  try {
    const q = FB.query(
      FB.col('campaignItems'),
      FB.where('campaignId', '==', _currentCampaign.id),
      FB.orderBy('createdAt', 'desc')
    );
    const snapshot = await FB.getDocs(q);
    
    _campaignItems = [];
    snapshot.forEach(doc => {
      _campaignItems.push({ id: doc.id, ...doc.data() });
    });
    
    // Update tab counts
    const pendingCount = _campaignItems.filter(item => item.status === 'pending').length;
    const generatingCount = _campaignItems.filter(item => item.status === 'generating').length;
    const completedCount = _campaignItems.filter(item => item.status === 'completed').length;
    
    document.getElementById('pending-count').textContent = pendingCount;
    document.getElementById('generating-count').textContent = generatingCount;
    document.getElementById('completed-count').textContent = completedCount;
    
  } catch (error) {
    console.error('Error loading campaign items:', error);
    showToast('Failed to load campaign items');
  }
}

/**
 * Switch campaign tab
 */
function switchCampaignTab(status) {
  _currentActiveTab = status;
  
  // Update tab buttons
  document.querySelectorAll('.campaign-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.status === status);
  });
  
  renderCampaignItems();
}

/**
 * Render campaign items for current tab
 */
async function renderCampaignItems() {
  const container = document.getElementById('campaign-items-grid');
  if (!container) return;
  
  const filteredItems = _campaignItems.filter(item => item.status === _currentActiveTab);
  
  if (filteredItems.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
        </svg>
        <h3>No ${_currentActiveTab} items</h3>
        <p>No items in ${_currentActiveTab} status.</p>
      </div>`;
    return;
  }

  // Get product images for campaign items
  const productIds = [...new Set(filteredItems.map(item => item.productId))];
  const productImages = await getProductImages(productIds);

  container.innerHTML = filteredItems.map(item => {
    const productImage = productImages[item.productId] || '';
    let imageSrc = '';
    if (productImage) {
      imageSrc = getThumbnail(productImage, 140);
    }
    
    return `
      <div class="campaign-item-card" onclick="window.Marketing.openCampaignItem('${item.id}')">
        <div class="campaign-item-image">
          ${imageSrc 
? `
<img
    src="${escapeHtml(imageSrc)}"
    alt="${escapeHtml(item.productName || 'Product')}"
    loading="lazy"
    onerror="this.style.display='none';"
/>
`            : '<div style="display:flex;align-items:center;justify-content:center;color:var(--text3)">No Image</div>'
          }
        </div>
        <div class="campaign-item-name">${escapeHtml(item.productName || 'Untitled Product')}</div>
        <div class="campaign-item-status">
          <span class="status-badge ${item.status}">${item.status.toUpperCase()}</span>
        </div>
        <div class="campaign-item-actions">
          <button class="btn btn-outline btn-sm" onclick="event.stopPropagation(); window.Marketing.openCampaignItem('${item.id}')">
            Open
          </button>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Get product images by product IDs
 */
async function getProductImages(productIds) {
  if (!productIds || productIds.length === 0) {
    return {};
  }

  try {
    const productImages = {};
    
    // Batch fetch products in chunks of 10 (Firestore limit)
    const chunks = [];
    for (let i = 0; i < productIds.length; i += 10) {
      chunks.push(productIds.slice(i, i + 10));
    }

    for (const chunk of chunks) {
      const q = FB.query(
        FB.col('products'),
        FB.where(FB.documentId(), 'in', chunk)
      );
      const snapshot = await FB.getDocs(q);
      
      snapshot.forEach(doc => {
        const data = doc.data();
        productImages[doc.id] = data.imageUrl || '';
      });
    }

    return productImages;

  } catch (error) {
    console.error('Error fetching product images:', error);
    return {};
  }
}

/**
 * Render campaign detail (used when navigating back to campaign)
 */
async function renderCampaignDetail() {
  if (_currentCampaign) {
    await loadCampaignItems(); // FIX: Wait for items to refresh before switching tabs
    switchCampaignTab(_currentActiveTab);
  }
}

/**
 * Open campaign item modal
 */
async function openCampaignItem(itemId) {
  try {
    const item = _campaignItems.find(i => i.id === itemId);
    if (!item) {
      showToast('Campaign item not found');
      return;
    }
    
    _currentCampaignItem = item;
    
    // Fetch the latest product data for accurate prompt generation
    let latestProduct = null;
    let productImage = '';
    if (item.productId) {
      latestProduct = await getLatestProductData(item.productId);
      if (latestProduct) {
        productImage = getResponsive(latestProduct.imageUrl || latestProduct.image || '', 120) || '';
      }
    }
    
    const displayProduct = latestProduct || {
      productName: item.productName || '',
      mrp: item.mrp || 0,
      sellingPrice: item.sellingPrice || 0,
      discount: item.discount || 0,
      youSave: item.youSave || 0
    };
    const regeneratedPrompt = buildGeneratedPrompt(_currentCampaign?.prompt || '', displayProduct);
    const promptToShow = regeneratedPrompt || item.generatedPrompt || '';
    
    if (latestProduct && promptToShow !== item.generatedPrompt) {
      try {
        await FB.updateDoc(FB.docRef('campaignItems', itemId), {
          generatedPrompt: promptToShow,
          productName: latestProduct.productName || item.productName,
          updatedAt: FB.serverTimestamp()
        });
        item.generatedPrompt = promptToShow;
        item.productName = latestProduct.productName || item.productName;
      } catch (error) {
        console.error('Error updating campaign item prompt:', error);
      }
    }
    
    document.getElementById('campaign-item-modal-title').textContent = `${displayProduct.productName || 'Product'} - ${item.status.toUpperCase()}`;
    document.getElementById('campaign-item-image').src = productImage || '';
    document.getElementById('campaign-item-product-name').textContent = displayProduct.productName || 'Untitled Product';
    document.getElementById('campaign-item-status').textContent = item.status;
    document.getElementById('campaign-item-status').className = `status-badge ${item.status}`;
    document.getElementById('campaign-item-prompt').value = promptToShow;
    
    // Show appropriate action buttons based on status
    const markGeneratingBtn = document.getElementById('mark-generating-btn');
    const markCompletedBtn = document.getElementById('mark-completed-btn');
    
    markGeneratingBtn.style.display = item.status === 'pending' ? 'inline-block' : 'none';
    markCompletedBtn.style.display = item.status === 'generating' ? 'inline-block' : 'none';
    
    // Make prompt editable only for pending and generating status
    document.getElementById('campaign-item-prompt').readOnly = item.status === 'completed';
    
    hideAlert('campaign-item-alert');
    openModal('campaign-item-modal');
    
  } catch (error) {
    console.error('Error opening campaign item:', error);
    showToast('Failed to load campaign item details');
  }
}

/**
 * Hide campaign item modal
 */
function hideCampaignItemModal() {
  closeModal('campaign-item-modal');
}

/**
 * Copy prompt to clipboard
 */
async function copyPrompt() {
  const promptTextarea = document.getElementById('campaign-item-prompt');
  const prompt = promptTextarea.value;
  
  if (!prompt) {
    showToast('No prompt to copy');
    return;
  }
  
  try {
    await navigator.clipboard.writeText(prompt);
    showToast('Prompt copied to clipboard');
  } catch (error) {
    // Fallback for older browsers
    promptTextarea.select();
    document.execCommand('copy');
    showToast('Prompt copied to clipboard');
  }
}

/**
 * Mark item as generating
 */
async function markGenerating() {
  if (!_currentCampaignItem || _currentCampaignItem.status !== 'pending') {
    showToast('Invalid status transition');
    return;
  }
  
  await updateCampaignItemStatus('generating');
}

/**
 * Mark item as completed
 */
async function markCompleted() {
  if (!_currentCampaignItem || _currentCampaignItem.status !== 'generating') {
    showToast('Invalid status transition');
    return;
  }
  
  await updateCampaignItemStatus('completed');
}
/**
 * Update campaign item status
 */
async function updateCampaignItemStatus(newStatus) {
  try {
    const updatedPrompt = document.getElementById('campaign-item-prompt').value;
    
    const updateData = {
      status: newStatus,
      updatedAt: FB.serverTimestamp()
    };
    
    // Save updated prompt if changed
    if (updatedPrompt !== _currentCampaignItem.generatedPrompt) {
      updateData.generatedPrompt = updatedPrompt;
    }
    
    // Add completed date for completed status
    if (newStatus === 'completed') {
      updateData.completedAt = FB.serverTimestamp();
    }
    
    await FB.updateDoc(FB.docRef('campaignItems', _currentCampaignItem.id), updateData);
    
    showToast(`Status updated to ${newStatus}`);
    hideCampaignItemModal();
    
    // Reload campaign items and update view
    await loadCampaignItems();
    renderCampaignItems();
    
  } catch (error) {
    console.error('Error updating campaign item status:', error);
    showAlert('campaign-item-alert', 'Failed to update status. Please try again.');
  }
}

// ── UTILITY FUNCTIONS ────────────────────────────────────────

/**
 * Check if user can edit product
 */
function canEditProduct(product) {
  const user = getUser();
  return Boolean(user); // FIX: Allow all logged-in users to add/edit products
}

/**
 * Check if user can delete product
 */
function canDeleteProduct(product) {
  const user = getUser();
  return Boolean(user && isAdmin()); // FIX: Only admins can delete products
}

// ── INITIALIZATION ───────────────────────────────────────────

/**
 * Initialize event listeners when DOM is ready
 */
document.addEventListener('DOMContentLoaded', function() {
  // Product form submission
  const productForm = document.getElementById('product-form');
  if (productForm) {
    productForm.addEventListener('submit', handleProductSubmit);
  }
  
  // Campaign form submission
  const campaignForm = document.getElementById('campaign-form');
  if (campaignForm) {
    campaignForm.addEventListener('submit', handleCampaignSubmit);
  }
  
  // Auto-calculate discount on input change
  const mrpInput = document.getElementById('product-mrp');
  const sellingPriceInput = document.getElementById('product-selling-price');
  
  if (mrpInput && sellingPriceInput) {
    mrpInput.addEventListener('input', calculateDiscount);
    sellingPriceInput.addEventListener('input', calculateDiscount);
  }
});

// ── EXPORTS ──────────────────────────────────────────────────

// Export all functions that need to be accessible from HTML onclick attributes
export {
  renderProducts,
  showAddProduct,
  editProduct,
  deleteProduct,
  onProductImageSelect,
  calculateDiscount,
  hideProductModal,
  renderCampaigns,
  showCreateCampaign,
  hideCampaignModal,
  editCampaign,
  openCampaign,
  renderCampaignProducts,
  toggleProductSelection,
  toggleSelectAll,
  toggleProductCompare,
  startCampaign,
  switchCampaignTab,
  renderCampaignDetail,
  openCampaignItem,
  hideCampaignItemModal,
  copyPrompt,
  markGenerating,
  markCompleted,
  deleteCampaign,
  compareSelectedProducts
};