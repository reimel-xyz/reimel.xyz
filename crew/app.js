// Crew+ web clock-in (09-10-26, HR_SPEC 11b): a worker's Home in the browser, for iPhones. The SAME server as the
// Android app: the same login, row-level security decides what comes back, and the server's clock() function records
// the event and checks the sign's code. Nothing here is a rule the server does not also hold.
//
// Phone first, as the app (README "Phone-first clocking"): a tap writes a row to the queue (IndexedDB) and the screen
// redraws off it; the send is behind it. A row the server REFUSED (a rule) is kept with the reason; one that could not
// be sent waits for signal. With no signal the page opens from the service worker's copy and draws from the card
// (localStorage), the browser's twin of the app's offline card. 🚨 iPhone can throw stored data away after a week of
// disuse unless the page is added to the Home Screen: the install tip says so.
//
// `?demo=1` runs against an in-page pretend server (DemoApi) with no login and no network: the walk-through for a
// browser on the PC and for showing the screens to a business.

import { SUPABASE_URL, SUPABASE_KEY, ZONE, APP_NAME } from "./config.js";
import * as R from "./rules.js";

// ---------------------------------------------------------------- words (English; Albanian joins here)

const T = {
  signInTitle: "Sign in",
  signInLine: "Clock in and out from your phone.",
  email: "Email",
  password: "Password",
  signIn: "Sign in",
  oneMoment: "One moment",
  forgot: "I've forgotten my password",
  forgotTitle: "Forgotten password",
  forgotLine: "We'll email you a six-digit code.",
  emailCode: "Email me a code",
  sending: "Sending",
  backToSignIn: "Back to sign in",
  resetTitle: "New password",
  resetLine: "Type the code from the email and choose a new password.",
  codeFromEmail: "Code from the email",
  sixDigits: "6 digits",
  newPassword: "New password",
  newPasswordAgain: "New password again",
  atLeast: "At least 8 characters",
  mismatch: "The two passwords don't match.",
  setPassword: "Set the new password and sign in",
  sendAgain: "Send the code again",
  codeSent: "If that email has a login, a six-digit code is on its way to it. It works for an hour.",
  wrongLogin: "That email and password don't match. Check both, or use \"I've forgotten my password\".",
  notConfirmed: "Confirm your email first: open the link in the email you were sent, then sign in.",
  noSignal: "No connection. Check the signal and try again.",
  noTeam: "This login isn't on a team yet. Ask your boss for an invite code and join from the Crew+ app on an Android phone.",
  reading: "Reading your company...",
  home: "HOME",
  hi: (name) => `Hi ${name}`,
  workedWeek: "Worked this week, finished shifts only",
  notClockedIn: "NOT CLOCKED IN",
  onShift: "ON SHIFT",
  onBreak: "ON A BREAK",
  workedSoFar: "Worked so far",
  started: "Started",
  breaks: "Breaks",
  noneYet: "None yet",
  clockIn: "Clock in",
  takeBreak: "Take break",
  endBreak: "End break",
  finish: "Finish shift",
  sheetTitle: "Clock in",
  sheetLine: "Scan the QR code on the sign at work.",
  scan: "Scan the code",
  cantScan: "I can't scan it",
  cantScanNote: "Can't scan? You're still clocked in, and your manager sees it had no scan.",
  notASign: "That's not a Crew+ sign. Try the QR code on the sign at work.",
  cameraFailed: "The camera couldn't open. You can still clock in without scanning.",
  noCameraApi: "This browser can't use the camera here. You can still clock in without scanning.",
  cameraBlocked: "The browser is blocking the camera for this page. Allow it (tap the icon by the address, then Permissions, Camera), or take a photo of the sign instead. If the browser never asks, the phone has the camera switched off for it: Settings, Apps, the browser, Permissions, Camera.",
  cameraBusy: "The camera is in use by another app. Close that app and try again, or take a photo of the sign instead.",
  noCamera: "No camera was found. You can still clock in without scanning.",
  takePhoto: "Take a photo of the sign",
  photoReading: "Reading the photo",
  photoNotSign: "No Crew+ code in that photo. Get closer, fill the picture with the code, and try again.",
  codeReady: "The code from the sign is ready.",
  clockInHere: "Clock in at this sign",
  scanOn: "Camera on. Hold the sign inside the view.",
  scanCloser: "Move closer so the code fills the view, and hold still.",
  scanStuck: "Still nothing? Tap \"I can't scan it\": you're clocked in, and your manager sees it had no scan.",
  cancel: "Cancel",
  gettingLocation: "Getting your location",
  clockedIn: "Clocked in.",
  savedOffline: "Saved on this phone. It goes up as soon as you have signal.",
  waiting: (n) => n === 1 ? "1 clock event is saved on this phone and goes up as soon as you have signal." : `${n} clock events are saved on this phone and go up as soon as you have signal.`,
  refused: "The server refused it.",
  ok: "OK",
  signedInAs: (email) => `Signed in as ${email}`,
  signOut: "Sign out",
  signOutAsk: "Sign out? You'll need your email and password to sign in again. A clock in saved on this phone with no signal waits here until you do.",
  installTitle: "Keep it like an app",
  installIos: "Tap Share, then \"Add to Home Screen\". It then opens from your Home Screen and keeps working with no signal.",
  demo: "Demo: a pretend company on this phone, nothing is sent anywhere.",
  ukTime: "Times are UK time.",
};

// ---------------------------------------------------------------- the two doors to the server

const DEMO = new URLSearchParams(location.search).has("demo");

class SupabaseApi {
  constructor() {
    this.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  }
  async session() { const { data } = await this.client.auth.getSession(); return data.session ?? null; }
  async signIn(email, password) { const { error } = await this.client.auth.signInWithPassword({ email, password }); if (error) throw error; }
  async signOut() {
    // The library clears the stored login only if the server accepted the logout; clear it ourselves whatever happened
    // (the Android app's lesson, audit 09-10-26 H1).
    try { await this.client.auth.signOut({ scope: "local" }); } catch { /* the stored session is removed below regardless */ }
    try { Object.keys(localStorage).filter((k) => k.startsWith("sb-")).forEach((k) => localStorage.removeItem(k)); } catch { /* nothing to clear */ }
  }
  async sendReset(email) { const { error } = await this.client.auth.resetPasswordForEmail(email); if (error) throw error; }
  async reset(email, code, password) {
    let r = await this.client.auth.verifyOtp({ type: "recovery", email, token: code });
    if (r.error) throw r.error;
    r = await this.client.auth.updateUser({ password });
    if (r.error) throw r.error;
  }
  async me(uid) {
    const { data, error } = await this.client.from("people").select("id, name, role, company_id").eq("user_id", uid);
    if (error) throw error;
    return (data ?? []).find((p) => p) ?? null;
  }
  async company() { const { data, error } = await this.client.from("companies").select("id, name, plan").limit(1); if (error) throw error; return data?.[0] ?? null; }
  async sites() { const { data, error } = await this.client.from("sites").select("id, name, latitude, longitude, radius_metres"); if (error) throw error; return (data ?? []).map((s) => ({ id: s.id, name: s.name, latitude: s.latitude, longitude: s.longitude, radiusMetres: s.radius_metres })); }
  async events(personId, sinceIso) {
    const { data, error } = await this.client.from("clock_events").select("id, kind, at, site_check, location, recorded_offline").eq("person_id", personId).gte("at", sinceIso).order("at").limit(1000);
    if (error) throw error;
    return (data ?? []).map(rowToEvent);
  }
  async clock(params) {
    const { data, error } = await this.client.rpc("clock", params);
    if (error) throw error;
    return rowToEvent(Array.isArray(data) ? data[0] : data);
  }
}

/** The pretend server for the demo: one worker, one site, events kept in memory, no network at all. */
class DemoApi {
  constructor() {
    this.user = null;
    this.rows = [];
    this.site = { id: "site", name: "Main site", latitude: 51.063, longitude: -0.3258, radiusMetres: 150 };
  }
  async wait() { await new Promise((r) => setTimeout(r, 350)); if (!navigator.onLine) throw new TypeError("Failed to fetch"); }
  async session() { return this.user; }
  async signIn(email) { await this.wait(); this.user = { user: { id: "demo-user", email: email || "alex@example.com" } }; }
  async signOut() { this.user = null; }
  async sendReset() { await this.wait(); }
  async reset() { await this.wait(); this.user = { user: { id: "demo-user", email: "alex@example.com" } }; }
  async me() { await this.wait(); return { id: "demo-alex", name: "Alex Morgan", role: "WORKER", company_id: "demo-co" }; }
  async company() { return { id: "demo-co", name: "Waves Car Wash (demo)", plan: "clock" }; }
  async sites() { return [this.site]; }
  async events() { return this.rows.slice(); }
  async clock(p) {
    await this.wait();
    const st = R.state(this.rows, Date.now());
    if (p.p_kind === "BREAK_START" && st !== "WORKING") throw { code: "P0001", message: "You're not clocked in." };
    if (p.p_kind === "BREAK_END" && st !== "ON_BREAK") throw { code: "P0001", message: "You're not on a break." };
    if (p.p_kind === "OUT" && st === "NOT_WORKING") throw { code: "P0001", message: "You're not clocked in." };
    const code = (p.p_code ?? "").toUpperCase();
    // The Android app's own demo site code (data/local/DemoSeed), so the app's printed demo sign works in this demo too.
    const proved = p.p_kind === "IN" && code === "DEMP234567" ? (p.p_method ?? "QR") : "NONE";
    const ev = { id: p.p_client_id, kind: p.p_kind, atMillis: p.p_offline ? Date.parse(p.p_device_time) : Date.now(), siteCheck: proved, location: p.p_location ?? "UNAVAILABLE", recordedOffline: !!p.p_offline };
    this.rows.push(ev);
    return ev;
  }
}

function rowToEvent(r) {
  return { id: r.id, kind: r.kind, atMillis: Date.parse(r.at), siteCheck: r.site_check, location: r.location, recordedOffline: !!r.recorded_offline };
}

const api = DEMO ? new DemoApi() : new SupabaseApi();

// ---------------------------------------------------------------- the queue (IndexedDB) and the card (localStorage)

const Q = {
  db: null,
  async open() {
    if (this.db) return this.db;
    this.db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(DEMO ? "crew-web-demo" : "crew-web", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("queue", { keyPath: "id" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.db;
  },
  async run(mode, fn) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("queue", mode);
      const req = fn(tx.objectStore("queue"));
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = () => reject(tx.error);
    });
  },
  all() { return this.run("readonly", (s) => s.getAll()).then((rows) => (rows ?? []).sort((a, b) => a.atMillis - b.atMillis)); },
  add(row) { return this.run("readwrite", (s) => s.put(row)); },
  update(row) { return this.run("readwrite", (s) => s.put(row)); },
  remove(id) { return this.run("readwrite", (s) => s.delete(id)); },
};

const CARD_KEY = DEMO ? "crew.card.demo" : "crew.card";
const card = {
  read() { try { return JSON.parse(localStorage.getItem(CARD_KEY) || "null"); } catch { return null; } },
  write(c) { try { localStorage.setItem(CARD_KEY, JSON.stringify(c)); } catch { /* storage may be blocked */ } },
  clear() { try { localStorage.removeItem(CARD_KEY); } catch { /* nothing to clear */ } },
};

// ---------------------------------------------------------------- state

let screen = "loading"; // loading | signin | forgot | reset | noteam | home
let busy = false;
let msg = null;          // { tone, text } on the sign-in screens
let note = null;         // a short line on Home after a tap
let view = null;         // { me, company, sites, events, email }
let queue = [];
let sheet = false;
let photoOffer = false;  // the live camera was refused on this device: the sheet also offers a photo of the sign
let scanning = null;     // { stream, wrap, timer, started }
let flushing = false;
let resetEmail = "";
let pollTimer = null;
let lastHtml = "";       // render() swaps the DOM only when the picture changed: a swap under a thumb loses the tap

// A code handed in the address: an old sign's link (https://reimel.xyz/clock/<code>) opened by the phone's own camera
// app or any QR reader, sent here by the site's 404 page as ?code=. Offered as "Clock in at this sign" once signed in,
// kept through the sign-in in sessionStorage, and forgotten the moment it is used, declined or no longer applies.
let pendingCode = (() => {
  const q = new URLSearchParams(location.search);
  let code = R.parseSiteCode(q.get("code") ?? "");
  if (code) {
    q.delete("code");
    history.replaceState(null, "", location.pathname + (q.toString() ? "?" + q.toString() : "") + location.hash);
    try { sessionStorage.setItem("crew.code", code); } catch { /* fine without */ }
  } else {
    try { code = R.parseSiteCode(sessionStorage.getItem("crew.code") ?? ""); } catch { code = null; }
  }
  return code;
})();
function dropCode() { pendingCode = null; try { sessionStorage.removeItem("crew.code"); } catch { /* nothing to clear */ } }

const app = document.getElementById("app");
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === "x" ? r : (r & 0x3) | 0x8).toString(16); }));
const fmtDay = new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, weekday: "short", day: "numeric", month: "short" });
const fmtTime = new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, hour: "2-digit", minute: "2-digit", hour12: false });
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.MSStream;
const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

/** The events the screen reasons from: the server's, plus the rows still waiting here (phone first). */
function effectiveEvents() {
  const pending = queue.filter((r) => !r.refused).map((r) => ({ id: r.id, kind: r.kind, atMillis: r.atMillis, siteCheck: r.method ?? "NONE", location: r.location ?? "UNAVAILABLE", recordedOffline: true }));
  const ids = new Set(pending.map((p) => p.id));
  return [...(view?.events ?? []).filter((e) => !ids.has(e.id)), ...pending];
}

// ---------------------------------------------------------------- start up

async function start() {
  if ("serviceWorker" in navigator && !DEMO) navigator.serviceWorker.register("sw.js").catch(() => { /* the page still works without it */ });
  queue = await Q.all().catch(() => []);
  // Attached before any screen is chosen: a sign-in later in the page's life must still flush on signal.
  window.addEventListener("online", () => flush());
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && screen === "home") { refresh(); flush(); } });
  const session = await api.session().catch(() => null);
  if (!session) {
    // No login. A card from before means the login ENDED (the library clears a dead one); the card goes with it.
    card.clear();
    screen = "signin";
    render();
    return;
  }
  const cached = card.read();
  if (cached && cached.me) {
    view = cached;
    screen = "home";
    render();
  } else {
    screen = "loading";
    render();
  }
  await refresh(session);
  startPolling();
}

/** Reads who I am and my recent events; keeps what it has when the server cannot be reached. */
async function refresh(session) {
  try {
    const s = session ?? (await api.session());
    if (!s) { await signedOut(); return; }
    const me = await api.me(s.user.id);
    if (!me) { screen = "noteam"; view = { email: s.user.email }; card.clear(); render(); return; }
    const [company, sites] = await Promise.all([api.company(), api.sites()]);
    const since = new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString();
    const events = await api.events(me.id, since);
    view = { me, company, sites, events, email: s.user.email };
    card.write(view);
    screen = "home";
    render();
    flush();
  } catch (e) {
    // No signal, or a server trouble: the card (if any) stays on screen. A login the server no longer knows comes
    // back as a session of null on the next getSession, which the start-up handles.
    if (!view) { screen = "signin"; msg = { tone: "warn", text: T.noSignal }; }
    render();
  }
}

function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(() => { if (document.visibilityState === "visible" && screen === "home") refresh(); }, 20000);
}

async function signedOut() {
  clearInterval(pollTimer);
  await api.signOut();
  card.clear();
  view = null;
  screen = "signin";
  msg = null;
  render();
}

// ---------------------------------------------------------------- the queue going up

async function flush() {
  if (flushing || DEMO && !navigator.onLine) return;
  flushing = true;
  try {
    const rows = (await Q.all()).filter((r) => !r.refused);
    let offline = false;
    for (const r of rows) {
      offline = R.asOffline(Date.now() - r.atMillis, offline);
      const params = {
        p_kind: r.kind,
        p_code: r.code ?? null,
        p_method: r.method ?? null,
        p_location: r.location ?? "UNAVAILABLE",
        p_device_time: new Date(r.atMillis).toISOString(),
        p_offline: offline,
        p_client_id: r.id,
      };
      if (offline) params.p_device_now = new Date().toISOString();
      try {
        const ev = await api.clock(params);
        if (view && ev && !view.events.some((e) => e.id === ev.id)) { view.events.push(ev); card.write(view); }
        await Q.remove(r.id);
      } catch (e) {
        if (R.isRefusal(e?.code)) { r.refused = e.message || T.refused; await Q.update(r); continue; }
        break; // keep it, and the rest behind it: order must hold
      }
    }
  } finally {
    flushing = false;
    queue = await Q.all().catch(() => queue);
    render();
  }
}

async function tap(kind, extra = {}) {
  const row = { id: uuid(), kind, atMillis: Date.now(), queuedAt: Date.now(), ...extra };
  await Q.add(row);
  queue = await Q.all();
  render();
  const sending = flush();
  // Waited for BRIEFLY, only to choose an honest sentence; the screen already shows the tap.
  await Promise.race([sending, new Promise((r) => setTimeout(r, 3000))]);
  const still = queue.find((q) => q.id === row.id);
  note = still ? (still.refused ? still.refused : T.savedOffline) : (kind === "IN" ? T.clockedIn : null);
  render();
}

// ---------------------------------------------------------------- clock in: sign, location, queue

function position() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    );
  });
}

async function clockInWith(code, method) {
  dropCode();
  sheet = false;
  busy = true;
  note = T.gettingLocation;
  render();
  const pos = await position();
  const location = pos && view?.sites?.length ? R.siteCheck(view.sites, pos.lat, pos.lon, pos.acc) : "UNAVAILABLE";
  busy = false;
  note = null;
  await tap("IN", { code, method, location });
}

async function openScanner() {
  const video = document.createElement("video");
  video.setAttribute("playsinline", ""); video.setAttribute("autoplay", ""); video.muted = true;
  const wrap = document.createElement("div");
  wrap.className = "scan";
  wrap.appendChild(video);
  const bar = document.createElement("div");
  bar.className = "bar";
  bar.innerHTML = `<p class="small muted" id="scanmsg">${esc(T.sheetLine)}</p><div class="row"><button class="btn outline" data-act="scan-cancel">${esc(T.cancel)}</button><button class="btn tonal" data-act="cant-scan">${esc(T.cantScan)}</button></div>`;
  wrap.appendChild(bar);
  document.body.appendChild(wrap);
  const say = (text) => { const m = document.getElementById("scanmsg"); if (m) m.textContent = text; };
  // Registered BEFORE the permission prompt, so Cancel during the prompt closes the view and the late stream is dropped.
  const mine = { stream: null, wrap, timer: 0, started: Date.now() };
  scanning = mine;
  if (!navigator.mediaDevices?.getUserMedia) { closeScanner(); sheet = true; note = T.noCameraApi; render(); return; }
  let stream;
  try {
    // A wide, sharp frame: the sign's 21-module code needs about 5 px a module once a lens is soft (jsQR measured
    // 09-10-26, web/test/qr_decode_limits.mjs), so about 150 px wide, and the browser's default frame is only 640 wide.
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  } catch (e) {
    // Say why, and from now on offer the phone's own camera app (a photo) as the way past a browser that blocks the
    // live camera: Samsung Internet on Albo's phone did (09-10-26) while a plain Chromium browser on it did not.
    const name = e?.name ?? "";
    if (scanning === mine) {
      closeScanner();
      sheet = true;
      photoOffer = true;
      note = name === "NotAllowedError" || name === "SecurityError" ? T.cameraBlocked
        : name === "NotReadableError" || name === "AbortError" ? T.cameraBusy
        : name === "NotFoundError" ? T.noCamera
        : T.cameraFailed;
      render();
    }
    return;
  }
  if (scanning !== mine) { stream.getTracks().forEach((t) => t.stop()); return; }
  mine.stream = stream;
  video.srcObject = stream;
  await video.play().catch(() => { /* iOS needs the gesture; the user's tap was one */ });
  say(T.scanOn);
  // The reader: the browser's own first (Chrome on Android reads soft and tilted codes through the system's barcode
  // module), jsQR on a copied frame otherwise (Safari has no reader of its own).
  let detector = null;
  try {
    if ("BarcodeDetector" in window && (await window.BarcodeDetector.getSupportedFormats()).includes("qr_code")) {
      detector = new window.BarcodeDetector({ formats: ["qr_code"] });
    }
  } catch { detector = null; }
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const found = (text) => {
    const code = R.parseSiteCode(text);
    if (code) { closeScanner(); clockInWith(code, "QR"); return true; }
    say(T.notASign);
    return false;
  };
  const readFrame = async () => {
    if (video.readyState < 2 || !video.videoWidth) return false;
    if (detector) {
      try {
        const codes = await detector.detect(video);
        return codes.some((c) => c.rawValue && found(c.rawValue));
      } catch {
        detector = null; // the browser's reader is not usable on this device (no module installed): jsQR from here
        return false;
      }
    }
    if (!window.jsQR) return false;
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const hit = window.jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
    return !!(hit && hit.data && found(hit.data));
  };
  const loop = async () => {
    if (scanning !== mine) return;
    // 🚨 One bad frame (the first often has no size yet) must never end the scan: the old loop threw and went quiet.
    try { if (await readFrame()) return; } catch { /* next frame */ }
    if (scanning !== mine) return;
    const age = Date.now() - mine.started;
    if (age > 15000) say(T.scanStuck); else if (age > 6000) say(T.scanCloser);
    mine.timer = setTimeout(loop, 120);
  };
  loop();
}

function closeScanner() {
  if (!scanning) return;
  clearTimeout(scanning.timer);
  if (scanning.stream) scanning.stream.getTracks().forEach((t) => t.stop());
  scanning.wrap.remove();
  scanning = null;
}

/** A photo of the sign from the phone's own camera app (the file input with capture): decoded here, never kept or sent. */
async function readPhoto(file) {
  if (!file) return;
  sheet = false;
  busy = true;
  note = T.photoReading;
  render();
  let text = null;
  try {
    let bitmap;
    try { bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }); }
    catch { bitmap = await createImageBitmap(file); }
    // Enough pixels for the code, not the whole 12-megapixel photo: the decoder reads a 150 px code comfortably.
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    if ("BarcodeDetector" in window) {
      try {
        const d = new window.BarcodeDetector({ formats: ["qr_code"] });
        const codes = await d.detect(canvas);
        text = codes.find((c) => c.rawValue)?.rawValue ?? null;
      } catch { text = null; }
    }
    if (!text && window.jsQR) {
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      text = window.jsQR(img.data, img.width, img.height, { inversionAttempts: "attemptBoth" })?.data ?? null;
    }
  } catch { text = null; }
  busy = false;
  note = null;
  const code = text ? R.parseSiteCode(text) : null;
  if (code) { await clockInWith(code, "QR"); return; }
  sheet = true;
  note = text ? T.notASign : T.photoNotSign;
  render();
}

// ---------------------------------------------------------------- actions

async function act(name, el) {
  const val = (id) => document.getElementById(id)?.value?.trim() ?? "";
  switch (name) {
    case "signin": {
      const email = val("email"), password = document.getElementById("password")?.value ?? "";
      if (!email || !password) return;
      busy = true; msg = null; render();
      try { await api.signIn(email, password); busy = false; screen = "loading"; render(); await refresh(); startPolling(); }
      catch (e) { busy = false; msg = { tone: "bad", text: plain(e) }; render(); }
      return;
    }
    case "to-forgot": screen = "forgot"; msg = null; render(); return;
    case "to-signin": screen = "signin"; msg = null; render(); return;
    case "send-code": {
      const email = val("email");
      if (!email) return;
      busy = true; msg = null; render();
      try { await api.sendReset(email); resetEmail = email; busy = false; screen = "reset"; msg = { tone: "info", text: T.codeSent }; render(); }
      catch (e) { busy = false; msg = { tone: "bad", text: plain(e) }; render(); }
      return;
    }
    case "reset": {
      const code = val("code"), p1 = document.getElementById("p1")?.value ?? "", p2 = document.getElementById("p2")?.value ?? "";
      if (code.length !== 6 || p1.length < 8 || p1 !== p2) return;
      busy = true; msg = null; render();
      try { await api.reset(resetEmail, code, p1); busy = false; screen = "loading"; render(); await refresh(); startPolling(); }
      catch (e) { busy = false; msg = { tone: "bad", text: plain(e) }; render(); }
      return;
    }
    case "clock-in": sheet = true; note = null; render(); return;
    case "sheet-close": sheet = false; dropCode(); render(); return;
    case "clock-in-code": { const c = pendingCode; dropCode(); if (c) await clockInWith(c, "QR"); return; }
    case "scan": sheet = false; render(); await openScanner(); return;
    case "scan-cancel": closeScanner(); return;
    case "cant-scan": closeScanner(); await clockInWith(null, "NONE"); return;
    case "break": await tap("BREAK_START"); return;
    case "break-end": await tap("BREAK_END"); return;
    case "finish": await tap("OUT"); return;
    case "dismiss": {
      const id = el.dataset.id;
      await Q.remove(id); queue = await Q.all(); render(); return;
    }
    case "note-ok": note = null; render(); return;
    case "signout": if (confirm(T.signOutAsk)) await signedOut(); return;
    default: return;
  }
}

function plain(e) {
  const m = String(e?.message ?? e ?? "");
  if (/Invalid login credentials/i.test(m)) return T.wrongLogin;
  if (/Email not confirmed/i.test(m)) return T.notConfirmed;
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(m)) return T.noSignal;
  return m.slice(0, 160) || T.noSignal;
}

// ---------------------------------------------------------------- drawing

function render() {
  // A code from the address opens the sheet by itself, once signed in and not clocked in; otherwise it no longer applies.
  if (pendingCode && screen === "home" && !busy && !sheet) {
    if (R.state(effectiveEvents(), Date.now()) === "NOT_WORKING") sheet = true; else dropCode();
  }
  let html = "";
  if (DEMO) html += `<div class="demo">${esc(T.demo)}</div>`;
  if (screen === "loading") html += `<div class="card"><p class="muted">${esc(T.reading)}</p></div>`;
  else if (screen === "signin") html += signInHtml();
  else if (screen === "forgot") html += forgotHtml();
  else if (screen === "reset") html += resetHtml();
  else if (screen === "noteam") html += `<div class="card"><h1>${esc(APP_NAME)}</h1><p>${esc(T.noTeam)}</p><div class="row"><button class="btn outline" data-act="signout">${esc(T.signOut)}</button></div></div>`;
  else html += homeHtml();
  if (sheet) html += sheetHtml();
  // Keep what was typed: the sign-in screens re-render only on a message or a busy change, so values are restored.
  const typed = {};
  ["email", "password", "code", "p1", "p2"].forEach((id) => { const e = document.getElementById(id); if (e) typed[id] = e.value; });
  if (html === lastHtml) return;
  lastHtml = html;
  app.innerHTML = html;
  Object.entries(typed).forEach(([id, v]) => { const e = document.getElementById(id); if (e && !e.value) e.value = v; });
}

function notice(m) { return m ? `<div class="notice ${m.tone}">${esc(m.text)}</div>` : ""; }

function signInHtml() {
  return `<div class="hero"><div class="kicker">${esc(APP_NAME)}</div><div class="big">${esc(T.signInTitle)}</div><div class="line">${esc(T.signInLine)}</div></div>
  <div class="card">
    <label for="email">${esc(T.email)}</label><input id="email" type="email" autocomplete="username" inputmode="email" autocapitalize="off" placeholder="you@example.com">
    <label for="password">${esc(T.password)}</label><input id="password" type="password" autocomplete="current-password">
    ${notice(msg)}
    <div class="row"><button class="btn primary" data-act="signin" ${busy ? "disabled" : ""}>${esc(busy ? T.oneMoment : T.signIn)}</button></div>
    <div class="row"><button class="btn text" data-act="to-forgot">${esc(T.forgot)}</button></div>
  </div>
  <p class="foot">${esc(T.ukTime)}</p>`;
}

function forgotHtml() {
  return `<div class="hero"><div class="kicker">${esc(APP_NAME)}</div><div class="big">${esc(T.forgotTitle)}</div><div class="line">${esc(T.forgotLine)}</div></div>
  <div class="card">
    <label for="email">${esc(T.email)}</label><input id="email" type="email" autocomplete="username" inputmode="email" autocapitalize="off" placeholder="you@example.com">
    ${notice(msg)}
    <div class="row"><button class="btn primary" data-act="send-code" ${busy ? "disabled" : ""}>${esc(busy ? T.sending : T.emailCode)}</button></div>
    <div class="row"><button class="btn text" data-act="to-signin">${esc(T.backToSignIn)}</button></div>
  </div>`;
}

function resetHtml() {
  return `<div class="hero"><div class="kicker">${esc(APP_NAME)}</div><div class="big">${esc(T.resetTitle)}</div><div class="line">${esc(T.resetLine)}</div></div>
  <div class="card">
    ${notice(msg)}
    <label for="code">${esc(T.codeFromEmail)}</label><input id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="${esc(T.sixDigits)}">
    <label for="p1">${esc(T.newPassword)}</label><input id="p1" type="password" autocomplete="new-password" placeholder="${esc(T.atLeast)}">
    <label for="p2">${esc(T.newPasswordAgain)}</label><input id="p2" type="password" autocomplete="new-password">
    <div class="row"><button class="btn primary" data-act="reset" ${busy ? "disabled" : ""}>${esc(busy ? T.oneMoment : T.setPassword)}</button></div>
    <div class="row"><button class="btn text" data-act="to-forgot">${esc(T.sendAgain)}</button></div>
  </div>`;
}

function homeHtml() {
  const now = Date.now();
  const events = effectiveEvents();
  const st = R.state(events, now);
  const sess = R.sessions(events);
  const open = sess.find((s) => s.outMillis === null && now <= s.inMillis + R.NO_ROTA_LIMIT_MS);
  const weekStart = R.weekStartIso(now, ZONE);
  const weekMinutes = sess.filter((s) => s.outMillis !== null && R.dayIso(s.inMillis, ZONE) >= weekStart).reduce((a, s) => a + R.workedMinutes(s), 0);
  const first = (view?.me?.name ?? "").split(" ")[0] || "there";
  const initial = first.slice(0, 1).toUpperCase();
  const waiting = queue.filter((r) => !r.refused).length;
  const refused = queue.filter((r) => r.refused);
  let tile;
  if (st === "NOT_WORKING") {
    tile = `<div class="state"><span class="dot"></span>${esc(T.notClockedIn)}</div><h1>${esc(T.hi(first))}</h1>
      <div class="row"><button class="btn primary" data-act="clock-in" ${busy ? "disabled" : ""}>${esc(T.clockIn)}</button></div>`;
  } else {
    const onBreak = st === "ON_BREAK";
    const soFar = open ? R.workedSoFarMinutes(open, now) : 0;
    const breaksText = open && open.breakMs > 0 ? R.hoursText(Math.round(open.breakMs / 60000)) : T.noneYet;
    tile = `<div class="state ${onBreak ? "warn" : "good"}"><span class="dot"></span>${esc(onBreak ? T.onBreak : T.onShift)}</div>
      <div class="figure">${esc(R.hoursText(soFar))}</div><p class="muted">${esc(T.workedSoFar)}</p>
      <div class="stats"><div class="stat"><div class="l">${esc(T.started)}</div><div class="v">${open ? esc(fmtTime.format(new Date(open.inMillis))) : ""}</div></div><div class="stat"><div class="l">${esc(T.breaks)}</div><div class="v">${esc(breaksText)}</div></div></div>
      <div class="row"><button class="btn tonal" data-act="${onBreak ? "break-end" : "break"}">${esc(onBreak ? T.endBreak : T.takeBreak)}</button><button class="btn primary" data-act="finish">${esc(T.finish)}</button></div>`;
  }
  return `<div class="hero"><div class="kicker"><span>${esc(T.home)} · ${esc(fmtDay.format(new Date(now)).toUpperCase())}</span><span class="face" aria-label="${esc(view?.me?.name ?? "")}">${esc(initial)}</span></div>
    <div class="big">${esc(R.hoursText(weekMinutes))}</div><div class="line">${esc(T.workedWeek)}</div></div>
  <div class="card">${tile}
    ${note ? `<div class="notice info">${esc(note)}<button class="dismiss" data-act="note-ok">${esc(T.ok)}</button></div>` : ""}
    ${waiting ? `<div class="notice warn">${esc(T.waiting(waiting))}</div>` : ""}
    ${refused.map((r) => `<div class="notice bad">${esc(r.refused)}<button class="dismiss" data-act="dismiss" data-id="${esc(r.id)}">${esc(T.ok)}</button></div>`).join("")}
  </div>
  ${isIos && !standalone ? `<div class="card install"><strong>${esc(T.installTitle)}</strong><p class="small muted">${esc(T.installIos)}</p></div>` : ""}
  <p class="foot">${esc(T.signedInAs(view?.email ?? ""))} · <button data-act="signout">${esc(T.signOut)}</button><br>${esc(T.ukTime)}</p>`;
}

function sheetHtml() {
  const code = pendingCode;
  return `<div class="sheet-back" data-act="sheet-close"><div class="sheet"><h2>${esc(T.sheetTitle)}</h2><p>${esc(code ? T.codeReady : T.sheetLine)}</p>
    ${code ? `<div class="row"><button class="btn primary" data-act="clock-in-code">${esc(T.clockInHere)}</button></div>` : ""}
    <div class="row"><button class="btn ${code ? "tonal" : "primary"}" data-act="scan">${esc(T.scan)}</button></div>
    ${photoOffer ? `<div class="row"><label class="btn tonal">${esc(T.takePhoto)}<input type="file" accept="image/*" capture="environment" data-photo hidden></label></div>` : ""}
    <div class="row"><button class="btn ${photoOffer || code ? "text" : "tonal"}" data-act="cant-scan">${esc(T.cantScan)}</button></div>
    <p class="small muted">${esc(T.cantScanNote)}</p></div></div>`;
}

document.addEventListener("click", (e) => {
  const a = e.target.closest("[data-act]");
  if (!a) return;
  if (a.classList.contains("sheet-back") && e.target !== a) return;
  act(a.dataset.act, a);
});
document.addEventListener("change", (e) => {
  if (e.target.matches?.("[data-photo]")) readPhoto(e.target.files?.[0]);
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  if (screen === "signin") act("signin");
  else if (screen === "forgot") act("send-code");
  else if (screen === "reset") act("reset");
});
// The running figure ticks, as the app's does.
setInterval(() => { if (screen === "home" && !sheet) render(); }, 30000);

start();
