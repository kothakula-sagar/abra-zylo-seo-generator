# Abra Zylo cache + maintenance mode

## Firebase read reduction

The application now keeps shared marketing datasets in a persistent IndexedDB browser cache:

- `products`
- `saleCampaigns`
- `campaignItems`
- `metaCatalogItems`

Firebase remains the source of truth. A dataset is read from Firestore when the cache is missing or older than the cache window. Normal navigation reuses the local cache instead of downloading the same collection again.

Writes use a write-through approach: after a successful Firebase write, the local cache is updated instead of immediately reading the document back.

The existing Sale Campaign first-open fix is retained. Existing campaign items are loaded before deciding whether to show the product selector.

## Maintenance mode

The admin Accounts page contains a Maintenance Mode switch. It stores the state in:

`appConfig/maintenance`

When enabled:

- non-admin users see the maintenance screen inside the authenticated application
- the public `index.html` landing page remains available
- admin users can continue using the application
- refreshing the application checks maintenance mode again

The included `maintenance-mode.png` is used on the maintenance screen.

## Required Firestore rules

Merge the `appConfig/maintenance` rule from `firestore-whatsapp-marketing.rules.txt` into the existing Firestore rules and publish them. Do not replace unrelated existing rules.

## Browser developer shortcuts

The app includes a light deterrent against casual source inspection: context menu, Ctrl/Cmd+U, and Ctrl/Cmd+Shift+I/J/C are blocked. F12 remains available for Abra Zylo development diagnostics.

This is not a security boundary. Browser-delivered HTML/CSS/JavaScript can never be made secret from a determined user. Real protection must come from Firebase Security Rules and server-side controls.
