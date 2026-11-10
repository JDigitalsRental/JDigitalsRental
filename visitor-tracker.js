
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
