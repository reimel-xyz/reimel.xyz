// Crew+ web clock-in: the rules, ported from the app's domain so the two cannot disagree (09-10-26, HR_SPEC 11b).
//   Clocking.state   -> state(events, nowMs)
//   Clocking.sessions -> sessions(events)  (finished shifts, for "worked this week"; the open one for "worked so far")
//   Clocking.locationCheck -> locationCheck(lat, lon, accuracy, site)
//   SiteCode.parse   -> parseSiteCode(text)
//   Outbox.asOffline / Net.isRefusal -> asOffline(ageMs, earlierWentOffline), isRefusal(code)
//   ClockQueue.waiting(personId) -> toSend(rows, personId)  (and rowsOf, claimLegacy, unclaimed: the queue's owner)
//   Clocking.undoFinishProblem (Home's ten minutes) -> undoableFinish(events, nowMs)
//   SignInScreen's reset button and plain() -> resetProblem(code, p1, p2), authProblem(error)
// Pure functions, no DOM, no network: `node --test test/rules.test.mjs test/queue.test.mjs` runs them on the PC.

export const KIND = ["IN", "BREAK_START", "BREAK_END", "OUT"];

/** A shift still open this long after its clock in is a forgotten finish, not "working now" (Clocking.NO_ROTA_LIMIT). */
export const NO_ROTA_LIMIT_MS = 14 * 60 * 60 * 1000;
/** Phones and servers disagree by seconds; two minutes is not "the future", five hours is (Clocking.FUTURE_GRACE_SECONDS). */
export const FUTURE_GRACE_MS = 120 * 1000;
/** A fix older than this is unusable for "at the site" (Clocking.MAX_USEFUL_ACCURACY_METRES). */
export const MAX_USEFUL_ACCURACY_METRES = 500;
/** A row sent within this of its tap goes up as a LIVE event with the server's time; older, as recorded offline (Outbox.LIVE_MS). */
export const LIVE_MS = 20 * 1000;
/** A finish pressed by mistake can be taken back on Home for this long (Clocking.UNDO_FINISH_WINDOW, server 0012). */
export const UNDO_FINISH_MS = 10 * 60 * 1000;
/** The reset code is 6 to 10 digits, whatever Supabase's "Email OTP Length" is set to (31-10-26); a password at least 8. */
export const RESET_CODE_MIN = 6, RESET_CODE_MAX = 10, MIN_PASSWORD = 8;

const ORDER = (a, b) => a.atMillis - b.atMillis || KIND.indexOf(a.kind) - KIND.indexOf(b.kind) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** What the worker can press next: NOT_WORKING, WORKING or ON_BREAK, from their events in any order. */
export function state(events, nowMs) {
  let st = "NOT_WORKING";
  let lastIn = null;
  [...events].filter((e) => e.atMillis <= nowMs + FUTURE_GRACE_MS).sort(ORDER).forEach((e) => {
    if (e.kind === "IN") lastIn = e.atMillis;
    st = e.kind === "IN" ? "WORKING"
      : e.kind === "BREAK_START" ? (st === "WORKING" ? "ON_BREAK" : st)
      : e.kind === "BREAK_END" ? (st === "ON_BREAK" ? "WORKING" : st)
      : "NOT_WORKING";
  });
  if (st !== "NOT_WORKING" && lastIn !== null && nowMs > lastIn + NO_ROTA_LIMIT_MS) return "NOT_WORKING";
  return st;
}

/**
 * The shifts in the events: each clock in with its breaks and its finish (null while open). Breaks are minutes OFF
 * the paid time; an unfinished break closes at the finish. Stray breaks and finishes with no clock in are ignored
 * here (the manager's Today shows them flagged).
 */
export function sessions(events) {
  const out = [];
  let cur = null;
  [...events].sort(ORDER).forEach((e) => {
    if (e.kind === "IN") {
      if (cur) out.push(cur);
      cur = { inMillis: e.atMillis, outMillis: null, breakStart: null, breakMs: 0 };
    } else if (!cur || cur.outMillis !== null) {
      return;
    } else if (e.kind === "BREAK_START") {
      if (cur.breakStart === null) cur.breakStart = e.atMillis;
    } else if (e.kind === "BREAK_END") {
      if (cur.breakStart !== null) { cur.breakMs += Math.max(0, e.atMillis - cur.breakStart); cur.breakStart = null; }
    } else if (e.kind === "OUT") {
      if (cur.breakStart !== null) { cur.breakMs += Math.max(0, e.atMillis - cur.breakStart); cur.breakStart = null; }
      cur.outMillis = e.atMillis;
    }
  });
  if (cur) out.push(cur);
  return out;
}

/** Minutes worked in a FINISHED session. */
export function workedMinutes(s) {
  if (s.outMillis === null) return 0;
  return Math.max(0, Math.round((s.outMillis - s.inMillis - s.breakMs) / 60000));
}

/** Minutes worked SO FAR in an open session at [nowMs], the running break excluded. */
export function workedSoFarMinutes(s, nowMs) {
  const running = s.breakStart !== null ? Math.max(0, nowMs - s.breakStart) : 0;
  return Math.max(0, Math.round((nowMs - s.inMillis - s.breakMs - running) / 60000));
}

/** "7h 30m", "45m", "0h". */
export function hoursText(minutes) {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  if (h === 0 && m === 0) return "0h";
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Great-circle distance in metres (haversine), plenty for "is this phone at the car wash". */
export function distanceMetres(lat1, lon1, lat2, lon2) {
  const r = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

/** INSIDE, OUTSIDE or UNAVAILABLE for one site; the site's radius plus the fix's own accuracy is "inside". */
export function locationCheck(lat, lon, accuracyMetres, site) {
  if (lat == null || lon == null) return "UNAVAILABLE";
  const accuracy = accuracyMetres ?? 0;
  if (accuracy > MAX_USEFUL_ACCURACY_METRES) return "UNAVAILABLE";
  return distanceMetres(lat, lon, site.latitude, site.longitude) <= site.radiusMetres + accuracy ? "INSIDE" : "OUTSIDE";
}

/** Against every site: INSIDE if any says so, else OUTSIDE if any could judge, else UNAVAILABLE. */
export function siteCheck(sites, lat, lon, accuracyMetres) {
  const answers = sites.map((s) => locationCheck(lat, lon, accuracyMetres, s));
  return answers.includes("INSIDE") ? "INSIDE" : answers.includes("OUTSIDE") ? "OUTSIDE" : "UNAVAILABLE";
}

const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const LINK_PREFIX = "https://reimel.xyz/clock/";

/** The 10-letter site code inside a scanned QR (the bare code since 06-10-26, or the old link form), or null. */
export function parseSiteCode(text) {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  let candidate;
  if (trimmed.toLowerCase().startsWith(LINK_PREFIX)) candidate = trimmed.slice(LINK_PREFIX.length).split("?")[0].split("/")[0];
  else if (/^http/i.test(trimmed)) return null;
  else candidate = trimmed;
  candidate = candidate.toUpperCase();
  return candidate.length === 10 && [...candidate].every((c) => CODE_ALPHABET.includes(c)) ? candidate : null;
}

/**
 * The finish Home offers to take back with "Carry on working" (03-11-26, as the app's Home): the person's LAST event is
 * a finish, with a clock in before it, pressed no more than ten minutes ago. Otherwise null. The server's undo_finish
 * (0012) checks again and has the last word (a finish a manager typed in, a clock in after it).
 */
export function undoableFinish(events, nowMs) {
  const known = [...events].filter((e) => e.atMillis <= nowMs + FUTURE_GRACE_MS).sort(ORDER);
  const last = known[known.length - 1];
  if (!last || last.kind !== "OUT") return null;
  if (!known.some((e) => e.kind === "IN" && e.atMillis <= last.atMillis)) return null;
  return nowMs - last.atMillis <= UNDO_FINISH_MS ? last : null;
}

/** What stops "Set the new password": "code", "short", "mismatch", or null (the app keeps its button off until none). */
export function resetProblem(code, p1, p2) {
  const digits = String(code ?? "").replace(/\D/g, "");
  if (digits.length < RESET_CODE_MIN || digits.length > RESET_CODE_MAX) return "code";
  if (String(p1 ?? "").length < MIN_PASSWORD) return "short";
  if (p1 !== p2) return "mismatch";
  return null;
}

/**
 * Which plain sentence a sign-in, code or password error gets (SignInScreen.plain), as a key the page has words for, or
 * null for the server's own sentence. 🚨 Supabase answers a mistyped code AND an expired one with the same "Token has
 * expired or is invalid" (otp_expired), so its sentence must cover both. The short-password message comes before the
 * weak-password code because Supabase gives a short password that code too.
 */
export function authProblem(e) {
  const m = String(e?.message ?? e ?? ""), code = String(e?.code ?? "");
  if (/Invalid login credentials/i.test(m)) return "wrongLogin";
  if (/Email not confirmed/i.test(m)) return "notConfirmed";
  if (code === "otp_expired" || /Token has expired|invalid.*otp|otp.*invalid/i.test(m)) return "badCode";
  if (/Password should be at least/i.test(m)) return "shortPassword";
  if (code === "weak_password" || e?.name === "AuthWeakPasswordError") return "weakPassword";
  if (/rate_limit/i.test(code) || e?.status === 429 || /rate limit|For security purposes/i.test(m)) return "tooMany";
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(m)) return "noSignal";
  return null;
}

/** Once one row in a flush has gone up as offline, the rest do too: order must hold on the server. */
export function asOffline(ageMs, earlierWentOffline) {
  return earlierWentOffline || ageMs > LIVE_MS;
}

/**
 * A row is DROPPED only when the server itself applied a rule to it: one of our own raises (P0001, 42501) or a
 * constraint (23xxx, 22xxx). An expired login, a gateway error, a paused project or no signal keeps it waiting
 * (Net.isRefusal; the rule that was wrong twice on the Android side, README).
 */
export function isRefusal(code) {
  return typeof code === "string" && /^(P0|42|23|22)[0-9A-Z]*$/.test(code);
}

// 🚨 A queued row belongs to a PERSON (15-10-26; the Android app's rule since its 18-09-26 audit, ClockQueue). It is
// tagged with the signed-in person's id when it is queued; a flush sends only that person's rows, under their own login;
// Home shows only theirs. Another person's rows wait on this phone for them and nothing of them is shown. Until then the
// page sent every row under whoever was signed in, so on a shared tablet or a borrowed phone, A's clock in saved with no
// signal went up as B's the moment B signed in.

/** [personId]'s rows, waiting and refused, oldest first. Nobody else's, and never an unclaimed one. */
export function rowsOf(rows, personId) {
  if (!personId) return [];
  return rows.filter((r) => r.personId === personId).sort((a, b) => a.atMillis - b.atMillis);
}

/** What a flush may send while [personId] is signed in: their rows the server has not refused, oldest first. */
export function toSend(rows, personId) {
  return rowsOf(rows, personId).filter((r) => !r.refused);
}

/**
 * Rows queued before 15-10-26 carry no person. Each is given, once, to the person on the card the page last wrote
 * ([lastPersonId]: whoever was signed in when the update arrived). Under the old page any earlier person's rows went up
 * the moment the next person signed in, so a row still here was made by that person unless a send failed for some other
 * reason in between. With no card there is no one to give them to: they are UNCLAIMED, sent by no one, shown to whoever
 * is signed in so the person who made one can tell the manager. 🚨 Decided once and written back: a later sign-in must
 * never inherit them. Returns the rows to write back.
 */
export function claimLegacy(rows, lastPersonId) {
  return rows
    .filter((r) => r.personId === undefined && !r.unclaimed)
    .map((r) => (lastPersonId ? { ...r, personId: lastPersonId } : { ...r, personId: null, unclaimed: true }));
}

/** The rows no person could be found for (claimLegacy): never sent, oldest first. */
export function unclaimed(rows) {
  return rows.filter((r) => r.unclaimed).sort((a, b) => a.atMillis - b.atMillis);
}

/** Monday 00:00 of the week [dayMs] falls in, in the given zone, as the ISO date "2026-10-05". */
export function weekStartIso(dayMs, zone) {
  const d = new Date(dayMs);
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t).value;
  const dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday"));
  const y = Number(get("year")), m = Number(get("month")), day = Number(get("day"));
  const monday = new Date(Date.UTC(y, m - 1, day - dow));
  return monday.toISOString().slice(0, 10);
}

/** The ISO date of an instant in the zone. */
export function dayIso(ms, zone) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ms));
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
