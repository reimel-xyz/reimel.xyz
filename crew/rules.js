// Crew+ web clock-in: the rules, ported from the app's domain so the two cannot disagree (09-10-26, HR_SPEC 11b).
//   Clocking.state   -> state(events, nowMs)
//   Clocking.sessions -> sessions(events)  (finished shifts, for "worked this week"; the open one for "worked so far")
//   Clocking.locationCheck -> locationCheck(lat, lon, accuracy, site)
//   SiteCode.parse   -> parseSiteCode(text)
//   Outbox.asOffline / Net.isRefusal -> asOffline(ageMs, earlierWentOffline), isRefusal(code)
// Pure functions, no DOM, no network: `node --test test/rules.test.mjs` runs them on the PC.

export const KIND = ["IN", "BREAK_START", "BREAK_END", "OUT"];

/** A shift still open this long after its clock in is a forgotten finish, not "working now" (Clocking.NO_ROTA_LIMIT). */
export const NO_ROTA_LIMIT_MS = 14 * 60 * 60 * 1000;
/** Phones and servers disagree by seconds; two minutes is not "the future", five hours is (Clocking.FUTURE_GRACE_SECONDS). */
export const FUTURE_GRACE_MS = 120 * 1000;
/** A fix older than this is unusable for "at the site" (Clocking.MAX_USEFUL_ACCURACY_METRES). */
export const MAX_USEFUL_ACCURACY_METRES = 500;
/** A row sent within this of its tap goes up as a LIVE event with the server's time; older, as recorded offline (Outbox.LIVE_MS). */
export const LIVE_MS = 20 * 1000;

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
