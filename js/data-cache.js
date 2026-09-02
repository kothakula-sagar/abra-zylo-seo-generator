/**
 * data-cache.js - Persistent browser cache for shared Firebase datasets.
 * Firebase remains the source of truth. The cache only reduces repeated reads.
 */

const DB_NAME = 'abra-zylo-cache';
const DB_VERSION = 1;
const STORE_NAME = 'datasets';
const DEFAULT_MAX_AGE = 15 * 60 * 1000;
const memory = new Map();
let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      resolve(null);
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
  return dbPromise;
}

function cloneForStorage(value) {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value, (_key, current) => {
      if (current && typeof current.toDate === 'function') {
        return current.toDate().toISOString();
      }
      return current;
    }));
  } catch {
    return value;
  }
}

async function idbGet(key) {
  const db = await openDb();
  if (!db) return null;
  return new Promise(resolve => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

async function idbPut(key, record) {
  const db = await openDb();
  if (!db) return false;
  return new Promise(resolve => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record, key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
    tx.onabort = () => resolve(false);
  });
}

async function idbDelete(key) {
  const db = await openDb();
  if (!db) return false;
  return new Promise(resolve => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
    tx.onabort = () => resolve(false);
  });
}

export async function get(key, options = {}) {
  const maxAge = options.maxAge ?? DEFAULT_MAX_AGE;
  const memoryRecord = memory.get(key);
  const record = memoryRecord || await idbGet(key);
  if (!record) return null;
  if (maxAge >= 0 && Date.now() - record.savedAt > maxAge) return null;
  memory.set(key, record);
  return record.data;
}

export async function set(key, data) {
  const record = { savedAt: Date.now(), data: cloneForStorage(data) };
  memory.set(key, record);
  await idbPut(key, record);
  return data;
}


export async function patchArrayItem(key, id, patch) {
  const data = await get(key, { maxAge: -1 });
  if (!Array.isArray(data)) return false;
  const next = data.map(item => item?.id === id ? { ...item, ...cloneForStorage(patch) } : item);
  await set(key, next);
  return true;
}

export async function remove(key) {
  memory.delete(key);
  await idbDelete(key);
}

export async function clear() {
  memory.clear();
  const db = await openDb();
  if (!db) return;
  await new Promise(resolve => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = resolve;
    tx.onerror = resolve;
    tx.onabort = resolve;
  });
}

export const CACHE_KEYS = Object.freeze({
  products: 'products',
  saleCampaigns: 'saleCampaigns',
  campaignItems: 'campaignItems',
  metaCatalogItems: 'metaCatalogItems'
});
