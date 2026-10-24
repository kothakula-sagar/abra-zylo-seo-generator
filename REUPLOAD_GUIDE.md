# Abra Zylo SEO Generator - reviewed-content update

This ZIP updates the existing application. It does not publish changes, send
messages, generate paid AI requests, or change your Firebase project.

## Included in this release

1. **Alt text and short description persistence**: saved, displayed in History,
   restored and included in the existing JSON export. Old records with missing
   fields remain readable; missing text is not invented or backfilled.
2. **Verified product specifications**: brand, material, size, colour, capacity,
   ingredients, warranty, SKU and barcode; source reference and operator
   confirmation. Unknown values can stay blank. Approval requires a source,
   confirmation and at least one specification.
3. **Draft / in review / approved workflow**: generation saves a draft at any
   internal checklist score. Members submit for review; the existing administrator
   can approve after reviewing the content. Approval records reviewer and time,
   but does **not** publish to OpenCart. Any new save/edit/restore needs fresh review.
4. **Version preservation and restore**: each replacement archives the previous
   saved record in `SEO_History` within the same Firestore transaction. History
   shows language, revision and review status. Restore creates a new draft and
   preserves the previous saved state. Competing/stale revisions are rejected.
5. **Catalogue duplicate checks**: duplicate slugs block approval; identical and
   near-identical titles/descriptions are shown for review. Unicode comparison is
   supported. Archives and the same product are excluded. This scans accessible
   `SEO_History` records, not the live website or products without saved SEO.

Also included: generated content editor, saved-version text comparison,
configurable social CTA, natural-length checklist rules, removal of the old
jewellery/filler fallback, and HTML escaping for generated content previews.

## Re-upload to GitHub

1. Keep a backup of the current repository or create a branch first.
2. Extract the ZIP. Open the `abra-zylo-seo-generator` folder.
3. In your existing repository, use **Add file -> Upload files**. Upload the
   **contents** of that folder into the repository root, not a second nested
   `abra-zylo-seo-generator` directory. Preserve each `js/`, `css/`, and `assets/`
   path. GitHub web upload may require separate batches for large folders.
4. Commit. Keep the existing GitHub Pages publishing branch/directory configuration.
5. Wait for the Pages deployment to finish, then hard-refresh the browser.
6. Apply the Firestore rule changes below before relying on admin-only approval.

For a smaller upload, `CHANGED_FILES.txt` lists the files needed for this release.
The ZIP also contains the complete repository so you can replace your local copy.
No `.git` directory or installed dependencies are included.

## Firebase permissions - separate setup step

Uploading GitHub files does **not** deploy Firestore rules. The current production
rules were not available for inspection. Do not assume the approval button alone
enforces administrator permission: the browser is not a security boundary.

1. Back up your current Firestore rules.
2. Review `firestore-seo-review.rules.txt` with your developer.
3. Merge its helpers into the existing database match block and **replace the
   existing `SEO_History` match**. Do not replace unrelated rules or append another
   overlapping broad allow. A recursive `allow write: if signedIn()` would bypass
   the restrictions and must be narrowed deliberately by your developer.
4. Keep the existing approved-user rules for `products`, as saves also update
   that product's verified specifications and generation timestamp/status.
5. Use the Rules Playground or a staging emulator to verify: unauthenticated and
   blocked users cannot read/write; approved members can draft/submit but cannot
   create approved records; only the configured administrator can approve;
   archived records cannot be edited; admin deletion still works.
6. Publish reviewed rules through Firebase Console. These rule changes have not
   been deployed or emulator-tested in this package's offline tests.

The configured administrator email follows the existing app's configuration. If
you change it, update both `js/auth.js` and the corresponding rule helper.

No new collection or composite index is required. Transactions need permission to
read/write the current SEO record, create an archive and update the product. If
permissions fail, the transaction is rolled back and the on-screen work remains.

## Daily use

1. Select or create a product and open **Product specifications & source**.
2. Enter confirmed facts, cite the source and tick confirmation. Changing a fact
   unticks confirmation. Leave unknown facts blank.
3. Generate. A draft is saved automatically; a checklist score is **not** a Google
   ranking prediction and does not indicate factual approval.
4. Review content, including the AI's missing-information warnings. Edit generated
   fields, choose **Apply edits**, compare against the last save, then **Save draft**.
   AI Improve updates are visibly marked unsaved; use Save draft after improving.
5. Run **Check catalogue duplicates**. Fix collisions; review similarity warnings.
6. Submit for review. Administrator checks claims/specifications and approves.
7. Use History to inspect saved content, reviewer, date and revisions. To recover
   an older version, choose **Restore as new draft**; review it again.
8. Copy/export into the store using the existing workflow. Approved content is
   not automatically published. An explicit Save draft demotes approval by design.

## Tests and limitations

Run `npm test` with Node 20+ (Node 24 was used here). No `npm install` is required.
Tests use local DOM/service doubles and an in-memory transaction adapter: no real
users, AI keys, production Firebase records, or catalogue entries are touched.

Verified offline: content round trip, escaping, source/approval checks, duplicate
detection, legacy compatibility, version preservation, stale-revision rejection,
draft restoration, save failure and role checks in the application handlers.

Not verified here: signed-in production Firebase permissions, Rules compilation,
real-device UI layout, live AI responses, or OpenCart publishing. Test a sample
product in staging before your team uses this release in production. AI prompts
reduce inference but cannot guarantee truth; human review remains necessary.

Deferred from the broader wishlist: bulk import/generation, live OpenCart sync,
Product JSON-LD builder, Search Console analytics, Merchant Center integration
and category SEO mode. They are not represented as completed in this release.

Version history increases Firestore storage/read usage. Duplicate checking scans
the SEO collection; for a large catalogue, add a server-maintained current-record
index. Duplicate checking is a review-time scan, not an atomic global slug lock.
