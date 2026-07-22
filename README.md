# Abra Zylo - AI SEO Portal

> AI-powered SEO content generator with Real-Time Performance Audit

## 🚀 Features

### Core Features
- **AI SEO Content Generation** - Generate meta titles, descriptions, product copy, and more
- **SEO Audit Tool** - Comprehensive SEO analysis with 11-point validation
- **Real-Time Performance Audit** ⭐ NEW - Google PageSpeed Insights integration
- **Multi-Language Support** - English, Hindi, Telugu
- **Firebase Cloud Sync** - All data synced across devices
- **Admin Account Management** - User approval and role management

### AI Providers Supported
- Groq (Llama 3.3 70B) - Free tier: 14,400 req/day
- Google Gemini
- OpenRouter (200+ models)

### Performance Audit Features ⭐ NEW
- **Google PageSpeed Insights Integration**
- Real-time Lighthouse analysis
- Mobile & Desktop testing
- Core Web Vitals metrics (LCP, CLS, FCP, TTFB, Speed Index, INP)
- Performance, Accessibility, Best Practices, and SEO scores
- Optimization opportunities and diagnostics
- Beautiful visual reports with circular progress indicators
- Save audits to Firebase
- Admin-controlled API key configuration

## 📋 Requirements

- Modern web browser (Chrome, Firefox, Safari, Edge)
- Firebase account
- Google PageSpeed Insights API key (for Performance Audit)
- AI provider API key (Groq/Gemini/OpenRouter)

## 🔧 Setup

### 1. Firebase Setup
1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable Authentication (Email/Password)
3. Enable Firestore Database
4. Update Firebase config in `js/firebase.js`

### 2. Firestore Security Rules
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Users collection
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      allow read: if request.auth != null && 
                     get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    
    // Global settings (API keys) - Admin only
    match /settings/global {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
                      get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    
    // SEO generations
    match /seo_generations/{genId} {
      allow create: if request.auth != null;
      allow read, update, delete: if request.auth != null && 
                                     (resource.data.uid == request.auth.uid || 
                                      get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin');
    }
    
    // SEO audits
    match /seo_audits/{auditId} {
      allow create: if request.auth != null;
      allow read, update, delete: if request.auth != null && 
                                     (resource.data.uid == request.auth.uid || 
                                      get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin');
    }
    
    // PageSpeed audits
    match /pagespeed_audits/{auditId} {
      allow create: if request.auth != null && 
                       request.resource.data.uid == request.auth.uid;
      allow read, update, delete: if request.auth != null && 
                                     (resource.data.uid == request.auth.uid || 
                                      get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin');
    }
  }
}
```

### 3. Google PageSpeed API Key (For Performance Audit)
1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create or select a project
3. Enable "PageSpeed Insights API"
4. Create API key
5. Configure in app: Settings → Google APIs

### 4. AI Provider API Key
Get your API key from:
- **Groq**: [console.groq.com/keys](https://console.groq.com/keys) (FREE - no credit card)
- **Gemini**: [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
- **OpenRouter**: [openrouter.ai](https://openrouter.ai)

## 🎯 Quick Start

### For Administrators

#### Initial Setup
1. Create first admin account (use email: `kothakulasagar2002@gmail.com`)
2. Configure AI provider API key in Settings
3. Configure Google PageSpeed API key in Settings → Google APIs
4. Test Performance Audit feature

#### Managing Users
1. Navigate to Accounts page
2. Approve/Block users
3. Manage roles and permissions

### For Regular Users

#### Generate SEO Content
1. Navigate to "Generate SEO"
2. Upload product image
3. Enter product name and category
4. Click "Generate SEO Content"
5. Review and save

#### Run SEO Audit
1. Navigate to "SEO Audit" → "SEO Audit" tab
2. Enter page details (title, description, content, keyword)
3. Click "Run Audit"
4. Review 11-point checklist
5. Save to Firebase

#### Run Performance Audit ⭐ NEW
1. Navigate to "SEO Audit" → "Performance" tab
2. Enter website URL
3. Select Mobile or Desktop
4. Click "Analyze Performance"
5. Wait 30-60 seconds for results
6. Review scores and recommendations
7. Save to Firebase or copy report

## 📚 Documentation

### User Guides
- **[Quick Start Guide](QUICK_START_GUIDE.md)** - Getting started with Performance Audit
- **[Testing Checklist](TESTING_CHECKLIST.md)** - Comprehensive testing guide

### Technical Documentation
- **[Performance Audit Feature](PERFORMANCE_AUDIT_FEATURE.md)** - Complete technical documentation
- **[Implementation Summary](IMPLEMENTATION_SUMMARY.md)** - Development details
- **[Deployment Guide](DEPLOYMENT_READY.md)** - Production deployment steps

## 🏗️ Architecture

### Frontend
- HTML5, CSS3, JavaScript (ES6 modules)
- No build process required
- Firebase SDK (v10.12.0)

### Backend
- Firebase Authentication
- Firebase Firestore
- Google PageSpeed Insights API

### Project Structure
```
├── css/
│   ├── components.css    # Shared components
│   ├── auth.css          # Authentication pages
│   ├── dashboard.css     # Dashboard
│   ├── generate.css      # SEO generator
│   ├── history.css       # Generation history
│   ├── audit.css         # SEO & Performance audits
│   ├── settings.css      # Settings page
│   └── responsive.css    # Mobile responsive
├── js/
│   ├── firebase.js       # Firebase config
│   ├── auth.js           # Authentication
│   ├── app.js            # Main controller
│   ├── dashboard.js      # Dashboard logic
│   ├── seo-generator.js  # Content generation
│   ├── history.js        # History management
│   ├── audit.js          # SEO & Performance audits
│   ├── pagespeed.js      # PageSpeed API integration ⭐
│   ├── settings.js       # Settings management
│   ├── accounts.js       # User management
│   ├── ai.js             # AI provider integrations
│   ├── ui.js             # UI helpers
│   └── utils.js          # Utility functions
└── index.html            # Single-page app
```

## 🔐 Security

### Authentication
- Firebase Authentication with Email/Password
- Admin role verification
- Access restrictions for pending/blocked users

### API Keys
- Stored server-side in Firestore
- Admin-only write access
- Masked display in UI
- Validated before saving

### Data Access
- Users can only access their own data
- Admin can access all data
- Firestore security rules enforce permissions

## 🎨 Features Breakdown

### Dashboard
- Quick stats overview
- Recent activity feed
- Quick action buttons

### Generate SEO
- Image upload with preview
- Product details form
- Real-time AI generation
- SEO score calculation
- Auto-save high scores (98+)

### History
- View all generations
- Search and filter
- Export to JSON
- Delete management

### SEO Audit
- **SEO Audit Tab:**
  - 11-point SEO validation
  - Title/description length checks
  - Keyword placement analysis
  - Content quality scoring
  - Save audit results

- **Performance Tab:** ⭐ NEW
  - Google PageSpeed integration
  - Real-time Lighthouse analysis
  - 4 main scores (Performance, Accessibility, Best Practices, SEO)
  - Core Web Vitals (LCP, CLS, FCP, TTFB, etc.)
  - Optimization opportunities
  - Diagnostics and passed audits
  - Save and export reports

### Settings
- AI provider API keys
- Google PageSpeed API key (Admin only) ⭐
- Theme (Light/Dark/System)
- Default language
- Default AI provider
- Temperature and token settings
- Profile management

### Accounts (Admin Only)
- View all users
- Approve/Block users
- Role management
- User statistics

## 🌐 Browser Support

- Chrome (recommended)
- Firefox
- Safari
- Edge

## 📱 Responsive Design

- Mobile-first approach
- Breakpoints: 768px (tablet), 1024px (desktop)
- Touch-friendly interface
- Optimized for all screen sizes

## 🚀 Deployment

### Static Hosting (Recommended)
Deploy to any static hosting:
- Firebase Hosting
- Netlify
- Vercel
- GitHub Pages

### Steps
1. Update Firebase config in `js/firebase.js`
2. Deploy all files
3. Configure custom domain (optional)
4. Set up SSL certificate
5. Configure Firebase security rules
6. Add Google PageSpeed API key

See [DEPLOYMENT_READY.md](DEPLOYMENT_READY.md) for detailed steps.

## 🔄 Updates & Changelog

### Version 1.1.0 - Real-Time Performance Audit ⭐
**Added:**
- Google PageSpeed Insights integration
- Performance audit tab in SEO Audit page
- Core Web Vitals tracking
- Mobile and Desktop testing strategies
- Admin-controlled API key configuration
- Beautiful performance reports with circular indicators
- Save audits to Firebase
- Copy reports to clipboard

**Modified:**
- Enhanced Settings page with Google APIs section
- Extended audit.js with performance features
- Improved loading overlay with multi-step progress
- Updated CSS with performance audit styles

**Documentation:**
- Added PERFORMANCE_AUDIT_FEATURE.md
- Added QUICK_START_GUIDE.md
- Added TESTING_CHECKLIST.md
- Added DEPLOYMENT_READY.md
- Updated README.md

## 🐛 Known Issues

- PageSpeed audits can take 30-60 seconds (expected)
- Scores may vary between runs due to network conditions
- Free tier API limits: 25,000 queries/day (Google's limit)

## 🔮 Future Enhancements

- Audit history tab with filtering
- Audit comparison view
- PDF export for performance reports
- Scheduled/recurring audits
- Email notifications
- Custom performance budgets
- Bulk URL analysis
- Webhook integrations

## 👥 Contributing

This is a private project. For issues or suggestions, contact the administrator.

## 📄 License

Proprietary - All rights reserved

## 👤 Author

**Sagar K**
- Email: kothakulasagar2002@gmail.com

## 🙏 Acknowledgments

- Google PageSpeed Insights API
- Firebase Platform
- Groq AI
- Google Gemini
- OpenRouter

---

**Made with ❤️ by Sagar K**