import { cleanFacts, toChecklist } from './seo-quality.js';

// Inject Firestore so version/conflict handling can be tested without live data.
export function createSeoStore(FB) {
  const keyFor = (id, lang) => `seo_${id}_${lang || 'en'}`;
  async function read(productId, lang) {
    const snap = await FB.getDoc(FB.docRef('SEO_History', keyFor(productId, lang)));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  }
  async function save(result, { uid, status = 'draft', expectedRevision, reviewer = '', note = '' }) {
    if (!uid || !result.productId) throw new Error('Sign in and select a product before saving.');
    if (!['draft','in_review','approved'].includes(status)) throw new Error('Invalid review status.');
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) throw new Error('Reload the latest saved version before saving.');
    const key = keyFor(result.productId, result.lang);
    const ref = FB.docRef('SEO_History', key);
    const archiveRef = FB.newDocRef('SEO_History');
    return FB.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const previous = snap.exists() ? snap.data() : null;
      const actual = Number(previous?.revision || 0);
      if (actual !== expectedRevision) throw new Error('Another session changed this SEO record. Reopen the latest version from History before saving. Your on-screen work is preserved.');
      const revision = actual + 1;
      if (previous) tx.set(archiveRef, { ...previous, historyId: archiveRef.id, isArchive: true, archivedAt: FB.serverTimestamp() });
      const payload = {
        historyId: key, productId: result.productId, language: result.lang || 'en',
        revision, isArchive: false, workflowStatus: status, generatedBy: uid,
        generatedAt: FB.serverTimestamp(), aiModel: String(result.provider || ''),
        verifiedFacts: cleanFacts(result.verifiedFacts), seoChecklist: toChecklist(result),
        missingInformation: (Array.isArray(result.missing_information) ? result.missing_information : []).map(String),
        restoredFrom: String(result.restoredFrom || ''), changeNote: String(note || '').slice(0, 2000),
        reviewedBy: status === 'approved' ? uid : '', reviewerName: status === 'approved' ? reviewer : '',
        reviewedAt: status === 'approved' ? FB.serverTimestamp() : null
      };
      tx.set(ref, payload);
      tx.update(FB.docRef('products', result.productId), {
        generationStatus: 'Completed', verifiedFacts: cleanFacts(result.verifiedFacts), updatedAt: FB.serverTimestamp()
      });
      return { ...payload, id: key };
    });
  }
  return { read, save };
}
