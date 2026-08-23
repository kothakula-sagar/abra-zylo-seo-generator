# Firestore permissions for Customer Details + WhatsApp Marketing

The browser-side implementation is complete, but Firebase Firestore rules are enforced on the server. The screenshots show `permission-denied`, which means the current Firebase rules do not yet allow the new collections.

The safe fix is to **merge the rules from `firestore-whatsapp-marketing.rules.txt` into your existing Firestore rules**. Do not replace your entire existing rules file because Abra Zylo already uses Firestore for users, products, history, campaigns, catalog data, and other features.

## Collections used

- `customers`
- `whatsappCampaigns`
- `whatsappCampaigns/{campaignId}/recipients`

## Permissions

- Approved members + admin: view customers
- Approved members + admin: add customers
- Approved members + admin: change Interested / Not Interested
- Admin only: delete customers
- Approved members + admin: create/view WhatsApp campaigns
- Approved members + admin: record WhatsApp sent status
- Admin only: delete campaign/recipient documents

## Firebase Console

1. Open Firebase Console for the existing `abra-zylo-seo` project.
2. Open **Firestore Database → Rules**.
3. Keep all existing Abra Zylo rules.
4. Inside the existing `match /databases/{database}/documents` block, add the helper functions and collection match blocks from `firestore-whatsapp-marketing.rules.txt`.
5. Publish the rules.
6. Refresh the app and test **Customer Details → Add Customer**.

The existing application admin email is `kothakulasagar2002@gmail.com`.

For members, their `users/{uid}` document must have `approved: true` and must not have `blocked: true`.
