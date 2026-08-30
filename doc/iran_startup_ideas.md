# Iran Startup Ideas — Generation, Feasibility & Financial Analysis

> **Generated:** 2026-08-29 · **Ideas:** 3 · **Architecture:** Responsive Web (PWA) + WebView mobile app (Capacitor) · **Pipeline:** `iran-startup-ideas` → `iran-startup-feasibility` → `iran-startup-financials` (saved as project skills in `.agents/skills/`)

---

## Global Assumptions

| Assumption    | Value used                                                        | Notes                                                                                                                                |
| ------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Exchange rate | **1 USD ≈ 200,000 Tomans** (free market, Aug 2026)                | Official rate ≈ 137,500 Tomans; free-market used because that is what imported costs and informal savings track. 1 Toman = 10 Rials. |
| Team          | Solo developer (with 2–3 person team alternative shown)           | Stack assumed = this monorepo: Next.js PWA (`apps/web`) + NestJS (`apps/api`) + Capacitor WebView                                    |
| Distribution  | Cafe Bazaar + Myket + direct APK (Android); PWA home-screen (iOS) | No official App Store presence in Iran; Google Play billing unavailable.                                                             |
| Payments      | Shaparak gateways (Zarinpal / IDPay / PayPing) in Tomans          | Stripe/PayPal/Play Billing are not options for Iranian merchants.                                                                    |

**FX sources (accessed 2026-08-29):** [alanchand.com USD-IRR](https://alanchand.com/en/currencies-price/usd-hav) (cash ~205,100 T), Mazaneh.net (~201,500 T), Pashizi.com (~201,500 T), Navasan.net (~189,000 T). The rate is volatile; re-verify before making decisions.

---

# Idea 1: هم‌ساختمان (HamSakhteman)

## Skill 1 — Idea Profile

- **Idea Name:** هم‌ساختمان — HamSakhteman ("Co-Building")
- **Core Concept:** A building-management SaaS with a manager dashboard (web) and a resident
  app (PWA/WebView). It digitizes building dues (شارژ ساختمان): online payment of monthly
  charges, a shared-expense ledger, announcements, assembly voting and مصوبات tracking,
  elevator/cleaning contract renewal reminders with inflation-adjusted budget alerts, a unit
  directory, and SMS notices to residents.
- **Target Audience:** Volunteer building managers and professional building-service
  companies (شرکت‌های خدمات ساختمانی) in Tehran and major cities — each company may run
  5–30 buildings. Second audience: residents of mid/large apartment buildings (10–50 units).
  Iran is majority-urban and apartment-dominant; the manager segment alone is in the hundreds
  of thousands.
- **Why it works in Iran:**
  - Building dues are still collected by cash, card-to-card, and paper ledgers; chasing
    arrears eats the (usually volunteer) manager's month.
  - 30–50% inflation reprices shared contracts (elevator maintenance, cleaning, خوابداری)
    several times a year — budgets built in Excel break silently. The tool makes cost
    creep visible to residents, which is exactly the manager's political pain.
  - Current workflow is Excel + WhatsApp groups + a notebook; incumbents are fragmented
    micro-apps with no dominant player and near-zero penetration.
  - Shaparak payment rails (Zarinpal) and trusted SMS (Kavenegar) make billing loops cheap
    to automate.
- **Tech Stack Brief:** Next.js responsive PWA (`apps/web`) for managers and residents,
  wrapped with **Capacitor** for an Android WebView app on Cafe Bazaar/Myket plus a direct-APK
  page; iOS residents use the PWA itself. NestJS API (`apps/api`) + PostgreSQL; Zarinpal in
  Tomans paying directly into the manager's account; Kavenegar SMS for notices/OTP;
  ArvanCloud CDN; RTL-first UI with Jalali billing cycles and a messy-Excel import wizard.

## Skill 2 — Difficulty Review

**Difficulty Score: 5/10** — standard CRUD SaaS + payment/SMS integrations; light licensing;
anchored above 4 only because of two-sided (manager→resident) onboarding and reconciliation
complexity.

**Technical Difficulties**

- Payment reconciliation: partial payments, arrears, and retroactive charge increases under
  inflation — the ledger model must handle "amount owed changed after payment."
- Jalali monthly cycles, Persian digits, and RTL everywhere; billing dates are شمسی.
- Importing years of each building's messy Excel ledgers (mixed Persian/English columns).
- WebView performance on low-end Androids: keep the JS bundle lean; stairwell/basement usage
  means flaky signal → offline-tolerant PWA caching.
- SMS cost discipline (residents get chatty notifications; meter the templates).

**Market/Operational Difficulties**

- Two-sided onboarding: the manager adopts, but value shows only when residents pay —
  hand-holding via phone for less technical managers.
- The buyer (manager) is price-sensitive because the building assembly votes on spend;
  position it as the manager's personal tool with a free tier.
- Churn event: when a manager quits, the account must transfer smoothly or the building is
  lost.
- Growth is per-building (B2B2C), not viral — installs will look unimpressive next to
  consumer apps; the real metric is paying buildings.
- Persian-language phone support during business hours is part of the product.

**Legal/Regulatory Difficulties**

- eNAMAD (اینماد) for online payment + Samandehi (ساماندهی) registration — routine paperwork,
  but required to survive filtering waves.
- Do **not** hold resident funds in a wallet (Central Bank PSP licensing); route payments
  directly to the manager's gateway account.
- Residents' personal data (names, units, phone numbers) → comply with e-commerce-law data
  clauses; keep data on Iran-hosted or sanctions-tolerable infrastructure.

**Verdict:** Ship. Hardest single risk: manager-side onboarding friction, not technology.

## Skill 3 — Financial & Timeline Estimate

**Estimated Development Time:** 10–14 weeks solo (≈ 2.5–3.5 months); 7–10 weeks for a 2–3
person team. Includes payment, SMS, Excel import, and the Capacitor build.

**Assumptions:** premium 150,000–400,000 T/month per building (avg ≈ 250,000 T), free tier
≤ 8 units; SMS bundles and data-import setup fees add ~10–20% upside.

| Horizon  | Installs      | Paying buildings | Monthly income (T)               | Monthly income (USD) |
| -------- | ------------- | ---------------- | -------------------------------- | -------------------- |
| 6 months | 2,000–6,000   | 60–200           | **15M–50M T** (150–500M Rials)   | **$75–$250**         |
| 1 year   | 15,000–40,000 | 250–1,000        | **60M–250M T** (600M–2.5B Rials) | **$300–$1,250**      |

**Monetization Strategy:**

- Freemium SaaS per building — free ≤ 8 units, premium subscription billed via Zarinpal
  (annual plans with SMS renewal nudges, since card-on-file auto-renew is limited).
- Kavenegar SMS bundles resold with a markup (residents genuinely want SMS).
- Paid onboarding/data-import service for buildings with years of Excel history.
- Later: lead fees from vetted building-service providers (elevator, cleaning contracts).

---

# Idea 2: قیمت‌سنج (GheymatSanj)

## Skill 1 — Idea Profile

- **Idea Name:** قیمت‌سنج — GheymatSanj ("Price Gauge")
- **Core Concept:** A fair-price engine for Iran's second-hand market (phones, cars, home
  appliances). It aggregates listings, builds recency-weighted price histories per model, and
  answers the buyer's real question — "is this listing fairly priced?" — from a pasted Divar
  link or a model picker. Deal alerts, price-band charts, and a negotiation script for
  sellers. Data comes from listing aggregation plus crowd-contributed sale reports.
- **Target Audience:** Divar/Bale users buying or selling used phones and cars — largely
  18–35, price-sensitive, millions of monthly classifieds users; plus small resellers who
  need pricing tools and inventory benchmarks.
- **Why it works in Iran:**
  - Inflation makes used prices swing week-to-week; there is no Iranian Kelly Blue Book, so
    every deal is an information fight.
  - New flagships are unaffordable for most → the **used** market _is_ the mass market.
  - Information asymmetry is the tax on every transaction; a credible neutral price band is
    valuable to both sides of millions of deals.
  - Resellers reprice inventory constantly and will pay for alerts and an API.
- **Tech Stack Brief:** Next.js PWA + Capacitor WebView (Cafe Bazaar + direct APK) with
  aggressively cached public price pages (SEO + 3G tolerance); NestJS ingestion workers
  (`apps/api`) for collection/dedupe/price bands; PostgreSQL + scheduled recency-weighted
  models; ArvanCloud CDN. Link-parser accepts Divar URLs for the verdict flow.

## Skill 2 — Difficulty Review

**Difficulty Score: 7/10** — gray-zone data acquisition, a data-cold-start chicken-and-egg,
and incumbent risk from Divar/Torob shipping natively; the tech itself is moderate.

**Technical Difficulties**

- Data acquisition is the long pole: scraping fragility (selectors, rate limits, IP blocks)
  and a parser-maintenance treadmill; partnership-first strategy is slower but sturdier.
- Dedupe and spam filtering — dealer re-listings and bait prices distort medians; price bands
  must be recency-weighted under 30–50% inflation or they're instantly stale.
- SEO-scale public pages on cheap Iranian infrastructure; heavy caching required for 3G.
- WebView constraints: charts must be lightweight (canvas/SVG, no heavy chart frameworks).

**Market/Operational Difficulties**

- Cold start: months of data collection before the verdict is credible — plan a content/SEO
  and Telegram-channel phase before the app feels magical.
- Trust: "where does this number come from?" — publish methodology and sample sizes.
- Incumbent risk: Divar or Torob can ship price-history features natively; the defense is
  being cross-platform and independent.
- Monetization is thin early (Iranian ad eCPMs are low); growth channels (Telegram/Instagram)
  are exposed to filtering swings.
- Persian support burden: valuation disputes arrive angry.

**Legal/Regulatory Difficulties**

- Scraping conflicts with source ToS (civil/blocking risk) and republishing listing photos
  or phone numbers raises privacy/copyright issues — publish aggregates, never listings.
- Valuation disclaimers are mandatory (fraud and dispute exposure).
- eNAMAD + Samandehi registration; user-submitted reports create a moderation duty
  (پاسخگویی) — moderation tooling from day one.

**Verdict:** Ship-with-changes — only with a partnership-first data strategy and aggregates-only
publishing. Highest ceiling in this portfolio, highest risk.

## Skill 3 — Financial & Timeline Estimate

**Estimated Development Time:** 12–16 weeks solo; 9–12 weeks for a small team (the data
pipeline, not the UI, is the long pole).

**Assumptions:** premium subscription 99,000–199,000 T/month (avg ≈ 150,000 T); free→paid
conversion 0.5–1.5%; display ads via Yektanet/Tapad at ~2,000–20,000 T eCPM.

| Horizon  | Installs        | Monthly income sources                       | Monthly income (T)             | Monthly income (USD) |
| -------- | --------------- | -------------------------------------------- | ------------------------------ | -------------------- |
| 6 months | 40,000–100,000  | ads 5–15M + subs 20–70M                      | **25M–85M T** (250–850M Rials) | **$125–$425**        |
| 1 year   | 300,000–700,000 | ads 20–60M + subs 180–450M + B2B API 50–100M | **250M–600M T** (2.5–6B Rials) | **$1,250–$3,000**    |

**Monetization Strategy:**

- Freemium consumer: unlimited deal alerts + full price history for 99,000–199,000 T/month
  via gateway subscription.
- Local ad networks (Yektanet/Tapad) on free-tier price pages — high pageviews, low eCPM.
- B2B data/API licensing: aggregated price bands sold to resellers, insurers, and analysts.
- Lead generation for inspection services (e.g., used-car expert checks) — pay per booking.

---

# Idea 3: بوم‌سفر (BoomSafar)

## Skill 1 — Idea Profile

- **Idea Name:** بوم‌سفر — BoomSafar ("Eco-Travel")
- **Core Concept:** A direct-booking marketplace for eco-lodges (اقامتگاه بوم‌گردی),
  cottages, and rural guesthouses: verified listings with real photos and exact Jalali price
  calendars, online prepayment with clear refund terms, reviews, and in-app host messaging.
  Hosts get a dead-simple PWA mini-PMS (calendar, bookings, payout view) that works on a
  low-end Android phone.
- **Target Audience:** Urban middle-class families and young travelers riding the سفر ایرانی
  (domestic travel) wave — Nowruz and summer peaks. Supply side: 2,000+ licensed eco-lodges
  nationwide plus thousands of unlicensed rural guesthouses, most reachable today only by
  phone or Instagram DM.
- **Why it works in Iran:**
  - Dollar-priced outbound travel is out of reach for most of the market → domestic tourism
    demand keeps growing while supply is digitally invisible.
  - Lodges live scattered across Instagram pages and phone numbers; there is no unified,
    trustworthy inventory; the booking culture is phone calls and hopeful DMs.
  - Trust gap: photos ≠ reality, no reviews, no standard cancellation terms.
  - International OTAs (Booking.com et al.) cannot serve Iranian properties (payments/
    sanctions), leaving genuine white space that local players cover only thinly.
- **Tech Stack Brief:** Next.js PWA + Capacitor WebView; booking calendar built around Jalali
  date ranges; Zarinpal prepayment paying hosts directly minus the service fee (no wallet,
  no Central Bank licensing); Kavenegar SMS confirmations; lightweight static map tiles for
  low-bandwidth rural use; NestJS + PostgreSQL.

## Skill 2 — Difficulty Review

**Difficulty Score: 6/10** — moderate tech, but supply acquisition is physical work and the
sector carries real (manageable) licensing checks.

**Technical Difficulties**

- Double-booking prevention and calendar sync across hosts who also take phone bookings —
  overbooking is the fastest way to kill trust.
- Cancellation/refund edge cases at the gateway level (partial refunds, host-no-show).
- Low-bandwidth maps and image-light listing pages for 3G rural networks.
- Peak-season load spikes (Nowruz) on cheap infrastructure; SMS confirmations as fallback.

**Market/Operational Difficulties**

- Supply acquisition is boots-on-ground: rural hosts with low digital literacy need phone
  (or agent) onboarding, photos taken for them, calendars seeded.
- Extreme seasonality: 2–3 peak months carry the year; winters are dead — plan cash flow.
- 24/7 Persian support during peaks; cancellation culture requires firm, fair policies.
- Instagram is the real competitor (hosts list there for free); the pitch is that the
  platform brings guests they wouldn't otherwise reach.
- Jabama/Aliababa can move down-market into this niche; differentiate on the long tail of
  tiny rural lodges they don't cover.

**Legal/Regulatory Difficulties**

- eNAMAD + Samandehi; consumer-protection refund/cancellation terms must be explicit.
- Verify each host's accommodation permit (مجوز اقامتگاه from میراث فرهنگی) to limit
  platform liability; carry both licensed lodges and a clearly-labeled pending tier.
- Stay a booking platform — selling packages drifts into travel-agency licensing
  (دفتر خدمات مسافرتی).

**Verdict:** Ship-with-changes — launch in one province with a local partner, not nationally.

## Skill 3 — Financial & Timeline Estimate

**Estimated Development Time:** 14–18 weeks solo; 10–14 weeks for a small team (booking
engine + host mini-PMS + payment/refund flows).

**Assumptions:** average booking = 2 nights × 2,000,000 T/night ≈ 4,000,000 T GMV; service
fee 10%; featured listings add 5–15M T/month at maturity.

| Horizon  | Installs      | Bookings/month | Monthly income (T)               | Monthly income (USD) |
| -------- | ------------- | -------------- | -------------------------------- | -------------------- |
| 6 months | 8,000–20,000  | 80–250         | **30M–110M T** (300M–1.1B Rials) | **$150–$550**        |
| 1 year   | 30,000–70,000 | 600–2,000      | **250M–900M T** (2.5–9B Rials)   | **$1,250–$4,500**    |

(1-year math: 600–2,000 bookings × 4M T GMV × 10% fee = 240–800M T, plus featured listings
and small white-label deals.)

**Monetization Strategy:**

- 10% service fee on prepaid bookings (fee split transparently at checkout).
- Featured/promoted listings for hosts during peak seasons.
- Cancellation-fee share per published policy.
- White-label booking pages for small tour operators; later, rural experiences add-ons.

---

# Portfolio Comparison

| Idea                    | Difficulty | MVP (solo) | 6-mo monthly income   | 1-yr monthly income        | First revenue                     |
| ----------------------- | ---------- | ---------- | --------------------- | -------------------------- | --------------------------------- |
| هم‌ساختمان HamSakhteman | **5/10**   | 10–14 wks  | 15M–50M T ($75–250)   | 60M–250M T ($300–1,250)    | Within weeks of launch            |
| قیمت‌سنج GheymatSanj    | **7/10**   | 12–16 wks  | 25M–85M T ($125–425)  | 250M–600M T ($1,250–3,000) | After data matures (~mo 4–6)      |
| بوم‌سفر BoomSafar       | **6/10**   | 14–18 wks  | 30M–110M T ($150–550) | 250M–900M T ($1,250–4,500) | From first bookings, but seasonal |

# Recommendation

**Start with HamSakhteman.** It has the lowest difficulty (5/10), the cleanest legal path, a
sticky B2B audience that compounds per building, and it maps 1:1 onto this monorepo's
SaaS-shaped stack (Next.js + NestJS + gateway payments). GheymatSanj has the highest consumer
ceiling but only makes sense with a partnership-first data strategy and a tolerance for
gray-zone legal risk. BoomSafar is the best revenue-per-user story but demands a co-founder
or partner doing physical supply acquisition in a target province.

---

## Disclaimer

All figures are scenario-planning ranges, not forecasts; the conservative end is the likelier
outcome. USD equivalents depend on a volatile free-market rate (≈ 200,000 T/USD at writing —
re-verify before deciding). Nothing here is legal advice; licensing requirements should be
confirmed with a local lawyer before launch.
