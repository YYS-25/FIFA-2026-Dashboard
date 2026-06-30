// firebase-config.js - Firebase initialization for bracket predictions (match_80+)
//
// Loaded via the Firebase compat SDK (see index.html script tags) so it
// works as a plain global script alongside the rest of the dashboard - no
// bundler or ES modules required, consistent with the rest of this app.
//
// TODO(setup): replace FIREBASE_CONFIG below with your real project's
// values - Firebase console -> Project settings -> General -> Your apps ->
// SDK setup and configuration. These values are safe to expose publicly;
// Firestore security rules (see firestore.rules) are what actually protect
// the data, not secrecy of this config.
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDLqO52tJCXfGj336qrfx03S-7A7JV5ExM",
  authDomain: "fifa-26-23027.firebaseapp.com",
  projectId: "fifa-26-23027",
  storageBucket: "fifa-26-23027.firebasestorage.app",
  messagingSenderId: "325636933702",
  appId: "1:325636933702:web:6be89f48d0cdd480bba247",
};

let firestoreDb = null;

/**
 * Lazily initialize and return the Firestore handle. Safe to call
 * repeatedly - only initializes the Firebase app once.
 *
 * Returns null (rather than attempting a connection) while the config is
 * still the placeholder - the Firebase SDK doesn't fail gracefully against
 * a nonsense project ID, so callers must treat null as "not configured yet"
 * and skip Firestore entirely instead of calling through to it.
 * @returns {firebase.firestore.Firestore|null}
 */
function getFirestoreDb() {
  if (firestoreDb) return firestoreDb;

  if (typeof firebase === "undefined") {
    console.error("Firebase SDK not loaded - check the script tags in index.html");
    return null;
  }

  if (FIREBASE_CONFIG.apiKey === "REPLACE_ME") {
    console.warn(
      "Firebase config is still a placeholder - bracket predictions won't save until dashboard/firebase-config.js is filled in with a real project's config."
    );
    return null;
  }

  firebase.initializeApp(FIREBASE_CONFIG);
  firestoreDb = firebase.firestore();
  return firestoreDb;
}
