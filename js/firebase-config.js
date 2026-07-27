/* Questmaster — Firebase bootstrap (ES module, loaded last).
 *
 * Project: questmaster-84341. Config is live; the remaining console steps are
 * listed in the README (enable Google sign-in, create the Firestore database,
 * authorize your domains, publish firestore.rules). Until those are done the
 * app falls back to local mode rather than failing.
 *
 * These values are public by design — a web client cannot hide them. Security
 * comes from firestore.rules plus Google Auth, never from secrecy.
 *
 * Note on the console's snippet: it shows `import ... from "firebase/app"`,
 * which is bare-module syntax that only resolves under a bundler. This app has
 * no build step, so we import the same SDK from its gstatic CDN URLs instead.
 * Same library, same version pinning, no npm.
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getFirestore, doc, getDoc, setDoc, deleteDoc,
  collection, getDocs, writeBatch, onSnapshot,
  runTransaction, arrayUnion, arrayRemove
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  signOut, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

const firebaseConfig = {
  apiKey: 'AIzaSyA13w8qTVxzp-xTVLxLjtSpSUzYQCOoXgM',
  authDomain: 'questmaster-84341.firebaseapp.com',
  projectId: 'questmaster-84341',
  storageBucket: 'questmaster-84341.firebasestorage.app',
  messagingSenderId: '1061446431900',
  appId: '1:1061446431900:web:548da3af3fb602cdbba959'
};

/* Bail out cleanly while the config is still a placeholder, so the shell falls
 * through to local mode instead of throwing an auth/invalid-api-key error and
 * leaving the boot spinner up forever. */
const configured = Object.keys(firebaseConfig).every(
  (k) => firebaseConfig[k] && !String(firebaseConfig[k]).startsWith('PASTE_')
);

if (!configured) {
  console.info('[qm] Firebase not configured — running in local mode. See js/firebase-config.js.');
} else {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const auth = getAuth(app);

  /* The primitives Store's CloudBackend calls through. Passed rather than
   * imported so store.js can stay a classic script. */
  const fb = {
    doc, getDoc, setDoc, deleteDoc, collection, getDocs,
    writeBatch, onSnapshot, runTransaction, arrayUnion, arrayRemove
  };

  /* Popup first, everywhere. On iOS/WebKit signInWithRedirect silently fails
   * when authDomain differs from the page's origin — WebKit partitions the auth
   * handler's storage, so the redirect returns with no session. The popup posts
   * the credential straight back and sidesteps that entirely. Redirect stays as
   * a fallback for environments where a popup genuinely cannot open. */
  function redirectIsBetter(e) {
    const s = (e && (e.code || e.message)) || '';
    return /popup-blocked|operation-not-supported-in-this-environment|web-storage-unsupported/i.test(s);
  }

  window.QMAuth = {
    available: true,
    signIn: async function () {
      const provider = new GoogleAuthProvider();
      try { return await signInWithPopup(auth, provider); }
      catch (e) {
        if (redirectIsBetter(e)) return signInWithRedirect(auth, provider);
        throw e;
      }
    },
    signOut: function () { return signOut(auth); },
    user: function () { return auth.currentUser; }
  };

  /* Surfaces an error from a redirect that completed on page load (e.g. an
   * unauthorized domain) instead of failing silently. */
  getRedirectResult(auth).catch(function (e) {
    console.warn('[qm] redirect sign-in failed', e);
    if (window.QM_onAuthError) window.QM_onAuthError(e);
  });

  /* Module scripts are deferred, so this listener is registered *before*
   * DOMContentLoaded — and a cached Google session can resolve before app.js
   * has installed QM_onAuth. Latch the result so App.start() can pick up an
   * auth event that already happened rather than sitting on the spinner until
   * its fallback timer fires. */
  window.QMAuthState = { resolved: false, user: null };

  onAuthStateChanged(auth, function (user) {
    window.FirebaseCtx = user ? { db: db, fb: fb, uid: user.uid } : null;
    window.QMAuthState = { resolved: true, user: user || null };
    if (window.QM_onAuth) window.QM_onAuth(user || null);
  });
}
