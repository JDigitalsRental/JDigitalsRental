
/*
 JDIGITALSRENTAL VISITOR TRACKER V3
 Firebase Modular SDK
 Customer website only
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

const app =
  getApps().find(item => item.name === "[DEFAULT]") ||
  initializeApp(firebaseConfig);

const db = getFirestore(app);

async function trackVisitor() {
  try {
    const visitorKey = "jdrVisitorIdV3";
    const sessionKey = "jdrSessionIdV3";
    const sentKey = "jdrVisitSentV3";

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
        visitorId: visitorId,
        sessionId: sessionId,
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
