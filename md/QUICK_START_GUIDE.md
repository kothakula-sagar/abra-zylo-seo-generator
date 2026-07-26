# Quick Start Guide - Performance Audit Feature

## For Administrators

### Step 1: Get Google PageSpeed API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new project or select existing one
3. Click **"Enable APIs and Services"**
4. Search for **"PageSpeed Insights API"**
5. Click **Enable**
6. Go to **Credentials** → **Create Credentials** → **API Key**
7. Copy the API key (starts with `AIza`)

### Step 2: Configure API Key in Portal

1. Log in as **Administrator** (kothakulasagar2002@gmail.com)
2. Navigate to **Settings** page
3. Scroll to **"Google APIs"** section (Admin Only)
4. Paste your API key in the input field
5. Click **"Save API Key"**
6. Wait for validation (tests with example.com)
7. Verify **Status: ● Connected** appears

### Step 3: Test the Feature

1. Navigate to **SEO Audit** page
2. Click **"Performance"** tab
3. Enter a website URL (e.g., `https://google.com`)
4. Select **Mobile** or **Desktop**
5. Click **"Analyze Performance"**
6. Wait 30-60 seconds for analysis
7. View comprehensive performance report

## For Regular Users

### How to Use Performance Audit

1. Log in to the portal
2. Navigate to **SEO Audit** page
3. Click **"Performance"** tab

**If API is configured:**
4. Enter website URL
5. Choose Mobile or Desktop
6. Click "Analyze Performance"
7. Wait for results
8. Save to Firebase or Copy report

**If API is NOT configured:**
- You'll see: *"Administrator has not configured the Google PageSpeed API Key."*
- Contact administrator to set up the API key

## Understanding the Results

### Score Ranges
- **90-100 (Green)**: Good - Site performs well
- **50-89 (Orange)**: Needs Improvement - Some issues to fix
- **0-49 (Red)**: Poor - Significant performance problems

### Main Metrics

#### Performance
Overall speed and loading performance score.

#### Accessibility
How accessible your site is to users with disabilities.

#### Best Practices
Modern web development best practices compliance.

#### SEO
Search engine optimization score for technical SEO.

### Core Web Vitals

| Metric | Description | Good |
|--------|-------------|------|
| **LCP** | Largest Contentful Paint - Loading performance | < 2.5s |
| **CLS** | Cumulative Layout Shift - Visual stability | < 0.1 |
| **FCP** | First Contentful Paint - First render | < 1.8s |
| **TTFB** | Time to First Byte - Server response | < 600ms |
| **Speed Index** | How quickly content visually loads | < 3.4s |

### Report Sections

#### 🎯 Opportunities
Specific improvements to make your site faster. Each shows:
- What to fix
- Estimated time savings
- Priority level

#### 🔍 Diagnostics
Additional information about your page:
- Total page size
- Number of requests
- DOM size
- JavaScript execution time

#### ✅ Passed Audits
Things your site is already doing well.

## Common Tasks

### Save an Audit
1. Complete a performance audit
2. Click **"Save to Firebase"** button
3. Audit saved to your history

### Copy Report
1. Complete a performance audit
2. Click **"Copy"** button
3. Report copied to clipboard as text

### Compare Desktop vs Mobile
1. Run audit with **Mobile** selected
2. Note the scores
3. Click **"Clear"**
4. Run audit again with **Desktop** selected
5. Compare the results

## Troubleshooting

### "Administrator has not configured the API Key"
**Solution**: Contact your administrator to set up the Google PageSpeed API key in Settings.

### "Invalid API key" error
**Admin Solution**: 
1. Verify key is correct in Google Cloud Console
2. Ensure PageSpeed Insights API is enabled
3. Check API key restrictions (if any)
4. Try generating a new key

### Audit takes too long
**Normal**: Google PageSpeed audits typically take 30-60 seconds. The system is analyzing your entire page with Lighthouse.

### Scores different from PageSpeed website
**Normal**: Scores can vary slightly due to:
- Server response time variations
- Network conditions
- Test location differences
- Cache state

### Mobile vs Desktop scores very different
**Expected**: Mobile scores are usually lower because:
- Mobile networks are slower
- Mobile devices have less processing power
- Mobile thresholds are stricter

## Best Practices

### When to Run Audits

✅ **Good times to audit:**
- After deploying changes
- When optimizing site performance
- Before major launches
- Monthly performance checks
- After adding new features

❌ **Avoid auditing:**
- During high traffic periods (results may be worse)
- Immediately after deployment (wait for caches)
- With dev/staging URLs (may have different performance)

### Interpreting Results

1. **Focus on mobile first** - Most traffic comes from mobile
2. **Prioritize red/orange opportunities** - Biggest impact
3. **Track trends over time** - Save audits to monitor progress
4. **Don't obsess over 100** - 90+ is excellent
5. **Fix Core Web Vitals first** - Biggest user experience impact

### Common Issues & Fixes

| Issue | Quick Fix |
|-------|-----------|
| Slow LCP | Optimize images, improve server response |
| High CLS | Set image dimensions, avoid dynamic content |
| Slow FCP | Reduce render-blocking resources |
| Large page size | Compress images, minify CSS/JS |
| Many requests | Combine files, use HTTP/2 |

## Advanced Usage

### Regular Performance Monitoring

1. Create baseline audit (first audit)
2. Save to Firebase
3. Make optimizations
4. Run new audit
5. Compare scores
6. Repeat monthly

### Team Workflow

1. **Developer** makes changes
2. **QA** runs performance audit
3. If scores drop significantly, investigate
4. **Admin** reviews saved audit history
5. Track performance trends over time

### API Key Management

#### Creating Restricted Keys (Recommended)
1. In Google Cloud Console
2. Edit API key
3. Add **Application restrictions**:
   - HTTP referrers: `your-domain.com/*`
4. Add **API restrictions**:
   - Select "PageSpeed Insights API" only
5. Save restrictions

#### Monitoring Usage
1. Go to Google Cloud Console
2. Navigate to APIs & Services → Dashboard
3. View PageSpeed Insights API usage
4. Monitor quota (free tier: 25,000 queries/day)

## Support

### Getting Help

**For technical issues:**
- Check browser console for errors
- Verify API key is configured
- Test with known-good URL (google.com)
- Contact administrator

**For API issues:**
- Check Google Cloud Console
- Verify API is enabled
- Check quota limits
- Review API restrictions

**For interpretation help:**
- Read Google PageSpeed documentation
- Review Core Web Vitals guide
- Check opportunities descriptions
- Use diagnostics for insights

## Tips & Tricks

### 💡 Pro Tips

1. **Baseline First**: Always run an initial audit before making changes
2. **Mobile Matters**: Focus on mobile performance (it's usually worse)
3. **Real URLs Only**: Test production URLs, not localhost
4. **Compare Competitors**: Audit competitor sites to set benchmarks
5. **Fix Priorities**: Tackle opportunities with highest savings first
6. **Track Progress**: Save audits regularly to monitor improvements
7. **Don't Over-Optimize**: 90+ is excellent, chasing 100 has diminishing returns
8. **Core Web Vitals**: These directly impact Google rankings

### 🎯 Quick Wins

Easy improvements for better scores:
- ✅ Compress images (use WebP format)
- ✅ Enable text compression (gzip/brotli)
- ✅ Minify CSS and JavaScript
- ✅ Use CDN for static assets
- ✅ Implement browser caching
- ✅ Remove unused CSS/JS
- ✅ Lazy load images below fold
- ✅ Use modern image formats

### 📊 Setting Goals

| Site Type | Target Score |
|-----------|-------------|
| Blog/Content | 95+ |
| E-commerce | 85+ |
| Heavy SaaS | 75+ |
| Media/Video | 70+ |

## Resources

### Official Documentation
- [Google PageSpeed Insights](https://pagespeed.web.dev/)
- [Core Web Vitals](https://web.dev/vitals/)
- [Lighthouse Documentation](https://developer.chrome.com/docs/lighthouse/)

### Learning Resources
- [Web.dev Performance](https://web.dev/learn-web-vitals/)
- [Chrome DevTools Performance](https://developer.chrome.com/docs/devtools/performance/)

---

**Need Help?** Contact your administrator or refer to the full documentation in `PERFORMANCE_AUDIT_FEATURE.md`
