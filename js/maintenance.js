/**
 * maintenance.js - Admin-controlled application maintenance mode.
 * The public index/landing page is intentionally unaffected.
 */

import { FB } from './firebase.js';
import { isAdmin } from './auth.js';
import { showToast } from './ui.js';

const CONFIG_PATH = 'appConfig';
const CONFIG_ID = 'maintenance';
const DEFAULT_MESSAGE = 'Abra Zylo is temporarily unavailable while we complete scheduled maintenance. Please try again shortly.';

export async function getState() {
  try {
    const snap = await FB.getDoc(FB.docRef(CONFIG_PATH, CONFIG_ID));
    if (!snap.exists()) return { enabled: false, message: DEFAULT_MESSAGE };
    const data = snap.data() || {};
    return { enabled: data.enabled === true, message: data.message || DEFAULT_MESSAGE, updatedAt: data.updatedAt };
  } catch (error) {
    console.warn('[Abra Zylo] Maintenance status could not be checked:', error.message);
    return { enabled: false, message: DEFAULT_MESSAGE, error };
  }
}

export async function setEnabled(enabled, message = DEFAULT_MESSAGE) {
  if (!isAdmin()) throw new Error('Only the Abra Zylo administrator can change maintenance mode.');
  await FB.setDoc(FB.docRef(CONFIG_PATH, CONFIG_ID), {
    enabled: Boolean(enabled),
    message: message.trim() || DEFAULT_MESSAGE,
    updatedAt: FB.serverTimestamp(),
    updatedBy: FB.auth.currentUser?.uid || ''
  }, { merge: true });
  return { enabled: Boolean(enabled), message: message.trim() || DEFAULT_MESSAGE };
}

export function showScreen(message = DEFAULT_MESSAGE) {
  const screen = document.getElementById('maintenance-screen');
  const messageEl = document.getElementById('maintenance-message');
  if (messageEl) messageEl.textContent = message;
  if (screen) screen.style.display = 'flex';
  document.body.classList.add('maintenance-active');
}

export function hideScreen() {
  const screen = document.getElementById('maintenance-screen');
  if (screen) screen.style.display = 'none';
  document.body.classList.remove('maintenance-active');
}

export async function toggleFromAdmin(enabled) {
  try {
    await setEnabled(enabled);
    showToast(enabled ? 'Maintenance mode enabled for all non-admin users.' : 'Maintenance mode disabled.');
    return true;
  } catch (error) {
    showToast(`Maintenance update failed: ${error.message}`);
    return false;
  }
}
