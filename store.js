// Capa de datos: guarda cuentas, movimientos y recurrentes.
// - Modo nube (Firebase configurado): Firestore con caché offline y sincronización en tiempo real.
// - Modo local: localStorage del navegador.
import { firebaseConfig } from './firebase-config.js';

export const COLLECTIONS = ['accounts', 'movements', 'recurring'];
export const hasCloud = !!(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId);
export const LS_KEY = 'mis-finanzas-v1';
const FB_VERSION = '11.0.2';

let state = emptyState();
let ready = false;
const listeners = new Set();
let errorHandler = (e) => console.error(e);

function emptyState() { return { accounts: [], movements: [], recurring: [] }; }
function emit() { listeners.forEach((f) => f(state, ready)); }
export function onChange(f) { listeners.add(f); return () => listeners.delete(f); }
export function getState() { return state; }
export function isReady() { return ready; }
export function onError(f) { errorHandler = f; }

export function newId() {
  if (crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
}

// Firestore no admite `undefined`
function clean(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

// ───────────────────────── Modo local ─────────────────────────
function loadLocal() {
  try {
    const d = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    const s = emptyState();
    for (const c of COLLECTIONS) s[c] = Array.isArray(d[c]) ? d[c] : [];
    return s;
  } catch { return emptyState(); }
}
function saveLocal() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); }
  catch (e) { errorHandler(e); }
}
export function localDataExists() {
  const d = loadLocal();
  return COLLECTIONS.some((c) => d[c].length > 0);
}
export function readLocalData() { return loadLocal(); }

// ───────────────────────── Modo nube ──────────────────────────
let fbApp, auth, db, A, F;
let unsubs = [];
let uid = null;

async function loadFirebase() {
  const base = `https://www.gstatic.com/firebasejs/${FB_VERSION}/`;
  const [appM, authM, fsM] = await Promise.all([
    import(base + 'firebase-app.js'),
    import(base + 'firebase-auth.js'),
    import(base + 'firebase-firestore.js'),
  ]);
  A = authM; F = fsM;
  fbApp = appM.initializeApp(firebaseConfig);
  auth = A.getAuth(fbApp);
  try {
    db = F.initializeFirestore(fbApp, {
      localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }),
    });
  } catch (e) {
    console.warn('Caché offline no disponible:', e);
    db = F.getFirestore(fbApp);
  }
}

function stopSubs() { unsubs.forEach((u) => u()); unsubs = []; }

function subscribe() {
  const loaded = new Set();
  for (const c of COLLECTIONS) {
    unsubs.push(F.onSnapshot(F.collection(db, 'users', uid, c), (snap) => {
      state = { ...state, [c]: snap.docs.map((d) => ({ ...d.data(), id: d.id })) };
      loaded.add(c);
      if (loaded.size === COLLECTIONS.length) ready = true;
      emit();
    }, (err) => errorHandler(err)));
  }
}

const ref = (c, id) => F.doc(db, 'users', uid, c, id);

// ───────────────────────── API común ──────────────────────────

/** Arranca la capa de datos. `onUser(user|null)` se llama al cambiar la sesión (solo nube). */
export async function init(onUser) {
  if (!hasCloud) {
    state = loadLocal(); ready = true; emit();
    onUser({ local: true });
    return;
  }
  await loadFirebase();
  A.onAuthStateChanged(auth, (user) => {
    stopSubs();
    state = emptyState(); ready = false;
    uid = user ? user.uid : null;
    if (user) subscribe();
    emit();
    onUser(user);
  });
}

export function add(c, obj) {
  const id = obj.id || newId();
  const doc = clean({ ...obj, id: undefined, createdAt: obj.createdAt || Date.now() });
  if (hasCloud) {
    F.setDoc(ref(c, id), doc).catch(errorHandler);
  } else {
    state = { ...state, [c]: [...state[c], { ...doc, id }] };
    saveLocal(); emit();
  }
  return id;
}

export function update(c, id, patch) {
  const p = clean({ ...patch, id: undefined, updatedAt: Date.now() });
  if (hasCloud) {
    F.updateDoc(ref(c, id), p).catch(errorHandler);
  } else {
    state = { ...state, [c]: state[c].map((x) => (x.id === id ? { ...x, ...p } : x)) };
    saveLocal(); emit();
  }
}

export function remove(c, id) {
  if (hasCloud) {
    F.deleteDoc(ref(c, id)).catch(errorHandler);
  } else {
    state = { ...state, [c]: state[c].filter((x) => x.id !== id) };
    saveLocal(); emit();
  }
}

/** Importa datos. replace=true borra todo lo actual antes. */
export async function importData(data, { replace = true } = {}) {
  if (!hasCloud) {
    const s = replace ? emptyState() : { ...state };
    for (const c of COLLECTIONS) {
      const incoming = Array.isArray(data[c]) ? data[c] : [];
      const map = new Map((replace ? [] : s[c]).map((x) => [x.id, x]));
      incoming.forEach((x) => map.set(x.id || newId(), { ...x, id: x.id || newId() }));
      s[c] = [...map.values()];
    }
    state = s; saveLocal(); emit();
    return;
  }
  const ops = [];
  if (replace) for (const c of COLLECTIONS) for (const x of state[c]) ops.push(['del', c, x.id]);
  for (const c of COLLECTIONS) for (const x of (data[c] || [])) ops.push(['set', c, x.id || newId(), x]);
  for (let i = 0; i < ops.length; i += 400) {
    const batch = F.writeBatch(db);
    for (const [op, c, id, x] of ops.slice(i, i + 400)) {
      if (op === 'del') batch.delete(ref(c, id));
      else batch.set(ref(c, id), clean({ ...x, id: undefined }));
    }
    await batch.commit();
  }
}

export function exportData() {
  return { app: 'mis-finanzas', version: 1, exportedAt: new Date().toISOString(), ...state };
}

// ───────────────────────── Sesión ─────────────────────────────
export const currentEmail = () => (auth && auth.currentUser ? auth.currentUser.email : null);
export const signIn = (email, pw) => A.signInWithEmailAndPassword(auth, email, pw);
export const signUp = (email, pw) => A.createUserWithEmailAndPassword(auth, email, pw);
export const resetPassword = (email) => A.sendPasswordResetEmail(auth, email);
export const signOut = () => A.signOut(auth);
