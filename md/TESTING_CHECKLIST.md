# Testing Checklist - Performance Audit Feature

## Pre-Testing Setup

### Environment Setup
- [ ] Open the application in a browser
- [ ] Open browser DevTools Console (F12)
- [ ] Check for any JavaScript errors on load
- [ ] Verify Firebase is connected

### Test Accounts Required
- [ ] Admin account: kothakulasagar2002@gmail.com
- [ ] Regular user account (any non-admin)

---

## Test Suite 1: Admin - API Key Configuration

### 1.1 Initial State (No API Key)
- [ ] Log in as **Admin**
- [ ] Navigate to **Settings** page
- [ ] Verify "Google APIs" section is **visible**
- [ ] Verify section has **"ADMIN ONLY"** badge
- [ ] Verify API key input is **empty**
- [ ] Verify Status shows **"● Not Configured"** (gray)
- [ ] Verify "Last Updated" is **not shown**
- [ ] Verify "Test Connection" button is **not shown**

### 1.2 Invalid API Key
- [ ] Enter invalid key: `test123`
- [ ] Click **"Save API Key"**
- [ ] Verify **red error alert** appears
- [ ] Verify error message mentions "Invalid API key"
- [ ] Verify key is **not saved** (refresh and check)

### 1.3 Valid API Key
- [ ] Enter your **valid Google PageSpeed API key**
- [ ] Click **"Save API Key"**
- [ ] Verify **loading/validation** occurs
- [ ] Verify **green success alert** appears: "PageSpeed API key saved and validated!"
- [ ] Verify Status changes to **"● Connected"** (green)
- [ ] Verify **"Last Updated"** timestamp appears
- [ ] Verify **"Test Connection"** button now appears
- [ ] Refresh page and verify key persists (masked)

### 1.4 Masked Display
- [ ] After saving, verify API key input shows **asterisks**
- [ ] Verify only **last 4 characters** are visible
- [ ] Click **"Show"** button
- [ ] Verify full key is now visible
- [ ] Verify button text changes to **"Hide"**
- [ ] Click **"Hide"** button
- [ ] Verify key is masked again

### 1.5 Test Connection
- [ ] With valid key saved, click **"Test Connection"**
- [ ] Verify toast appears: "Testing PageSpeed API key..."
- [ ] Wait for result
- [ ] Verify success toast: "✓ PageSpeed API key is valid and working!"

### 1.6 Update Key
- [ ] Change API key to a different valid key
- [ ] Click **"Save API Key"**
- [ ] Verify validation occurs
- [ ] Verify key is updated
- [ ] Verify "Last Updated" timestamp updates

---

## Test Suite 2: Regular User - Settings

### 2.1 API Configuration Not Visible
- [ ] Log out of admin account
- [ ] Log in as **regular user**
- [ ] Navigate to **Settings** page
- [ ] Verify "Google APIs" section is **NOT visible**
- [ ] Verify other settings sections are still visible
- [ ] Verify no console errors

---

## Test Suite 3: SEO Audit Page - Tab Navigation

### 3.1 Tab Structure (Both User Types)
- [ ] Navigate to **SEO Audit** page
- [ ] Verify **two tabs** are visible at top
- [ ] Verify first tab: **"SEO Audit"**
- [ ] Verify second tab: **"Performance"**
- [ ] Verify **"SEO Audit"** tab is active by default

### 3.2 Tab Switching
- [ ] Click **"Performance"** tab
- [ ] Verify Performance tab becomes active (underline/color)
- [ ] Verify SEO Audit tab becomes inactive
- [ ] Verify Performance content is now visible
- [ ] Verify SEO Audit content is hidden
- [ ] Click **"SEO Audit"** tab
- [ ] Verify tabs switch back correctly
- [ ] Verify existing SEO Audit functionality still works

---

## Test Suite 4: Performance Audit - Admin User

### 4.1 Initial State (With API Key)
- [ ] Log in as **Admin** (API key configured)
- [ ] Navigate to **SEO Audit** → **Performance** tab
- [ ] Verify green info box is visible with description
- [ ] Verify **"Website URL"** input field is empty
- [ ] Verify **Strategy** radio buttons (Mobile checked by default)
- [ ] Verify **"Analyze Performance"** button is enabled
- [ ] Verify **"Clear"** button is visible
- [ ] Verify no results are shown

### 4.2 URL Validation
- [ ] Click "Analyze Performance" with **empty URL**
- [ ] Verify red error alert: "Please enter a website URL."
- [ ] Enter invalid URL: `not-a-url`
- [ ] Click "Analyze Performance"
- [ ] Verify error: "Please enter a valid URL..."
- [ ] Enter valid URL without protocol: `google.com`
- [ ] Click "Analyze Performance"
- [ ] Verify error about http:// or https://

### 4.3 Successful Audit (Mobile)
- [ ] Enter valid URL: `https://www.google.com`
- [ ] Select **Mobile** strategy
- [ ] Click **"Analyze Performance"**
- [ ] Verify loading overlay appears
- [ ] Verify overlay title: "Running Performance Audit"
- [ ] Verify 4 steps are listed
- [ ] Watch steps complete one by one (checkmarks)
- [ ] Wait for completion (30-60 seconds)
- [ ] Verify loading overlay disappears
- [ ] Verify success toast appears

### 4.4 Performance Report Display
After successful audit:

**Report Header:**
- [ ] Verify report header shows URL
- [ ] Verify shows strategy: "Mobile"
- [ ] Verify shows current date
- [ ] Verify **"Copy"** button present
- [ ] Verify **"Save to Firebase"** button present

**Score Cards (4 cards):**
- [ ] Verify **Performance** card with score (0-100)
- [ ] Verify **Accessibility** card with score
- [ ] Verify **Best Practices** card with score
- [ ] Verify **SEO** card with score
- [ ] Verify circular progress indicators
- [ ] Verify color coding:
  - Green for 90-100
  - Orange for 50-89
  - Red for 0-49
- [ ] Verify status labels (Good/Needs Improvement/Poor)

**Core Web Vitals:**
- [ ] Verify "Core Web Vitals" card
- [ ] Verify **6 metrics** displayed:
  - Largest Contentful Paint (LCP)
  - Cumulative Layout Shift (CLS)
  - Max Potential FID (INP)
  - First Contentful Paint (FCP)
  - Speed Index
  - Time to First Byte (TTFB)
- [ ] Verify each shows title and value
- [ ] Verify color-coded left border

**Opportunities:**
- [ ] Verify "Opportunities" card
- [ ] Verify list of optimization opportunities
- [ ] Each item shows: title, description, value
- [ ] OR shows "No opportunities found" if perfect

**Diagnostics:**
- [ ] Verify "Diagnostics" card
- [ ] Verify list of diagnostic info
- [ ] Each item shows: title, description, value

**Passed Audits:**
- [ ] Verify "Passed Audits" card
- [ ] Verify grid of passed checks with checkmarks
- [ ] OR shows "No passed audits" if empty

### 4.5 Copy Report
- [ ] Click **"Copy"** button
- [ ] Verify toast: "Report copied!"
- [ ] Paste in text editor (Ctrl+V / Cmd+V)
- [ ] Verify formatted text report with:
  - Header with date, URL, strategy
  - Scores section
  - Core Web Vitals section
  - Opportunities section
  - Diagnostics section

### 4.6 Save to Firebase
- [ ] Click **"Save to Firebase"** button
- [ ] Verify toast: "Performance audit saved to Firebase!"
- [ ] Check browser DevTools → Application → Firestore
- [ ] Verify new document in `pagespeed_audits` collection
- [ ] Verify document contains:
  - uid
  - url
  - strategy
  - scores
  - coreWebVitals
  - timestamp
  - createdAt
  - createdBy

### 4.7 Desktop Strategy
- [ ] Click **"Clear"** button
- [ ] Verify form resets
- [ ] Verify results disappear
- [ ] Enter same URL: `https://www.google.com`
- [ ] Select **Desktop** strategy
- [ ] Click "Analyze Performance"
- [ ] Wait for completion
- [ ] Verify report shows strategy: "Desktop"
- [ ] Verify scores may differ from mobile
- [ ] Compare scores (desktop usually better)

### 4.8 Different URLs
Test with various URLs:
- [ ] E-commerce site (e.g., amazon.com)
- [ ] News site (e.g., bbc.com)
- [ ] Blog (e.g., medium.com)
- [ ] Fast site (e.g., google.com)
- [ ] Slow site (find via PageSpeed)
- [ ] Verify all complete successfully
- [ ] Verify scores vary appropriately

---

## Test Suite 5: Performance Audit - Regular User

### 5.1 With API Key Configured
- [ ] Log in as **regular user**
- [ ] Navigate to **SEO Audit** → **Performance** tab
- [ ] Verify form is visible and functional
- [ ] Enter URL: `https://github.com`
- [ ] Click "Analyze Performance"
- [ ] Verify audit runs successfully
- [ ] Verify results display correctly
- [ ] Verify can save to Firebase
- [ ] Verify can copy report

### 5.2 Without API Key (Fresh Start)
To test this, temporarily remove API key:
- [ ] Log in as **admin**
- [ ] Go to Settings → Google APIs
- [ ] Clear the API key field
- [ ] Save (or delete from Firestore directly)
- [ ] Log out and log in as **regular user**
- [ ] Navigate to Performance tab
- [ ] Enter any URL
- [ ] Click "Analyze Performance"
- [ ] Verify error appears:
  - "Administrator has not configured the Google PageSpeed API Key."
- [ ] Verify red alert is shown
- [ ] Verify user-friendly message
- [ ] **Restore API key** after test

---

## Test Suite 6: Error Handling

### 6.1 Network Errors
- [ ] Open DevTools → Network tab
- [ ] Set throttling to "Offline"
- [ ] Try to run audit
- [ ] Verify error message about network
- [ ] Set back to "Online"

### 6.2 Invalid API Key (Runtime)
- [ ] Admin: Save an invalid key that passes initial validation
- [ ] Try to run audit
- [ ] Verify appropriate error message
- [ ] Restore valid key

### 6.3 Malformed URL
Test various malformed URLs:
- [ ] `http://`
- [ ] `https://`
- [ ] `ftp://example.com`
- [ ] `javascript:alert(1)`
- [ ] Verify all show validation errors

### 6.4 Long URLs
- [ ] Test with very long URL (200+ chars)
- [ ] Verify still works correctly

---

## Test Suite 7: Responsive Design

### 7.1 Mobile View (< 768px)
- [ ] Resize browser to mobile width
- [ ] Navigate to Performance tab
- [ ] Verify tabs stack properly
- [ ] Verify form fields are full width
- [ ] Run an audit
- [ ] Verify score cards show 2 columns
- [ ] Verify Core Web Vitals stack to 1 column
- [ ] Verify Passed Audits stack to 1 column
- [ ] Verify all content is readable
- [ ] Verify buttons are accessible

### 7.2 Tablet View (768-1024px)
- [ ] Resize to tablet width
- [ ] Verify layout adjusts correctly
- [ ] Verify score cards show properly
- [ ] Run an audit
- [ ] Verify results display well

### 7.3 Desktop View (> 1024px)
- [ ] Resize to desktop width
- [ ] Verify full 4-column score layout
- [ ] Verify Core Web Vitals 3-column grid
- [ ] Verify optimal spacing

---

## Test Suite 8: Browser Compatibility

### 8.1 Chrome
- [ ] Test all core functionality
- [ ] Verify no console errors
- [ ] Verify smooth animations

### 8.2 Firefox
- [ ] Test all core functionality
- [ ] Verify no console errors
- [ ] Verify UI renders correctly

### 8.3 Safari (if available)
- [ ] Test all core functionality
- [ ] Verify no console errors
- [ ] Verify ES6 modules work

### 8.4 Edge
- [ ] Test basic functionality
- [ ] Verify no major issues

---

## Test Suite 9: Integration with Existing Features

### 9.1 SEO Audit Tab (Original)
- [ ] Switch to SEO Audit tab
- [ ] Verify all existing fields work
- [ ] Run an SEO audit
- [ ] Verify results display
- [ ] Verify history still works
- [ ] Verify save/export still works
- [ ] Verify no regression

### 9.2 Navigation
- [ ] Navigate between different pages
- [ ] Return to SEO Audit
- [ ] Verify tab state is reset
- [ ] Verify no memory leaks (check DevTools)

### 9.3 Settings Integration
- [ ] Change settings (theme, language)
- [ ] Return to Performance tab
- [ ] Verify settings applied correctly
- [ ] Run audit
- [ ] Verify still works

---

## Test Suite 10: Performance & Security

### 10.1 Performance
- [ ] Run 5 audits in succession
- [ ] Verify each completes
- [ ] Check browser memory usage
- [ ] Verify no memory leaks
- [ ] Verify UI stays responsive

### 10.2 Security
- [ ] Check Firestore security rules
- [ ] Verify users can only read own audits
- [ ] Verify only admin can write to settings/global
- [ ] Verify API key is not exposed in client code
- [ ] Check DevTools → Network
- [ ] Verify API key is sent only to Google API
- [ ] Verify no XSS vulnerabilities (input sanitization)

---

## Test Suite 11: Edge Cases

### 11.1 Very Fast Sites
- [ ] Test with: `https://example.com`
- [ ] Verify scores near 100
- [ ] Verify minimal opportunities
- [ ] Verify many passed audits

### 11.2 Very Slow Sites
- [ ] Test with known slow site
- [ ] Verify low scores (red)
- [ ] Verify many opportunities listed
- [ ] Verify Core Web Vitals all red

### 11.3 Multiple Users Simultaneously
- [ ] Open in two different browsers
- [ ] Log in as different users
- [ ] Both run audits simultaneously
- [ ] Verify both complete successfully
- [ ] Verify results saved separately

### 11.4 Concurrent Audits (Same User)
- [ ] Start an audit
- [ ] While loading, try to start another
- [ ] Verify button is disabled during loading
- [ ] Verify can't double-submit

---

## Test Suite 12: Data Persistence

### 12.1 Saved Audits
- [ ] Save multiple audits
- [ ] Log out
- [ ] Log back in
- [ ] Check Firestore
- [ ] Verify all audits persisted with correct user UID

### 12.2 API Key Persistence
- [ ] Admin: Save API key
- [ ] Log out
- [ ] Log back in
- [ ] Go to Settings
- [ ] Verify key still shows (masked)
- [ ] Verify status still "Connected"

---

## Test Suite 13: UI/UX Polish

### 13.1 Loading States
- [ ] Click "Analyze Performance"
- [ ] Verify button text changes to "Analyzing..."
- [ ] Verify button is disabled during load
- [ ] Verify loading overlay shows immediately
- [ ] Verify steps animate smoothly
- [ ] Verify checkmarks appear on completion

### 13.2 Animations
- [ ] Tab switching has smooth transition
- [ ] Score cards fade in smoothly
- [ ] Circular progress animates
- [ ] Toast notifications slide in/out

### 13.3 Accessibility
- [ ] Tab through form fields with keyboard
- [ ] Verify all interactive elements are reachable
- [ ] Verify Enter key submits form (if applicable)
- [ ] Verify proper focus indicators
- [ ] Check color contrast (DevTools)

---

## Test Suite 14: Documentation

### 14.1 Help Text
- [ ] Verify info box in Performance tab is clear
- [ ] Verify info box in Settings explains API key setup
- [ ] Verify links to Google Cloud Console work
- [ ] Verify error messages are user-friendly

### 14.2 Documentation Files
- [ ] Open PERFORMANCE_AUDIT_FEATURE.md
- [ ] Verify all sections are complete
- [ ] Verify examples are accurate
- [ ] Open QUICK_START_GUIDE.md
- [ ] Verify instructions are clear
- [ ] Follow admin setup steps
- [ ] Verify they work as documented

---

## Final Checklist

### Pre-Deployment
- [ ] All test suites passed
- [ ] No console errors in any browser
- [ ] No console warnings (or documented)
- [ ] All features work as expected
- [ ] Mobile responsive verified
- [ ] Firestore security rules updated
- [ ] API key configured and tested
- [ ] Documentation reviewed

### Code Quality
- [ ] No hardcoded values
- [ ] Comments are clear and accurate
- [ ] Functions are modular and reusable
- [ ] Error handling is comprehensive
- [ ] Code follows project conventions
- [ ] No TODO comments left

### User Experience
- [ ] Loading states are clear
- [ ] Error messages are helpful
- [ ] Success feedback is immediate
- [ ] Forms validate properly
- [ ] Navigation is intuitive
- [ ] Feature is discoverable

### Production Readiness
- [ ] Feature complete as per requirements
- [ ] No breaking changes to existing code
- [ ] Performance is acceptable
- [ ] Security is verified
- [ ] Ready for user acceptance testing

---

## Bug Report Template

If you find issues during testing:

```
**Test Suite:** [Suite number and name]
**Test Case:** [Specific test that failed]
**Browser:** [Chrome/Firefox/Safari/Edge + Version]
**User Type:** [Admin/Regular User]

**Steps to Reproduce:**
1. 
2. 
3. 

**Expected Result:**
[What should happen]

**Actual Result:**
[What actually happened]

**Screenshots:**
[If applicable]

**Console Errors:**
[Copy any errors from DevTools console]

**Additional Context:**
[Any other relevant information]
```

---

## Testing Sign-Off

**Tester Name:** ___________________  
**Date:** ___________________  
**Test Environment:** ___________________  
**Overall Status:** ⬜ PASS  ⬜ FAIL  ⬜ PASS WITH ISSUES  

**Notes:**
________________________________________
________________________________________
________________________________________

**Approved for Production:** ⬜ YES  ⬜ NO  

**Approver:** ___________________  
**Date:** ___________________
