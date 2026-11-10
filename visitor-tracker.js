/* JDIGITALSRENTAL VISITOR TRACKER V5
   Visit sessions, approximate presence, and game detail views.
   No rental, finance, PSN account, or waiting-list access.
*/
import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getFirestore, doc, setDoc, addDoc, collection, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDYxovJjUSbgiAPLbsNPpcUbrSCISnejqY',
  authDomain: 'jdigitalrental.firebaseapp.com',
  projectId: 'jdigitalrental',
  storageBucket: 'jdigitalrental.firebasestorage.app',
  messagingSenderId: '611741872259',
  appId: '1:611741872259:web:01b3c2bec73d078999ebb6'
};
const app = getApps().find(a => a.name === '[DEFAULT]') || initializeApp(firebaseConfig);
const db = getFirestore(app);
const visitorKey = 'jdrVisitorIdV3';
const sessionKey = 'jdrSessionIdV3';
const sentKey = 'jdrVisitSentV3';

function getId(storage, key) {
  let id = storage.getItem(key);
  if (!id) { id = crypto.randomUUID(); storage.setItem(key, id); }
  return id;
}
let visitorId = null, sessionId = null;
try {
  visitorId = getId(localStorage, visitorKey);
  sessionId = getId(sessionStorage, sessionKey);
} catch (err) { console.warn('Visitor storage unavailable:', err); }

async function recordVisit() {
  if (!visitorId || !sessionId) return;
  try {
    if (sessionStorage.getItem(sentKey) === sessionId) return;
    await setDoc(doc(db, 'websiteVisits', sessionId), {
      visitorId, sessionId, createdAt: serverTimestamp()
    });
    sessionStorage.setItem(sentKey, sessionId);
    console.log('JDigitalsRental visit recorded');
  } catch (err) { console.warn('Visit tracking:', err.code || err); }
}

let lastPresenceAttempt = 0;
async function recordPresence() {
  if (!sessionId || document.visibilityState !== 'visible') return;
  const now = Date.now();
  if (now - lastPresenceAttempt < 60000) return;
  lastPresenceAttempt = now;
  try {
    await setDoc(doc(db, 'visitorPresence', sessionId), {
      sessionId, lastSeen: serverTimestamp()
    });
  } catch (err) { console.warn('Presence tracking:', err.code || err); }
}

function slugify(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function gameList() {
  try {
    if (Array.isArray(window.games)) return window.games;
    if (typeof games !== 'undefined' && Array.isArray(games)) return games;
  } catch (_) {}
  return [];
}

function findGameId(button) {
  const card = button.closest('[data-game-id], [data-gameid], .game-card');
  const raw = button.dataset.gameId || button.dataset.gameid ||
    (card && (card.dataset.gameId || card.dataset.gameid)) || '';
  if (raw && raw.trim().length <= 100) return raw.trim();

  // Current site: the View Details button is inside a .game-card,
  // whose .game-info h3 contains the game's displayed name.
  const nameElement = card && card.querySelector('.game-info h3, h3');
  const name = nameElement && nameElement.textContent.trim();
  if (!name) return null;

  // Prefer the canonical ID from the game's catalog when accessible.
  const match = gameList().find(g =>
    g && String(g.name || g.title || '').trim().toLowerCase() === name.toLowerCase()
  );
  const id = match && (match.id || match.gameId) || slugify(name);
  return typeof id === 'string' && id.length > 0 && id.length <= 100 ? id : null;
}

let lastViewKey = '', lastViewAt = 0;
document.addEventListener('click', async event => {
  const target = event.target;
  if (!(target instanceof Element) || !sessionId) return;
  const button = target.closest('button, a, [role="button"]');
  if (!button || !/view details/i.test((button.textContent || '').trim())) return;
  const gameId = findGameId(button);
  if (!gameId) {
    console.warn('Game view not tracked: no game ID or game card title found.');
    return;
  }
  const now = Date.now();
  if (lastViewKey === gameId && now - lastViewAt < 1500) return;
  lastViewKey = gameId;
  lastViewAt = now;
  try {
    await addDoc(collection(db, 'gameDetailViews'), {
      gameId, sessionId, createdAt: serverTimestamp()
    });
    console.log('Game detail view recorded:', gameId);
  } catch (err) { console.warn('Game detail tracking:', err.code || err); }
});

recordVisit();
recordPresence();
setInterval(recordPresence, 60000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') recordPresence();
});
window.addEventListener('focus', recordPresence);
