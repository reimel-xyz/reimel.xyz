// Crew+ web clock-in: where the server is (HR_SPEC 11b). The PUBLISHABLE key is the one Supabase says may live inside
// an app or a page: it can do nothing on its own, row-level security is the wall. 🚨 Never a secret key here.
// ZONE is only the fallback: the page draws in the company's own time zone once the company is read (0055, 26-11-26).
export const SUPABASE_URL = "https://gplrgrdddmqmttwvmddi.supabase.co";
export const SUPABASE_KEY = "sb_publishable_9eUpeDsjJRXRDwEth_vEZQ_t6eape4O";
export const ZONE = "Europe/London";
export const APP_NAME = "Crew+";
