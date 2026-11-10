
/*
 * JDIGITALSRENTAL — VISITOR TRACKER V1
 *
 * Customer website only.
 * No rental or payment records modified.
 *
 * Tracks one visit per browser session.
 * Uses Firestore server timestamps.
 */

(function () {
  "use strict";

  const COLLECTION = "websiteVisits";
  const VISITOR_KEY = "jdr_visitor_id_v1";
  const SESSION_KEY = "jdr_session_id_v1";
  const SENT_KEY = "jdr_visit_sent_v1";

  function makeId() {
/*
 * JDIGITALSRENTAL VISITOR TRACKER V2
 * Firebase Modular SDK
 * Customer website only
 */

import {
  initializeApp,
  getApps
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";

import {
  getFirestore,
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDYxovJjUSbgiAPLbsNPpcUbrSCISnejqY",
  authDomain: "jdigitalrental.firebaseapp.com",
  projectId: "jdigitalrental",
  storageBucket: "jdigitalrental.firebasestorage.app",
  messagingSenderId: "611741872259",
  appId: "1:611741872259:web:01b3c2bec73d078999ebb6"
};

const app = getApps().find(
  item => item.name === "[DEFAULT]"
) || initializeApp(firebaseConfig);

const db = getFirestore(app);

async function trackVisitor() {
  try {
    const visitorKey = "jdrVisitorIdV2";
    const sessionKey = "jdrSessionIdV2";
    const sentKey = "jdrVisitSentV2";

    let visitorId = localStorage.getItem(visitorKey);
    if (!visitorId) {
      visitorId = crypto.randomUUID();
      localStorage.setItem(visitorKey, visitorId);
    }

    let sessionId = sessionStorage.getItem(sessionKey);
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      sessionStorage.setItem(sessionKey, sessionId);
    }

    if (sessionStorage.getItem(sentKey) === sessionId) {
      return;
    }

    await setDoc(
      doc(db, "websiteVisits", sessionId),
      {
        visitorId,
        sessionId,
        createdAt: serverTimestamp()
      }
    );

    sessionStorage.setItem(sentKey, sessionId);

    console.log("JDigitalsRental visit recorded");

  } catch (error) {
    console.error("Visitor tracking error:", error);
  }
}

trackVisitor();

    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      return crypto.randomUUID();
    }

    return null;
  }

  function getOrCreate(storage, key) {
    let value = storage.getItem(key);

    if (!value) {
      value = makeId();

      if (!value) return null;

      storage.setItem(key, value);
    }

    return value;
  }

  async function trackVisit() {
    if (
      !window.firebase ||
      !firebase.apps ||
      !firebase.apps.length ||
      typeof firebase.firestore !== "function"
    ) {
      console.warn(
        "Visitor Tracker: Firebase not ready."
      );
      return;
    }

    let visitorId;
    let sessionId;

    try {
      visitorId = getOrCreate(
        localStorage,
        VISITOR_KEY
      );

      sessionId = getOrCreate(
        sessionStorage,
        SESSION_KEY
      );

      if (!visitorId || !sessionId) return;

      if (sessionStorage.getItem(SENT_KEY) === sessionId) {
        return;
      }
    } catch (error) {
      console.warn(
        "Visitor Tracker: Browser storage unavailable.",
        error
      );
      return;
    }

    try {
      const db = firebase.firestore();

      await db.collection(COLLECTION)
        .doc(sessionId)
        .set({
          visitorId: visitorId,
          sessionId: sessionId,
          createdAt:
            firebase.firestore.FieldValue.serverTimestamp()
        });

      sessionStorage.setItem(
        SENT_KEY,
        sessionId
      );

      console.log(
        "JDigitalsRental: Visit recorded."
      );
    } catch (error) {
      console.warn(
        "Visitor Tracker: Unable to record visit.",
        error
      );
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      trackVisit,
      { once: true }
    );
  } else {
    trackVisit();
  }
})();
