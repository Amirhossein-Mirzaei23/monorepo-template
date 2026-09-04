# Iran Startup Pipeline v2 — Ideas, Market Sizing, Validation & Financials

**Generated:** 2026-09-04 (second run — all-new ideas) · **Ideas:** 3 · **Architecture:** Responsive Web (PWA) + WebView mobile app (Capacitor)
**Pipeline:** `iran-startup-ideas` → `iran-market-sizing` → `iran-startup-validator` → `iran-startup-financials`
**Operator goal (default used):** solo developer building for income — difficulty ≤ 6, fast legal revenue.
_Predecessor runs preserved at [iran_startup_ideas.md](iran_startup_ideas.md) (2026-08-29: HamSakhteman, GheymatSanj, BoomSafar) and [iran_startup_ideas_2026-09-04.md](iran_startup_ideas_2026-09-04.md) (run 1: ForooshYar, Toolmayar, TamirJaa). All six of those ideas are excluded from this run._

---

## Global Assumptions

| Assumption                 | Value used                                                                 | Notes / sources                                                                                                                                                                               |
| -------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exchange rate              | **1 USD ≈ 221,000 Tomans** (free market, 2026-09-04, re-verified this run) | [TGJU](https://www.tgju.org/profile/price_dollar_rl) ~221,060 T; دنیای اقتصاد 220,970 T; اقتصادنیوز ~221,000 T; range today 220,260–221,820 T. Official rate ≈ 137,500 T. 1 Toman = 10 Rials. |
| Inflation                  | **87.9% point-to-point** (July 2026; peak 88.6% in June)                   | [Trading Economics — Iran CPI](https://tradingeconomics.com/iran/inflation-cpi); IMF 2026 average projection 68.9%. A 60-day-late invoice loses ~10% of purchasing power.                     |
| Team                       | 1 solo developer                                                           | Stack = this monorepo: Next.js PWA (`apps/web`) + NestJS + PostgreSQL (`apps/api`) + Capacitor WebView                                                                                        |
| Distribution               | Cafe Bazaar + Myket + direct APK (Android); PWA home-screen (iOS)          | iOS revenue modeled as **0**; Telegram/Instagram + word-of-mouth are the growth channels                                                                                                      |
| Payments                   | Zarinpal / PayPing (Shaparak rails), Tomans, manual-renewal subscriptions  | No wallets held (CBI licensing); gateway fee ~1%                                                                                                                                              |
| Pricing policy             | Toman prices reviewed **quarterly**, or sold as annual prepaid             | 88% p2p inflation breaks fixed monthly toman pricing                                                                                                                                          |
| Developer opportunity cost | ~80M T/month (mid-level)                                                   | Used for breakeven math — adjust to your own                                                                                                                                                  |

**Units:** everyday figures in Tomans (T); official/bank figures often in Rials (1 T = 10 IRR). USD equivalents at 221,000 T/USD.

---

# Idea 1: صندوق‌یار (SandughYar)

## Skill 1 — Idea Profile

- **Idea Name:** صندوق‌یار — SandughYar ("Fund Mate")
- **Core Concept:** A bookkeeping and fairness engine for Iran's mass institution of rotating
  savings circles (صندوق خانوادگی / قرض‌الحسنه گردشی / محل): SMS-OTP member onboarding,
  turn (نوبت) scheduling and قرعه draws, payment ledger in **both toman and gold-gram
  equivalents**, delinquency alerts to the organizer, settlement reports, and a member PWA
  showing "whose turn is next and who owes what." The platform **never touches money flows**
  — members still pay organizer-to-fund by card-to-card/sheba; the tool is pure ledger and
  coordination.
- **Target Audience:** organizers (صندوقدار/حسابدار) of family, workplace, and
  neighborhood rotating funds — typically one trusted person managing 10–30 members and
  tens of millions of tomans per cycle. Iran has an estimated 500k–1M active circles
  (assumption; ~5–8M participating adults). National; starts in Tehran/major cities.
- **Why it works in Iran:** no consumer credit access makes rotating funds a mass
  institution across families, offices, and bazaar networks; they are run today on paper
  دفتر صندوق notebooks and WhatsApp groups, and turn/payment disputes are endemic. At 88%
  p2p inflation, a toman ledger is meaningless across a year — gold-gram equivalents keep
  the fund fair without anyone trading anything. Observable signals: stationery "دفتر
  صندوق" sales, Telegram bots/Excel templates for صندوق management circulating in
  workplace groups, frequent dispute threads in family/workplace communities.
- **Tech Stack Brief:** Next.js PWA + Capacitor (Cafe Bazaar/Myket + direct APK) for
  organizers and members; NestJS + PostgreSQL; Kavenegar SMS for OTP, turn notices, and
  delinquency pings; Jalali cycles (funds rotate monthly on شمسی dates); ArvanCloud CDN;
  offline-tolerant ledger view.
- **Monetization model:** freemium — free for circles ≤ 8 members / one active cycle;
  Organizer plan ~79k T/month or 690k T/year (~57.5k T/month effective); Kavenegar SMS
  bundles resold with markup.
- **Main risks:** the temptation (and regulator perception) of drifting into money
  handling — must stay strictly bookkeeping; trust/security sensitivity of family
  financial data; inertia of the paper-ledger + trusted-organizer culture.
- **MVP suggestion (4–6 weeks):** invite-link onboarding + turn list + toman/gold-gram
  ledger + SMS payment reminders, seeded with 3 real funds the founder belongs to or can
  reach; success = 20 active circles and ≥1 organizer paying for SMS volume alone.
- **Estimated difficulty:** 4/10

## Skill 2 — Market Sizing

**Assumptions:** segment = active rotating-fund organizers ~800k (from ~5–8M participating
adults, ~12–18 members per circle — assumption, labeled); paying ARPU **80k T/month**
(inside the 30–100k T consumer-prosumer band); scope national; reach via workplace/family
word-of-mouth — every paying organizer brings 10–30 member installs (built-in B2B2C loop).

| Layer             | Customers                                              | Annual revenue (Toman) | USD equiv. |
| ----------------- | ------------------------------------------------------ | ---------------------- | ---------- |
| TAM               | ~800 k organizers                                      | ~768 B                 | ~$3.5 M    |
| SAM               | ~200 k urban smartphone organizers of 10+ member funds | ~192 B                 | ~$0.9 M    |
| SOM (by month 24) | ~2 k paying organizers                                 | ~1.9 B                 | ~$8.7 k    |

**Reality checks:**

1. **Top-down:** 2,000 paying organizers out of 200k reachable = 1% — comfortable for a
   useful prosumer tool.
2. **Bottom-up:** 2,000 organizers × ~15 members ≈ 30k member installs — modest, achievable
   via workplace virality.
3. **Comparison:** this is a niche of family-finance tooling — no dominant incumbent; the
   ceiling is comparable to small Iranian prosumer SaaS (form-builders, invoice tools), not
   to Filimo-scale consumer plays. Honest.
4. **Payment:** organizers are used to paying out of pocket for the fund's costs
   (stationery, SMS) — Shaparak billing friction discounted in ARPU.

**Sensitivity:** bear ~0.9 B T/yr (900 organizers) · bull ~3.5 B T/yr (3.5k organizers +
SMS resale).
**Verdict on size:** a genuine bootstrapped income niche; VC-scale only if it becomes the
default rails for cooperative finance — which would cross the licensing line.

## Skill 3 — Validation

**Category:** good 　**Success score:** 66 / 100

**Justification:** Single-sided tool, zero license surface while it stays bookkeeping-only,
a built-in viral loop (each fund onboards its whole membership), and a named payer (the
organizer) who already bears fund costs. Held in the 60s because the payer's willingness is
modest and cultural inertia is real.

**Main risks:**

- **Regulatory perception drift:** anything that smells like holding or routing fund money
  (wallet, auto-collect) triggers CBI licensing territory — a single careless feature
  kills the clean legal position.
- Trust breach fatalness: family financial data leaking would end the product via
  word-of-mouth; security spend is non-optional.
- Organizer inertia: the notebook works and is free; the wedge must be delinquency pain +
  inflation-era gold-gram fairness, not "digitization."

**What would improve the idea:** lead with the **gold-gram fairness ledger** (inflation
makes old toman funds unfair — this is the emotional hook) and make members recruit the
organizer ("ask your صندوقدار to add this") rather than selling organizer-first.

**Final recommendation:** **test** (60–70 band) → build if 20 pilot circles show organizers
paying for SMS bundles unprompted.

## Skill 4 — Financial & Timeline Estimate

Difficulty 4/10 → **full range applies**. Archetype: prosumer SaaS (utility-weighted),
solo → **MVP 10–14 weeks** (~2.5–3.5 months, incl. WebView polish). Churn assumption:
**12%/month** (funds are sticky, multi-year affairs — below the 15% manual-renewal norm).

|                                         | Conservative       | Mid                | Optimistic        |
| --------------------------------------- | ------------------ | ------------------ | ----------------- |
| Month-6 installs (organizers + members) | 15,000             | 40,000             | 90,000            |
| Month-6 paying organizers / gross       | 90 → 6.3M T/mo     | 250 → 17.5M T/mo   | 600 → 42M T/mo    |
| Month-6 costs / net                     | ~7M → **−0.7M T**  | ~12M → **+5.5M T** | ~20M → **+22M T** |
| Month-12 paying organizers / gross      | 180 → 12.6M T/mo   | 600 → 42M T/mo     | 1,400 → 98M T/mo  |
| Month-12 costs / net                    | ~10M → **+2.6M T** | ~16M → **+26M T**  | ~26M → **+72M T** |

Math: paying organizers × 70k T blended ARPU (mix of monthly and annual-effective); costs =
VPS/CDN 4–10M + Kavenegar SMS (OTP + per-rotation notices to every member — volume scales
with installs) 3–10M. Month-12 net USD: $12 / **$118** / $326 per month.
**Breakeven:** MVP investment ≈ 10–14 wk × 80M T ≈ 200–280M T → mid trajectory repays
around **month 17–20**; conservative case ~month 28+.
**Monetization mechanisms:** freemium SaaS (hard-capped free tier) + gateway subscriptions
(Zarinpal annual prepaid) + SMS-gateway bundles resold with markup.

---

# Idea 2: قراردادمن (GharardadMan)

## Skill 1 — Idea Profile

- **Idea Name:** قراردادمن — GharardadMan ("My Contract")
- **Core Concept:** A contract-and-get-paid toolkit for Iranian freelancers working with
  domestic clients: Iranian-law contract templates (خدمات طراحی/توسعه/ترجمه/تولید محتوا)
  with fill-in wizards, SMS-OTP electronic signature (recognized under the 1382
  e-commerce law), **installment and milestone tracking**, shareable toman invoices, and —
  the core loop — automated, politely escalating payment reminders (SMS + shareable
  payment-status page) that create social pressure when a client ghosts.
- **Target Audience:** freelancers with repeat domestic clients — developers, designers,
  translators, content producers, video editors (~1–2M total freelancers; ~600k with
  recurring client work). National, urban-weighted, reached via freelancer Telegram
  communities (پونیشا/کارلنسر user bases, Instagram portfolio pages).
- **Why it works in Iran:** non-payment and 60–90-day delays are the freelancer's #1
  complaint — and at 87.9% p2p inflation a two-month-late invoice loses ~10% of its real
  value; there is no Stripe/Invoicing substitute, deals are sealed in DMs with no paper,
  and card-to-card payments need receipts. E-signature is legally provided for but barely
  productized for freelancers. Observable signals: endless non-payment threads in
  freelancer communities; paid contract-template sites already sell PDFs (monetization
  precedent); dater مجید? no — دفاتر مشاوره رسمی are slow and expensive for small jobs.
- **Tech Stack Brief:** Next.js PWA + Capacitor (Cafe Bazaar + direct APK); NestJS +
  PostgreSQL; Kavenegar SMS for OTP signature + reminder ladder; Zarinpal for plan
  purchase and per-contract credits; Jalali deadlines; ArvanCloud; PDF generation
  server-side (hosted fonts, no external CDN dependencies).
- **Monetization model:** pay-per-contract ~89k T (wizard + e-sign + tracking + reminder
  ladder) or Pro ~149k T/month unlimited; contract-template packs as Cafe Bazaar one-off
  consumables.
- **Main risks:** weak legal-enforcement culture — a contract only works as social
  pressure, so the reminder/pressure loop must carry the value (and must stay within
  harassment/legal bounds); free-template sites + the notary habit for big deals; e-sign
  weight in practice (courts) is untested at freelancer scale.
- **MVP suggestion (5–8 weeks):** 5 contract templates + e-sign via OTP + manual "mark
  paid/unpaid" + reminder ladder; pilot in 2 freelancer Telegram communities; success =
  50 contracts signed and ≥1 in 3 late invoices paid after reminders.
- **Estimated difficulty:** 4/10

## Skill 2 — Market Sizing

**Assumptions:** segment = freelancers with repeat domestic clients ~600k (from ~1–2M
total); paying ARPU **95k T/month** blended (per-contract 89k × ~2/mo, discounted, vs Pro
149k); scope national; reach via freelancer communities and Instagram.

| Layer             | Customers                                  | Annual revenue (Toman) | USD equiv. |
| ----------------- | ------------------------------------------ | ---------------------- | ---------- |
| TAM               | ~600 k active freelancers                  | ~648 B                 | ~$2.9 M    |
| SAM               | ~150 k reachable via communities + willing | ~162 B                 | ~$0.7 M    |
| SOM (by month 24) | ~1.2 k paying                              | ~1.3 B                 | ~$5.9 k    |

**Reality checks:**

1. **Top-down:** 1,200 payers from 150k reachable = 0.8% — realistic for a paid utility
   among price-sensitive freelancers.
2. **Bottom-up:** two 50k-member freelancer communities at 1% annual paid ≈ 1,000 payers —
   matches SOM.
3. **Comparison:** paid contract-template sites and legal-document services already
   monetize this audience at similar price points — the wedge (get _paid_, not just
   signed) is adjacent, not precedent-breaking.
4. **Payment:** freelancers transact online daily via Shaparak; per-contract credits sold
   through Cafe Bazaar one-offs avoid subscription friction entirely.

**Sensitivity:** bear ~0.6 B T/yr · bull ~2.4 B T/yr (template packs + Pro mix shifts up).
**Verdict on size:** a solid solo income niche — it will never be huge, but the payer
exists and the pain is stated weekly in the target communities.

## Skill 3 — Validation

**Category:** good 　**Success score:** 63 / 100

**Justification:** Real, weekly, high-emotion pain with a named payer and single-sided
product; monetization partially proven by paid template sites. Score capped by the core
truth that Iranian freelancers under-monetize tools and enforcement culture is weak — the
product must sell _pressure_, not legality.

**Main risks:**

- Free替代: template PDFs circulate freely; the paid value must be the signature +
  tracking + reminder loop, not the template text.
- Reminder ladder liability: aggressive automated "این قرارداد عقب افتاده" messages can
  tip into harassment claims or defamation-adjacent exposure — tone controls matter.
- Freelancer churn: gig income is volatile; expect payment-driven spikes of usage, not
  steady subscriptions (per-contract pricing mitigates).

**What would improve the idea:** price per-contract (not subscription) as the default —
align with how freelancers actually spend; add a client-facing "اعتبار پرداخت" page
(shareable reputation signal) which flips the pressure loop from organizer to client
voluntarily.

**Final recommendation:** **test** (60–70 band) — pilot the reminder ladder manually on 50
real late invoices before building the wizard.

## Skill 4 — Financial & Timeline Estimate

Difficulty 4/10 → **full range applies**. Archetype: B2B-lite SaaS, solo → **MVP 12–19
weeks** (~3–4.5 months, incl. e-sign flows + WebView polish). Churn: 15%/month standard
assumption.

|                                | Conservative      | Mid               | Optimistic          |
| ------------------------------ | ----------------- | ----------------- | ------------------- |
| Month-6 installs (freelancers) | 2,000             | 5,000             | 12,000              |
| Month-6 paying / gross         | 50 → 4.75M T/mo   | 150 → 14.3M T/mo  | 400 → 38M T/mo      |
| Month-6 costs / net            | ~5M → **~0 T**    | ~9M → **+5M T**   | ~15M → **+23M T**   |
| Month-12 paying / gross        | 100 → 9.5M T/mo   | 400 → 38M T/mo    | 900 → 85.5M T/mo    |
| Month-12 costs / net           | ~8M → **+1.5M T** | ~14M → **+24M T** | ~22M → **+63.5M T** |

Math: payers × 95k T blended ARPU; costs = VPS 3–8M + SMS (OTP signatures + reminder
ladder) 2–7M + gateway 1%. Month-12 net USD: $7 / **$108** / $287 per month.
**Breakeven:** MVP investment ≈ 12–19 wk × 80M T ≈ 240–350M T → mid trajectory repays
around **month 18–22**; conservative case ~month 30+.
**Monetization mechanisms:** Cafe Bazaar one-off consumables (per-contract credits,
template packs) + gateway subscriptions for Pro + SMS-bundle markup.

---

# Idea 3: هم‌خرید (HamKharid)

## Skill 1 — Idea Profile

- **Idea Name:** هم‌خرید — HamKharid ("Group Buy")
- **Core Concept:** Neighborhood group-buying for household staples (rice, oil, chicken,
  cleaning goods, Ramadan/Nowruz baskets): the platform opens a timed group buy per
  building/cluster, collects prepaid orders via Zarinpal, aggregates them to a partner
  local grocer (تحریریه) or wholesaler who already sources below retail, and delivers to a
  building-gate pickup point. Customers save 10–25% vs retail; the partner gets bulk,
  predictable demand.
- **Target Audience:** household purchasers (homemakers budgeting under inflation) in
  dense Tehran apartment clusters and شهرک‌ها — the practical wedge is 3 neighborhoods ×
  10–20 buildings; supply side: 5–15 partner grocers/wholesalers per cluster. Tehran-first.
- **Why it works in Iran:** 88% inflation against fixed salaries makes the 10–25%
  wholesale-vs-retail spread on staples (observable daily in عمده‌فروشی market prices vs
  supermarket shelves) a material household saving; the behavior already exists — building
  and neighborhood Telegram/WhatsApp groups spontaneously organize group buys with cash
  envelopes and one volunteer's card — but the manual version collapses past ~15 orders.
  Apartment density makes gate pickup genuinely cheap; prepaid escrow removes the
  volunteer's risk.
- **Tech Stack Brief:** Next.js PWA + Capacitor (Cafe Bazaar + direct APK) for members;
  partner-facing responsive web dashboard for grocers (order sheets, Jalali delivery
  windows); NestJS + PostgreSQL; Zarinpal prepaid orders paying the **supplier directly
  minus commission** (goods e-commerce model — no wallet); Kavenegar SMS order/pickup
  notices; ArvanCloud; offline-tolerant order status.
- **Monetization model:** ~6% commission on GMV (prepaid, collected at settlement);
  later, featured supplier slots and a per-order pickup/delivery fee share.
- **Main risks:** food-retail regulation — eNAMAD required for online sales, and the
  model must be structured as marketplace/e-commerce (not reselling) to avoid اتحادیه
  خواربار licensing questions; two-sided cold start per neighborhood (needs 5+ grocers ×
  500 households to feel alive); thin margins mean ops discipline decides survival.
- **MVP suggestion (6–10 weeks):** concierge version — a Telegram channel + spreadsheet +
  3 partner grocers in 3 clusters, prepaid card-to-card with manual reconciliation;
  success = 400 households ordering monthly and partners renewing.
- **Estimated difficulty:** 6/10

## Skill 2 — Market Sizing

**Assumptions:** Tehran ~5M households; ~15% would join a trusted group buy at least
monthly (750k households) — assumption from observed building-group behavior; basket
**1.5M T/month** per participating household at maturity (staples-weighted, Sept-2026
prices); platform take **6%**; scope Tehran-first.

| Layer                                                    | Customers (households)  | Annual platform revenue (Toman) | USD equiv. |
| -------------------------------------------------------- | ----------------------- | ------------------------------- | ---------- |
| TAM (Tehran)                                             | ~750 k ordering monthly | ~1,080 B                        | ~$4.9 M    |
| TAM (national, extrapolated ×3)                          | ~2.2 M                  | ~3,240 B                        | ~$14.7 M   |
| SAM (reachable via building/neighborhood groups, 20–25%) | ~150–190 k              | ~216 B                          | ~$1.0 M    |
| SOM (by month 24, ~3 k households/mo)                    | ~3 k monthly            | ~3.2 B                          | ~$14.6 k   |

**Reality checks:**

1. **Top-down:** 3,000 monthly-ordering households out of 750k potential = 0.4% of Tehran —
   a few city districts; honest for a solo operation.
2. **Bottom-up:** 20 clusters × 150 active households × 1.5M T × 6% = 270M T/month at
   maturity — this run-rate is the bull case, SOM is set at ~1/10 of that.
3. **Comparison:** online grocery (Okala/Ofed/Digikala) operates at vastly larger GMV —
   this is a price-wedge niche under their radar, not a competitor to their scale.
4. **Payment:** prepaid Shaparak checkout is the norm; cash-on-pickup variant discounted
   out of the model for collection certainty.

**Sensitivity:** bear ~1.8 B T/yr (1.8k households, 5% take) · bull ~6 B T/yr (Karaj
expansion + Ramadan/Nowruz seasonal baskets at 2–3× volume).
**Verdict on size:** the largest revenue engine of this portfolio if it works — and the
most operationally demanding; a city-by-city income machine, not a quick SaaS.

## Skill 3 — Validation

**Category:** lucky 　**Success score:** 51 / 100

**Justification:** The inflation-driven saving is real and quantifiable, and the behavior
already exists in manual form — but success is gated by per-neighborhood cold starts,
grocer partner quality, and food-retail regulatory posture, none of which a solo developer
fully controls. Two-sided + physical ops = luck-weighted.

**Main risks:**

- **Regulatory structure:** selling food online needs eNAMAD; if authorities read the
  platform as an unlicensed food retailer (rather than a marketplace for licensed grocers),
  the model stops; structure and framing must be deliberate from day one.
- Cold start per cluster: each neighborhood needs its own grocer supply + household trust;
  replication is sales work, and one bad batch (quality, weights) burns a whole building's
  trust at once.
- Thin margin fragility: 6% of GMV must cover pickup ops and support; under 88% inflation,
  supplier quotes can expire between order and delivery — re-quoting discipline is core
  ops.

**What would improve the idea:** start as a **pickup-fee service, not a margin player**
(charge households a flat 30–50k T/order fee, pass wholesale prices through untouched) —
cleaner regulatory surface, positive cash flow from order one, margin layer added after
trust; anchor launch to **pre-Nowruz stockpiling**, when the saving argument sells itself.

**Final recommendation:** **test** (Telegram concierge in 3 clusters; commit only on ≥400
monthly households and partner renewals).

## Skill 4 — Financial & Timeline Estimate

Difficulty 6/10 → **midpoint is the base case**. Archetype: two-sided marketplace, solo →
**MVP 17–23 weeks** (~4–5.5 months, incl. eNAMAD paperwork + WebView polish).
Seasonality: pre-Nowruz and Ramadan stockpiling run **2–3×** off-season baseline.

|                                 | Conservative      | Mid (base)         | Optimistic         |
| ------------------------------- | ----------------- | ------------------ | ------------------ |
| Month-6 installs (members)      | 6,000             | 15,000             | 30,000             |
| Month-6 households ordering/mo  | 400               | 1,000              | 1,800              |
| Month-6 GMV / revenue (6%)      | 600M → 36M T/mo   | 1.5B → 90M T/mo    | 2.7B → 162M T/mo   |
| Month-6 costs / net             | ~29M → **+7M T**  | ~35M → **+55M T**  | ~43M → **+119M T** |
| Month-12 households ordering/mo | 1,000             | 2,200              | 4,000              |
| Month-12 GMV / revenue          | 1.5B → 90M T/mo   | 3.3B → 198M T/mo   | 6B → 360M T/mo     |
| Month-12 costs / net            | ~40M → **+50M T** | ~55M → **+143M T** | ~75M → **+285M T** |

Math: households × 1.5M T basket × 6% take; costs = VPS 4M + SMS notices 3M + part-time
support 12M+ (non-optional) + partner/pickup ops 10–40M scaling with clusters. Month-12
net USD: $226 / **$646** / $1,288 per month.
**Breakeven:** MVP investment ≈ 17–23 wk × 80M T ≈ 340–460M T → midpoint base repays
around **month 13–15** (earliest of the portfolio, because revenue starts with the first
concierge cycles); conservative case ~month 20+.
**Monetization mechanisms:** transaction/service fee (pay suppliers directly minus
commission — never hold funds) + featured supplier slots + pickup-fee share.

---

# Portfolio Summary

## Ranking (iran-startup-validator)

| Rank | Idea                   | Category | Score | Recommendation |
| ---- | ---------------------- | -------- | ----- | -------------- |
| 1    | صندوق‌یار SandughYar   | good     | 66    | test → build   |
| 2    | قراردادمن GharardadMan | good     | 63    | test           |
| 3    | هم‌خرید HamKharid      | lucky    | 51    | test           |

## Financial comparison (mid / base cases)

| Idea         | MVP time (solo) | 6-mo net /mo   | 1-yr net /mo    | Breakeven    |
| ------------ | --------------- | -------------- | --------------- | ------------ |
| SandughYar   | 10–14 weeks     | +5.5M T (~$25) | +26M T (~$118)  | ~month 17–20 |
| GharardadMan | 12–19 weeks     | +5M T (~$23)   | +24M T (~$108)  | ~month 18–22 |
| HamKharid    | 17–23 weeks     | +55M T (~$249) | +143M T (~$646) | ~month 13–15 |

## Recommendation

**Spend the next 90 days on SandughYar.** It has the portfolio's best score-to-effort
ratio: the shortest MVP (10–14 weeks), a built-in viral loop (every fund onboards 10–30
members), a named payer who already spends on the fund's costs, and zero license surface as
long as it stays a ledger. GharardadMan is a close second with a similar profile — its
per-contract pricing is the cleaner monetization, but the value hinges on a reminder loop
that must be tested on real late invoices first. HamKharid posts the biggest numbers
(inflation makes the wholesale-retail wedge wider every month) but carries two-sided cold
starts, physical ops, and food-retail regulatory structure — a strong _second_ venture to
start once a first product ships, ideally timed to a pre-Nowruz launch. All three remain
toman-denominated solo-income plays; none clears the Iranian VC bar at these SOMs.

---

## Sources & Freshness

- FX free-market (~221,000 T/USD, 2026-09-04, re-verified this run):
  [TGJU](https://www.tgju.org/profile/price_dollar_rl) (~221,060 T), دنیای اقتصاد (220,970 T),
  اقتصادنیوز (~221,000 T); cross-checked against this morning's run
  ([Pashizi](https://www.pashizi.com/en/currency/usd) / AlanChand 221,400 T,
  [Navasan](https://navasan.net) 221,200 T)
- FX official (~137,458 T/USD): [Trading Economics — USD/IRR](https://tradingeconomics.com/currency/usd-irr)
- Inflation 87.9% p2p (July 2026), IMF 68.9% avg 2026:
  [Trading Economics — Iran CPI](https://tradingeconomics.com/iran/inflation-cpi)
- Segment anchors (freelancers ~1–2M, households ~25M, consumer/prosumer pricing bands):
  iran-market-sizing + iran-startup-financials skill baselines (financials bands anchored
  2026-08-29; sizing demographics 2023-era — treated as conservative floors under 88%
  inflation). Rotating-fund prevalence (500k–1M circles) is a labeled assumption, not a
  sourced figure — validate with 20 pilot-fund recruitment before relying on it.

## Disclaimer

Numbers are scenario planning, not forecasts; FX volatility can halve the USD value of
toman revenue within months; most products land at or below the conservative column.
Pricing bands, install baselines, and cost benchmarks anchored 2026-08-29 by the
financials skill; FX and inflation re-verified 2026-09-04 (second run same day). Nothing
here is legal advice — food-retail structuring (HamKharid) and e-signature reliance
(GharardadMan) should be confirmed with a local lawyer before launch.
