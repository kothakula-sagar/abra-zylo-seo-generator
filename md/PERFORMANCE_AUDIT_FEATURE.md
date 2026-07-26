# Real-Time Performance Audit Feature

## Overview
The Real-Time Performance Audit feature integrates Google PageSpeed Insights API into the existing SEO Audit page, allowing users to analyze website performance, accessibility, best practices, and SEO scores in real-time.

## Architecture

### Files Modified
1. **js/pagespeed.js** (NEW) - Core PageSpeed Insights API integration module
2. **js/audit.js** - Extended with Performance tab functionality
3. **js/settings.js** - Added Google APIs configuration section (Admin only)
4. **css/audit.css** - Added Performance audit styles
5. **index.html** - Added Performance tab UI structure

### Firestore Collections

#### 1. `settings/global` Document
Stores the Google PageSpeed Insights API key (Admin only).

```javascript
{
  pageSpeedApiKey: "AIza...",
  updatedAt: Timestamp,
  updatedBy: "user_uid"
}
```

#### 2. `pagespeed_audits` Collection
Stores performance audit results.

```javascript
{
  uid: "user_uid",
  url: "https://example.com",
  strategy: "mobile" | "desktop",
  scores: {
    performance: 85,
    accessibility: 92,
    bestPractices: 88,
    seo: 95
  },
  coreWebVitals: {
    lcp: { value: 2500, displayValue: "2.5 s", score: 0.9, title: "..." },
    cls: { ... },
    inp: { ... },
    fcp: { ... },
    speedIndex: { ... },
    ttfb: { ... }
  },
  opportunitiesCount: 5,
  diagnosticsCount: 8,
  passedCount: 15,
  timestamp: 1234567890,
  createdAt: Timestamp,
  createdBy: "user@example.com"
}
```

## Features

### Admin Configuration (Settings Page)

#### Google APIs Section
- **Visibility**: Admin users only
- **Location**: Settings page, after OpenRouter section
- **Features**:
  - Add/Edit Google PageSpeed Insights API Key
  - Test API key connection
  - View connection status (Connected/Not Configured)
  - Last updated timestamp
  - Masked key display (shows last 4 characters)
  - API key validation on save

#### Getting API Key
1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create or select a project
3. Enable PageSpeed Insights API
4. Create credentials (API Key)
5. Copy and paste into settings

### Performance Audit Tab

#### Location
SEO Audit page → Second tab "Performance"

#### Inputs
- **Website URL**: Full URL to analyze (required)
- **Strategy**: Mobile or Desktop (radio buttons, default: Mobile)

#### Analysis Process
When "Analyze Performance" is clicked:

1. **Validation**: Checks if API key is configured
2. **Loading Overlay**: Shows 4-step progress:
   - Connecting to Google PageSpeed API
   - Running Lighthouse Analysis
   - Collecting Performance Metrics
   - Generating Report
3. **API Call**: Fetches data from Google PageSpeed Insights
4. **Parsing**: Extracts scores, metrics, opportunities, diagnostics
5. **Display**: Renders comprehensive performance report

#### Report Sections

##### 1. Main Scores (4 Cards)
- Performance
- Accessibility
- Best Practices
- SEO

Each card shows:
- Score (0-100)
- Circular progress indicator
- Status label (Good/Needs Improvement/Poor)
- Color-coded (Green ≥90, Orange 50-89, Red <50)

##### 2. Core Web Vitals
- Largest Contentful Paint (LCP)
- Cumulative Layout Shift (CLS)
- Max Potential FID (INP)
- First Contentful Paint (FCP)
- Speed Index
- Time to First Byte (TTFB)

##### 3. Opportunities
Lists performance optimization opportunities:
- Render blocking resources
- Unused CSS
- Unused JavaScript
- Image optimization
- Text compression
- And more...

##### 4. Diagnostics
Additional performance insights:
- Total byte weight
- DOM size
- Critical request chains
- Mainthread work breakdown
- Third-party summary
- And more...

##### 5. Passed Audits
Grid of all checks that passed validation.

#### Actions
- **Copy**: Copies formatted text report to clipboard
- **Save to Firebase**: Stores audit in `pagespeed_audits` collection
- **Clear**: Resets form and hides results

### User Permissions

#### Admin Users
- Configure Google PageSpeed API Key
- Run performance audits
- Save/delete audit results
- View all features

#### Regular Users
- Run performance audits (if API key configured)
- Save audit results
- Cannot edit API key
- See error if API key not configured

### Error Handling

#### No API Key
```
"Administrator has not configured the Google PageSpeed API Key."
```

#### Invalid API Key
```
"Invalid API key: [error message from Google]"
```

#### Network Errors
```
"PageSpeed API error: [error details]"
```

#### Invalid URL
```
"Please enter a valid URL (including http:// or https://)."
```

## Module API

### pagespeed.js

#### `getPageSpeedApiKey()`
Fetches API key from Firestore `settings/global` document.

#### `savePageSpeedApiKey(apiKey)`
Saves API key (Admin only). Returns `true` on success.

#### `validateApiKey(apiKey)`
Validates API key by calling PageSpeed API with test URL.
Returns `{ valid: boolean, error?: string }`.

#### `runPageSpeedAudit(url, strategy)`
Runs PageSpeed audit for given URL and strategy.
Returns parsed audit data object.

#### `saveAuditToFirestore(auditData)`
Saves audit results to `pagespeed_audits` collection.

#### `fetchAuditHistory()`
Fetches user's audit history (last 20 audits).

#### `deleteAuditHistory(docId)`
Deletes audit from history (Admin only).

### audit.js (Extended)

#### `switchAuditTab(tab)`
Switches between 'seo' and 'performance' tabs.

#### `runPerformanceAudit()`
Main function to run performance audit with loading overlay.

#### `savePerformanceAudit()`
Saves current audit to Firestore.

#### `copyPerformanceReport()`
Copies formatted report to clipboard.

#### `clearPerformance()`
Resets performance audit form.

### settings.js (Extended)

#### `savePageSpeedKey()`
Validates and saves PageSpeed API key (Admin only).

#### `testPageSpeedKey()`
Tests current API key connection.

## Styling

### CSS Classes (audit.css)

#### Tab Navigation
- `.audit-tabs` - Tab container
- `.audit-tab-btn` - Tab button
- `.audit-tab-btn.active` - Active tab
- `.audit-tab-content` - Tab content wrapper
- `.audit-tab-content.active` - Active content

#### Performance Scores
- `.perf-scores-grid` - 4-column score grid
- `.perf-score-card` - Individual score card
- `.perf-score-circle` - Circular progress indicator
- `.perf-score-val` - Score number
- `.perf-score-status` - Status label

#### Core Web Vitals
- `.cwv-grid` - Web vitals grid
- `.cwv-item` - Individual metric
- `.cwv-title` - Metric name
- `.cwv-value` - Metric value

#### Lists
- `.perf-item` - Opportunity/diagnostic item
- `.perf-passed-grid` - Passed audits grid
- `.perf-passed-item` - Individual passed audit

#### Settings
- `.badge-admin` - Admin-only badge
- `.ps-status-row` - API status row

## Responsive Design

### Mobile (<768px)
- Score cards: 4 columns → 2 columns
- Core Web Vitals: 3 columns → 1 column
- Passed audits: 2 columns → 1 column
- Tab buttons stack properly

## Security

### API Key Storage
- Stored in Firestore `settings/global` document
- Only accessible by authenticated users
- Admin-only write access
- Masked display in UI (last 4 characters visible)

### Validation
- API key validated before saving
- URL validation before audit
- User authentication checks
- Admin permission checks

### Data Access
- Users can only view their own audits
- Admin can delete any audit
- API key configuration restricted to admin

## Testing

### Manual Testing Checklist

#### Admin User
- [ ] Can see Google APIs section in Settings
- [ ] Can add/edit PageSpeed API key
- [ ] Can test API key connection
- [ ] Can run performance audits
- [ ] Can save audit results
- [ ] Can delete audit history

#### Regular User
- [ ] Cannot see API key configuration
- [ ] Can run performance audits (if configured)
- [ ] Can save audit results
- [ ] Sees error if API key not configured
- [ ] Cannot delete audit history

#### Error Cases
- [ ] Invalid URL shows error
- [ ] Missing API key shows admin message
- [ ] Invalid API key shows validation error
- [ ] Network errors handled gracefully

## Future Enhancements

### Potential Features
1. **Audit History Tab**: Display saved audits with filtering
2. **Comparison View**: Compare audits side-by-side
3. **Scheduled Audits**: Automatic periodic audits
4. **Email Reports**: Send audit results via email
5. **Export PDF**: Download audit as PDF report
6. **Custom Metrics**: Define custom performance budgets
7. **Webhook Integration**: Send audit data to external services
8. **Multi-URL Analysis**: Bulk audit multiple URLs

## Troubleshooting

### Common Issues

#### "API key not configured" error
**Solution**: Admin user must add API key in Settings → Google APIs

#### "Invalid API key" error
**Solution**: Verify API key is correct and PageSpeed API is enabled in Google Cloud Console

#### Slow audit performance
**Solution**: Google PageSpeed API can take 30-60 seconds to complete analysis

#### Scores don't match PageSpeed website
**Solution**: Scores may vary slightly due to:
- Different test times
- Network conditions
- Server response variations

## Code Quality

### Modular Architecture
- Separate module for PageSpeed API (`pagespeed.js`)
- Clean separation of concerns
- Reusable utility functions
- Consistent error handling

### Comments
- Function-level documentation
- Complex logic explained
- Section headers for organization

### Security
- Input validation
- Permission checks
- Secure API key storage
- XSS prevention

### Performance
- Efficient DOM updates
- Minimal re-renders
- Optimized CSS selectors
- Proper loading states

## Conclusion

The Real-Time Performance Audit feature seamlessly integrates Google PageSpeed Insights into the existing SEO Portal, providing users with comprehensive website performance analysis without requiring any backend infrastructure. The feature follows the existing project architecture, maintains code quality standards, and provides a polished user experience.
