# Abra Zylo storefront demo

Responsive buildless HTML/CSS/JavaScript demo. Open via a static HTTP server or GitHub Pages. The site lives independently from the SEO generator.

## Features
Search suggestions, filters and sorting; product detail and variant selection;
sample size chart; pincode delivery/COD simulation; stock validation; wishlist;
local stock alerts; atomic bundle addition; cart quantities; first-order/referral
discounts; loyalty point redemption; guest checkout; payment failure/retry;
order tracking/status simulation; cancellation; returns; delivered-purchase
reviews; repeat purchase; referral link; local demo admin; shoppable animated
photo stories; social sharing; navigation language previews; web app manifest
and offline cache.

No real payments, messages, deliveries, accounts or backend writes. All visitor
activity is localStorage-based and isolated per browser. Use sample personal
details. Footer Reset removes local demo activity. AI-generated sample product
photography is illustrative, not proof of an actual product or material.

## Production work
Replace sample catalogue, imagery, reviews and policies with verified assets.
Implement secure authentication/authorization, server-side orders/inventory,
idempotent verified payment callbacks, courier serviceability and tracking,
consented notifications, review moderation, rewards/referral anti-abuse controls,
full translations with language-specific URLs and SEO, production analytics and
Merchant Center/product schema from accurate catalogue data. The public admin
control room is a local-only demo, not a protected production admin.

## Verify
Node 20+: `node --test tests.mjs`. No dependencies or build step.
The source is intentionally noindex to keep illustrative products out of search.
