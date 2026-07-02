# reimel.xyz — Reimel Ltd company website

Static company site for **Reimel Ltd**, hosted on GitHub Pages under the custom domain **reimel.xyz**.
Purpose: pass **Google Play Console organization verification** and host the app privacy policies, replacing
the old Google Sites page. No frameworks, no build step, no external requests — plain HTML/CSS.

## Contents

```
index.html                 Company home (name, no. 14523345, registered office, description)
apps/index.html            Products — PropDeck + Tasbih+ (+ links to the other policies)
contact.html               Contact (support@reimel.xyz + registered office)
privacy/propdeck.html      PropDeck (ported from "Trading Calc"; Play Billing content already present)
privacy/tasbih-plus.html   Tasbih+ (NEW, corrected — location/notifications/offline, matches its manifest)
privacy/tasbih.html        Tasbih Counter (VIBRATE only)
privacy/dictionary.html    Eng-Alb Dictionary  ⚠️ see checklist item 2
privacy/appkeeper.html     App Keeper (QUERY_ALL_PACKAGES etc. — disclosed)
privacy/officecalc.html    OfficeCalc (no permissions)
style.css                  Shared styles
favicon.svg                Favicon
CNAME                      contains: reimel.xyz
```

Footer on every page: `Reimel Ltd · Company No. 14523345 · Registered in England and Wales · Registered office: 159a High Street, Hornchurch, England, RM11 3YD` + `support@reimel.xyz`.

---

## ✅ Pre-publish checklist (do these BEFORE pointing Play Console at the site)

1. **Companies House details — confirm they match your certificate.** These were taken from the public
   register (find-and-update.company-information.service.gov.uk/company/14523345, "REIMEL LTD", Active) and
   are used verbatim in the footer + home page:
   - Name: **Reimel Ltd** · Company No. **14523345** · **Registered in England and Wales**
   - Registered office: **159a High Street, Hornchurch, England, RM11 3YD**
   A mismatch here is the classic verification failure — eyeball it against the incorporation certificate once.
2. **⚠️ Eng-Alb Dictionary manifest still declares `CAMERA`.** `EngAlbDict/app/src/main/AndroidManifest.xml`
   still has `<uses-permission android:name="android.permission.CAMERA"/>` + a `uses-feature`, even though it
   was meant to be removed in v1.6 and the app has no camera code. The dictionary policy says "no special
   permissions." **Remove those two lines and rebuild/re-upload the APK** so the app's declared permissions
   match the policy (and the Play Data Safety form). Not blocking for the two apps being verified now
   (PropDeck, Tasbih+), but fix before relying on the dictionary policy.
3. **Contact address = `support@reimel.xyz` everywhere** (site, all policies, Play Console). The hand-off
   mentioned `contact@reimel.xyz` once for the contact page, but its own email-routing note says keep
   `support@reimel.xyz` as the single address (it already exists and is on the live policies). I used
   `support@` throughout. If you actually want a separate `contact@`, set up its routing first, then change
   `contact.html` + the footers.
4. **No placeholder pages** — every page is real content. Don't publish until 1–3 are settled.

---

## 1. GitHub Pages

1. Create a new repo (e.g. `reimel/reimel.xyz`, or under your account) and push these files to the default branch.
2. Repo → **Settings → Pages** → *Build and deployment* → **Deploy from a branch** → branch `main` / folder `/ (root)`.
3. Under **Custom domain**, enter `reimel.xyz` (the `CNAME` file already contains it, so this should auto-fill).
4. After DNS propagates (below), tick **Enforce HTTPS** (Play requires `https://`).

## 2. DNS (at your domain registrar)

- **Apex `A` records** for `reimel.xyz` → GitHub Pages IPs (add all four):
  - `185.199.108.153`
  - `185.199.109.153`
  - `185.199.110.153`
  - `185.199.111.153`
- **`CNAME` `www`** → `<github-username>.github.io.` (replace with your GitHub username/org).
- ⚠️ **Preserve existing email records.** When editing DNS, do **not** remove or overwrite any existing
  `MX` / forwarding / TXT records that make `support@reimel.xyz` work. Add the A/CNAME records alongside
  them. If mail stops after the change, a mail record was clobbered — restore it. (Only the A/CNAME/TXT
  below are new; MX stays as-is.)

## 3. Google Search Console (proof of ownership — what Play leans on)

1. Search Console → add a **Domain** property: `reimel.xyz`.
2. Copy the **TXT** verification record it gives you → add it at the registrar (alongside, not replacing,
   existing records) → **Verify**.

## 4. Google Play Console

1. Set the developer **website** to `https://reimel.xyz` and the **contact email** to `support@reimel.xyz`.
2. Per-app **privacy policy URLs**:
   - PropDeck → `https://reimel.xyz/privacy/propdeck.html`
   - Tasbih+ → `https://reimel.xyz/privacy/tasbih-plus.html`
   - (others under `https://reimel.xyz/privacy/…`)
3. Re-submit **organization verification**.
4. Ensure each app's **Data Safety** form matches its policy AND its manifest (Tasbih+: location used but
   *not collected/shared*; PropDeck: purchases via Google Play).

**Keep the old Google Sites page up** until Play verification succeeds on the new domain.
