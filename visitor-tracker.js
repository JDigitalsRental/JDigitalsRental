/* JDIGITALSRENTAL VISITOR TRACKER V4
   Keeps V3 visit IDs; adds presence and game detail click events.
   Does not access rental, payment or waiting-list records.
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
let visitorId, sessionId;
try {
  visitorId = getId(localStorage, visitorKey);
  sessionId = getId(sessionStorage, sessionKey);
} catch (err) { console.warn('Visitor storage unavailable', err); }

async function recordVisit() {
  if (!visitorId || !sessionId || sessionStorage.getItem(sentKey) === sessionId) return;
  try {
    await setDoc(doc(db, 'websiteVisits', sessionId), {
      visitorId, sessionId, createdAt: serverTimestamp()
    });
    sessionStorage.setItem(sentKey, sessionId);
    console.log('JDigitalsRental visit recorded');
  } catch (err) {
    // A previous V3 visit may already exist for this session; no overwrite is attempted.
    console.warn('Visit write not completed (possibly already recorded):', err.code || err);
  }
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

// Only record a view when a game ID is explicitly present in the markup.
// Example supported markup: <button data-game-id="phantom-blade-zero">View Details</button>
// or a parent card with data-game-id="phantom-blade-zero".
function findGameId(button) {
  const card = button.closest('[data-game-id], [data-gameid]');
  const raw = button.dataset.gameId || button.dataset.gameid ||
    (card && (card.dataset.gameId || card.dataset.gameid)) || '';
  const id = raw.trim();
  return id.length > 0 && id.length <= 100 ? id : null;
}

let lastViewKey = '', lastViewAt = 0;
document.addEventListener('click', async event => {
  const button = event.target.closest('button, a, [role="button"]');
  if (!button || !sessionId) return;
  const label = (button.textContent || '').trim();
  if (!/view details/i.test(label)) return;
  const gameId = findGameId(button);
  if (!gameId) {
    console.info('Game view not tracked: add data-game-id to the View Details button or game card.');
    return;
  }
  const now = Date.now();
  if (lastViewKey === gameId && now - lastViewAt < 1500) return;
  lastViewKey = gameId; lastViewAt = now;
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
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') recordPresence(); });
window.addEventListener('focus', recordPresence);
