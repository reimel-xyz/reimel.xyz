// Crew+ web clock-in: where the server is (HR_SPEC 11b). The PUBLISHABLE key is the one Supabase says may live inside
// an app or a page: it can do nothing on its own, row-level security is the wall. 🚨 Never a secret key here.
// The zone is ONE constant for now (Albo 09-10-26: the per-company time zone waits for a customer outside the UK).
export const SUPABASE_URL = "https://gplrgrdddmqmttwvmddi.supabase.co";
export const SUPABASE_KEY = "sb_publishable_9eUpeDsjJRXRDwEth_vEZQ_t6eape4O";
export const ZONE = "Europe/London";
export const APP_NAME = "Crew+";
