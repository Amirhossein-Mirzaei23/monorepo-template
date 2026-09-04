# Iran Startup Pipeline — Ideas, Market Sizing, Validation & Financials

**Generated:** 2026-09-04 · **Ideas:** 3 · **Architecture:** Responsive Web (PWA) + WebView mobile app (Capacitor)
**Pipeline:** `iran-startup-ideas` → `iran-market-sizing` → `iran-startup-validator` → `iran-startup-financials`
**Operator goal (default used):** solo developer building for income — difficulty ≤ 6, fast legal revenue.
_Predecessor run (2026-08-29, ideas → feasibility → financials pipeline) is preserved at [iran_startup_ideas.md](iran_startup_ideas.md)._

---

## Global Assumptions

| Assumption                 | Value used                                                                | Notes / sources                                                                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exchange rate              | **1 USD ≈ 221,400 Tomans** (free market, 2026-09-04)                      | Cross-checked: [Pashizi](https://www.pashizi.com/en/currency/usd) & AlanChand (221,400 T), [Navasan](https://navasan.net) (221,200 T). Official rate ≈ 137,500 T. 1 Toman = 10 Rials. |
| Inflation                  | **87.9% point-to-point** (July 2026; peak 88.6% in June)                  | [Trading Economics — Iran CPI](https://tradingeconomics.com/iran/inflation-cpi); IMF 2026 average projection 68.9%                                                                    |
| Team                       | 1 solo developer                                                          | Stack = this monorepo: Next.js PWA (`apps/web`) + NestJS + PostgreSQL (`apps/api`) + Capacitor WebView                                                                                |
| Distribution               | Cafe Bazaar + Myket + direct APK (Android); PWA home-screen (iOS)         | iOS revenue modeled as **0**; Telegram/Instagram are the growth channels                                                                                                              |
| Payments                   | Zarinpal / PayPing (Shaparak rails), Tomans, manual-renewal subscriptions | No wallets held (CBI licensing); gateway fee ~1%                                                                                                                                      |
| Pricing policy             | Toman prices reviewed **quarterly**, or sold as annual prepaid            | 88% p2p inflation breaks fixed monthly toman pricing                                                                                                                                  |
| Developer opportunity cost | ~80M T/month (mid-level)                                                  | Used for breakeven math — adjust to your own                                                                                                                                          |

**Units:** everyday figures in Tomans (T); official/bank figures often in Rials (1 T = 10 IRR). USD equivalents at 221,400 T/USD.

---

# Idea 1: فروشیار (ForooshYar)

## Skill 1 — Idea Profile

- **Idea Name:** فروشیار — ForooshYar ("Seller's Mate")
- **Core Concept:** An operating system for Instagram/Telegram home sellers: a shareable,
  Jalali-aware price-list page (link-in-bio catalog), order capture forms, Zarinpal payment
  links, simple inventory with toman cost tracking, and **repricing reminders when supplier
  costs change**. Seller web dashboard + seller WebView app + buyer-facing PWA catalog.
- **Target Audience:** Instagram/Telegram home-business sellers (clothing, food, cosmetics,
  handicrafts) with ~500–50,000 followers nationwide; the realistic paying tier is the
  ~50–100k sellers doing >100M T/month revenue.
- **Why it works in Iran:** Instagram DM is the de-facto storefront (sanctions killed Shopify
  access); at 87.9% p2p inflation sellers re-price weekly, and DM-based ordering loses orders
  and price history. Observable signals: ~700k–1.2M active Instagram sellers (segment anchor);
  paid Telegram shop-bot services already sell at ~150k–500k T/month — proof this segment pays
  for tooling; Shaparak payment links make checkout automatable.
- **Tech Stack Brief:** Next.js PWA + Capacitor (Cafe Bazaar/Myket + direct APK), NestJS +
  PostgreSQL, Zarinpal/PayPing, Kavenegar SMS (OTP + new-order alerts), Jalali calendar,
  ArvanCloud CDN, Excel/CSV price-list import.
- **Monetization model:** freemium SaaS — free tier capped at 1 catalog page / 20 items;
  Pro ~150k T/month (3-month 390k, annual 1.29M T ≈ 107k T/month effective).
- **Main risks:** no official Instagram commerce API (catalogs updated semi-manually);
  seller churn under inflation (manual-renewal churn 10–20%/month); Divar/Digikala
  seller-tool gravity.
- **MVP suggestion (4–8 weeks):** Telegram bot + single shareable price-list page with Excel
  import and a Zarinpal link; recruit 50 pilot sellers via Instagram DM; validate willingness
  to pay with a 3-month prepaid plan.
- **Estimated difficulty:** 4/10

## Skill 2 — Market Sizing

**Assumptions:** segment = active Instagram/Telegram sellers (~1M); blended paying ARPU
**120k T/month** (inside the verified 30k–200k T/month band Iranian SMEs actually pay);
scope national; reach via Instagram/Telegram seller communities with a 20–40%
filtering-friction discount.

| Layer             | Customers                      | Annual revenue (Toman) | USD equiv. |
| ----------------- | ------------------------------ | ---------------------- | ---------- |
| TAM               | ~1.0 M sellers                 | ~1,440 B               | ~$6.5 M    |
| SAM               | ~200 k reachable + able to pay | ~288 B                 | ~$1.3 M    |
| SOM (by month 24) | ~1.5 k paying                  | ~2.2 B                 | ~$10 k     |

**Reality checks:**

1. **Top-down:** 1,500 paying sellers from a 1M pool = 0.15% — modest.
2. **Bottom-up:** a 100k-member seller community at 2–3% paid conversion ≈ 2–3k payers —
   matches SOM only with sustained content marketing.
3. **Comparison:** paid Telegram shop-bot services reportedly serve tens of thousands of
   business users — same ballpark.
4. **Payment:** sellers already pay online via Shaparak monthly; discount applied for
   manual-renewal friction.

**Sensitivity:** bear ~1.1 B T/yr (800 payers) · bull ~4.3 B T/yr (3k payers).
**Verdict on size:** enough for a bootstrapped solo income play; not a VC-scale ceiling
without expanding into full storefront/payments.

## Skill 3 — Validation

**Category:** good 　**Success score:** 68 / 100

**Justification:** This is the rare Iranian "SME SaaS" where monetization is already proven —
sellers pay for Telegram shop bots and design services today — and it is single-sided (no
cold start), so the outcome is mostly execution-controlled. Held under 70 for weak SME
willingness-to-pay at scale and manual-renewal churn.

**Main risks:**

- Instagram filtering/VPN friction cuts reachable sellers by 20–40% and can crush
  acquisition overnight during protest waves.
- Manual-renewal churn (10–20%/month) makes year-one revenue churn-dominated; a Zarinpal
  hiccup stalls renewals.
- No official Instagram API — catalog sync stays semi-manual, capping perceived value.

**What would improve the idea:** niche down to one vertical (e.g., home-cooked food sellers)
with portion/Jalali-preorder templates; sell **annual prepaid** plans priced in gold-gram
equivalents to lock revenue against inflation churn.

**Final recommendation:** **test** (score in the 60–70 band) → build if the 50-seller pilot
shows ≥30% conversion to 3-month prepaid.

## Skill 4 — Financial & Timeline Estimate

Difficulty 4/10 → **full range applies**. Archetype: B2B SaaS, solo → **MVP 12–19 weeks**
(~3–4.5 months, incl. WebView polish).

|                         | Conservative    | Mid               | Optimistic        |
| ----------------------- | --------------- | ----------------- | ----------------- |
| Month-6 seller installs | 1,200           | 2,500             | 5,000             |
| Month-6 paying / gross  | 60 → 7.2M T/mo  | 150 → 18M T/mo    | 300 → 36M T/mo    |
| Month-6 costs / net     | ~8M → **−1M T** | ~12M → **+6M T**  | ~17M → **+19M T** |
| Month-12 paying / gross | 100 → 12M T/mo  | 350 → 42M T/mo    | 700 → 84M T/mo    |
| Month-12 costs / net    | ~12M → **~0 T** | ~18M → **+24M T** | ~24M → **+60M T** |

Math: payers × 120k T blended ARPU; costs = VPS/CDN 4–8M + Kavenegar OTP/order SMS 3–8M +
~1% gateway + misc; churn 15%/month. Month-12 net USD: $0 / **$108** / $271 per month.
**Breakeven:** MVP investment ≈ 12–19 wk × 80M T ≈ 230–350M T → mid trajectory repays around
**month 20–24**; conservative case does not break even within 24 months.
**Monetization mechanisms:** freemium SaaS (hard-capped free tier) + gateway subscriptions
(Zarinpal); SMS-bundle resale later.

---

# Idea 2: تورم‌یار (Toolmayar)

## Skill 1 — Idea Profile

- **Idea Name:** تورم‌یار — Toolmayar ("Inflation Mate")
- **Core Concept:** A personal inflation tracker: users build their household basket (rice,
  chicken, rent, school fees, gold-coin savings), the app tracks prices from public online
  listings plus crowdsourced receipts, shows each family's **personal inflation rate vs
  official CPI**, and alerts on abnormal spikes. Gold-denominated savings goals (gram
  accounting only — no trading, no license).
- **Target Audience:** urban, price-anxious households in the top 7 cities, ages 25–45
  (income deciles 7–9, ~7.5M households); salaried employees arming themselves for raise
  negotiations. National reach via Telegram/Instagram.
- **Why it works in Iran:** 87.9% p2p inflation makes "what did MY basket cost last Nowruz?"
  a daily emotional question; official CPI is widely distrusted; households already
  obsessively follow dollar/coin Telegram price channels (multiple 100k+-member channels —
  observable); rent and salary indexation need a defensible personal index. Global budgeting
  apps fail here (payments, language, no Persian baskets).
- **Tech Stack Brief:** Next.js PWA + Capacitor (Cafe Bazaar + direct APK), NestJS +
  PostgreSQL time-series tables, price ingestion from public listings + crowdsourced
  submissions, Kavenegar OTP, ArvanCloud CDN, Jalali everywhere.
- **Monetization model:** freemium — free 10-item basket; Premium ~69k T/month or 590k T/year
  (~49k T/month effective); later B2B anonymized data reports (media, retail).
- **Main risks:** weak consumer willingness-to-pay for utilities (content beats utility in
  Iranian subscription behavior); data-sourcing legality (Torob/Digikala ToS vs crowdsourced
  mixes); virality is luck-gated on a price-shock moment.
- **MVP suggestion (6–8 weeks):** Telegram bot ("چند بود ماه پیش؟") + static PWA charting 20
  staples over 12 months; 1,000-waitlist test via price-watcher channels.
- **Estimated difficulty:** 4/10

## Skill 2 — Market Sizing

**Assumptions:** segment = urban price-conscious individuals ~6M (from ~30M decile-7–9
individuals, filtered to 25–45 + actively follows prices); paying ARPU **60k T/month**
(inside the 30k–100k T consumer band that converts); scope national; reach via
Telegram/Instagram with filtering discount.

| Layer             | Customers                  | Annual revenue (Toman) | USD equiv. |
| ----------------- | -------------------------- | ---------------------- | ---------- |
| TAM               | ~6 M individuals           | ~4,320 B               | ~$19.5 M   |
| SAM               | ~1.2 M reachable + willing | ~864 B                 | ~$3.9 M    |
| SOM (by month 24) | ~6 k paying subs           | ~4.3 B (+ads)          | ~$19.5 k   |

**Reality checks:**

1. **Top-down:** 6k payers from 6M anxious users = 0.1% — realistic for an unknown utility.
2. **Bottom-up:** 60k installs at 1% paid ≈ 600 payers in year 1 — consistent.
3. **Comparison:** Filimo (entertainment) sustains 1M+ subscribers at 100–200k T/month, but
   content willingness-to-pay is far higher than utility — discount applied.
4. **Payment:** consumer Shaparak billing works; churn-heavy.

**Sensitivity:** bear ~1.5 B T/yr · bull ~12 B T/yr (viral price-shock moment + 2% conversion).
**Verdict on size:** decent national-scale ceiling, but a hits-driven consumer bet — big only
if the wave comes.

## Skill 3 — Validation

**Category:** lucky 　**Success score:** 57 / 100

**Justification:** The pain is universal and intensifying, but monetization is gated by two
things the founder doesn't control: a viral/price-shock distribution moment and Iranian
consumers' weak willingness-to-pay for utilities. Upside is real; expected value is moderate.

**Main risks:**

- Consumer subscription churn: 0.5–3% free→paid is the realistic band; at 60k T/month this
  needs six-figure installs to matter.
- Price-data sourcing: scraping Torob/Digikala violates their ToS and invites blocking;
  crowdsourced data has accuracy/coverage cold-start problems.
- Publishing inflation figures sits near sensitive-statistics territory — a subsidy-cut or FX
  shock can bring regulatory attention, not just growth.

**What would improve the idea:** anchor distribution to **salary-raise season (Farvardin)**
with a paid "raise negotiation report"; co-launch with an established Telegram price channel
instead of building an audience from zero.

**Final recommendation:** **test** (cheap Telegram-bot validation before building the data
pipeline).

## Skill 4 — Financial & Timeline Estimate

Difficulty 4/10 → **full range applies**. Archetype: consumer data product, solo →
**MVP 14–20 weeks** (~3.5–5 months, incl. ingestion pipeline + WebView polish).

|                            | Conservative      | Mid               | Optimistic        |
| -------------------------- | ----------------- | ----------------- | ----------------- |
| Month-6 installs           | 25,000            | 55,000            | 100,000           |
| Month-6 paying / sub gross | 125 → 7.5M T/mo   | 550 → 33M T/mo    | 1,500 → 90M T/mo  |
| Month-6 ads (Yektanet)     | +2M T             | +5M T             | +10M T            |
| Month-6 costs / net        | ~9M → **+0.5M T** | ~16M → **+22M T** | ~22M → **+78M T** |
| Month-12 installs          | 60,000            | 150,000           | 300,000           |
| Month-12 paying / gross    | 300 → 18M T/mo    | 1,500 → 90M T/mo  | 4,500 → 270M T/mo |
| Month-12 net               | **+8M T**         | **+80M T**        | **+260M T**       |

Math: installs × free→paid (0.5% / 1% / 1.5%) × 60k T; ads = MAU × ~40 impressions × ~4k T
eCPM; costs = VPS/pipeline/CDN + OTP SMS, inflation-indexed. Month-12 net USD: $36 /
**$361** / $1,174 per month (the optimistic column is explicitly luck-gated — do not plan
around it).
**Breakeven:** MVP investment ≈ 280–400M T → mid trajectory repays around **month 15–18**;
conservative case needs 30+ months.
**Monetization mechanisms:** gateway subscriptions (Zarinpal annual prepaid) + local ad
networks (Yektanet/Tapad) + eventual B2B anonymized data licensing.

---

# Idea 3: تعمیرجا (TamirJaa)

## Skill 1 — Idea Profile

- **Idea Name:** تعمیرجا — TamirJaa ("Repair Place")
- **Core Concept:** A transparent home-appliance & AC repair marketplace: fixed published
  diagnostic fee, index-linked price ranges per repair type, verified technicians, Jalali
  service-history warranty records. Customer PWA/WebView app + technician responsive web
  dashboard.
- **Target Audience:** households in Tehran/Karaj (~5M households) with aging appliances;
  independent repair technicians (thousands, organized through bazaar guild networks) hungry
  for steady jobs.
- **Why it works in Iran:** at ~88% inflation, replacement is unaffordable → repair demand is
  structurally surging (observable: Divar repair-category volume; wide new-vs-refurbished
  price spreads); import restrictions keep new-appliance prices climbing; technicians are
  found via street signs and word-of-mouth with zero price transparency and rampant parts
  overcharging. Divar's services category doesn't standardize pricing or warranty.
- **Tech Stack Brief:** Next.js PWA + Capacitor for customers; technician dashboard responsive
  web; NestJS + PostgreSQL; Zarinpal prepaid diagnostic fee; Kavenegar SMS dispatch; Jalali
  service records; ArvanCloud.
- **Monetization model:** ~10% commission on platform-collected diagnostic + fixed ~60k T
  booking fee; blended effective take ~7% of job GMV (cash-job leakage); featured technician
  listings later.
- **Main risks:** technician supply-side acquisition and quality control; publishing "fixed"
  prices that inflation invalidates monthly (must be index-linked ranges); guild (اصناف)
  friction and Divar's gravity in services.
- **MVP suggestion (8–12 weeks):** concierge marketplace — Telegram bot + spreadsheet matching
  20 vetted technicians across 2 Tehran districts with a fixed menu of 10 common repairs;
  validate take rate and repeat rate before building the app.
- **Estimated difficulty:** 6/10

## Skill 2 — Market Sizing

**Assumptions:** Tehran metro ~5M households × ~1.5 repair jobs/household/year; average job
GMV 2.5M T (parts + labor, Sept-2026 prices); platform effective take ~7–8%; scope
Tehran-first with national extrapolation.

| Layer                                     | Customers (jobs/yr) | Annual platform revenue (Toman) | USD equiv. |
| ----------------------------------------- | ------------------- | ------------------------------- | ---------- |
| TAM (Tehran)                              | ~7.5 M jobs         | ~1,500 B                        | ~$6.8 M    |
| TAM (national: 25M households × 1.2 jobs) | ~30 M jobs          | ~6,000 B                        | ~$27 M     |
| SAM (Tehran digital-reachable ~30%)       | ~2.3 M jobs         | ~450 B                          | ~$2.0 M    |
| SOM (by month 24, ~2,000 jobs/mo)         | ~24 k jobs          | ~4.2 B (+featured)              | ~$19 k     |

**Reality checks:**

1. **Top-down:** 2,000 jobs/month out of ~625k monthly Tehran repair jobs = 0.3% — believable.
2. **Bottom-up:** 300 vetted technicians × ~7 jobs/month each = 2,100 jobs — matches SOM.
3. **Comparison:** well below Divar's services scale — a niche wedge, not an incumbent threat.
4. **Payment:** diagnostic prepaid via Zarinpal; the cash-paid remainder is why effective
   take is discounted to ~7%.

**Sensitivity:** bear ~2.1 B T/yr · bull ~7 B T/yr (Karaj expansion + parts-quote upsell).
**Verdict on size:** solid single-metro income play with national-scale upside if the ops
playbook replicates.

## Skill 3 — Validation

**Category:** lucky 　**Success score:** 52 / 100

**Justification:** The demand tailwind is structural (inflation forces repair-over-replace),
but this is a two-sided marketplace with cold-start risk and hands-on ops — success is gated
by supply-side acquisition and trust-building that a solo dev only partially controls.

**Main risks:**

- Cold start: 20 vetted, trustworthy technicians is the real MVP; recruiting them is sales
  work, not code.
- Cash-economy leakage: technicians and customers settle card-to-card outside the platform,
  evaporating commission.
- Guild/regulatory friction (اصناف) and liability when a repair goes wrong — warranty
  disputes land on the platform's brand.

**What would improve the idea:** start as an **agency, not a marketplace** — deal directly
with 10 technicians, own the quality loop, take a real margin; publish index-linked price
_ranges_ (updated monthly) rather than fixed prices.

**Final recommendation:** **test** (the Telegram-bot concierge MVP in 2 districts before any
app).

## Skill 4 — Financial & Timeline Estimate

Difficulty 6/10 → **midpoint is the base case**. Archetype: two-sided marketplace, solo →
**MVP 17–23 weeks** (~4–5.5 months, incl. WebView polish). Seasonality: Nowruz pre-clean +
summer AC peaks run 2–3× off-season.

|                           | Conservative     | Mid (base)        | Optimistic        |
| ------------------------- | ---------------- | ----------------- | ----------------- |
| Month-6 consumer installs | 4,000            | 8,000             | 15,000            |
| Month-6 jobs / gross      | 150 → 26M T/mo   | 350 → 61M T/mo    | 600 → 105M T/mo   |
| Month-6 costs / net       | ~25M → **+1M T** | ~28M → **+33M T** | ~32M → **+73M T** |
| Month-12 jobs / gross     | 400 → 70M T/mo   | 1,200 → 210M T/mo | 2,200 → 385M T/mo |
| Month-12 net              | **+38M T**       | **+170M T**       | **+330M T**       |

Math: jobs × 2.5M T GMV × 7% effective take; costs = VPS 4M + SMS dispatch 4M + part-time
support 12M+ (non-optional for marketplaces) + technician onboarding. Month-12 net USD:
$172 / **$767** / $1,490 per month.
**Breakeven:** MVP investment ≈ 340–460M T → midpoint base repays around **month 14–16**;
conservative case ~month 22+.
**Monetization mechanisms:** transaction/service fee (pay technicians directly, never hold
funds) + featured/promoted technician listings.

---

# Portfolio Summary

## Ranking (iran-startup-validator)

| Rank | Idea               | Category | Score | Recommendation |
| ---- | ------------------ | -------- | ----- | -------------- |
| 1    | فروشیار ForooshYar | good     | 68    | test → build   |
| 2    | تورم‌یار Toolmayar | lucky    | 57    | test           |
| 3    | تعمیرجا TamirJaa   | lucky    | 52    | test           |

## Financial comparison (mid / base cases)

| Idea       | MVP time (solo) | 6-mo net /mo   | 1-yr net /mo    | Breakeven    |
| ---------- | --------------- | -------------- | --------------- | ------------ |
| ForooshYar | 12–19 weeks     | +6M T (~$27)   | +24M T (~$108)  | ~month 20–24 |
| Toolmayar  | 14–20 weeks     | +22M T (~$99)  | +80M T (~$361)  | ~month 15–18 |
| TamirJaa   | 17–23 weeks     | +33M T (~$149) | +170M T (~$767) | ~month 14–16 |

## Recommendation

**Spend the next 90 days on ForooshYar.** It is the only `good`-category idea — single-sided,
monetization already proven by the paid Telegram-shop-bot market, and reachable without a
viral moment; run the 50-seller prepaid pilot and build only on ≥30% conversion. TamirJaa has
the highest base-case income (inflation structurally feeds repair demand) but its two-sided
cold start and cash-leakage risk make it a second bet to start once ForooshYar's MVP is
shipping. Toolmayar is worth only a cheap Telegram-bot test, timed to the next price-shock
news cycle. All three are toman-denominated income plays at solo scale — none clears the
Iranian VC bar (SOM ≥ ~500B T/yr in year 3) without national marketplace expansion.

---

## Sources & Freshness

- FX free-market (221,400 T/USD, 2026-09-04): [Pashizi](https://www.pashizi.com/en/currency/usd),
  AlanChand, [Navasan](https://navasan.net) (221,200 T)
- FX official (~137,458 T/USD): [Trading Economics](https://tradingeconomics.com/currency/usd-irr)
- Inflation 87.9% p2p (July 2026), IMF 68.9% avg 2026:
  [Trading Economics — Iran CPI](https://tradingeconomics.com/iran/inflation-cpi)
- Segment anchors (Instagram sellers ~700k–1.2M, ~25M households, income deciles):
  iran-market-sizing skill baselines (2023-era — treated as conservative floors under 88%
  inflation)

## Disclaimer

Numbers are scenario planning, not forecasts; FX volatility can halve the USD value of toman
revenue within months; most products land at or below the conservative column. Pricing bands,
install baselines, and cost benchmarks anchored 2026-08-29 by the financials skill; FX and
inflation re-verified 2026-09-04. Nothing here is legal advice.
