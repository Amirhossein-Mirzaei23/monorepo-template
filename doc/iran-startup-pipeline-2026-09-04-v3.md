# Iran Startup Discovery Pipeline — Run v3

### Full research report: idea generation → market sizing → validation → financials → investment assessment

**Date:** 2026-09-04 · **Run:** v3 (third full pipeline run in this repo)
**Pipeline skills:** `iran-startup-ideas` → `iran-market-sizing` → `iran-startup-validator` → `iran-startup-financials`
**Operator goal:** solo/small technical team, income-first, scalable-beachhead bias, difficulty ≤ 6–7
**Excluded by design:** all 9 ideas from runs v0–v2 (HamSakhteman building-SaaS, GheymatSanj price-engine, BoomSafar eco-lodges, ForooshYar IG-seller SaaS, Toolmayar inflation tracker, TamirJaa repair marketplace, SandughYar savings circles, GharardadMan freelancer contracts, HamKharid group-buying).

**Companion reports:** [iran_startup_ideas.md](iran_startup_ideas.md) (v0, 2026-08-29) · [iran_startup_ideas_2026-09-04.md](iran_startup_ideas_2026-09-04.md) (v1) · [iran_startup_ideas_2026-09-04_v2.md](iran_startup_ideas_2026-09-04_v2.md) (v2)

---

## 0. Executive summary (read this first)

This run market-checked **21 candidate ideas via live Persian web search** before analysis.
**17 were killed on discovery** — in every "obvious" vertical (kindergarten SaaS, gym SaaS,
Persian STT, pet services, wedding venues, moving, Moadian tax tools, elevator SaaS,
building materials, warehouse sharing, restaurant direct-order, contract manufacturing,
care-agency software, corporate-gift shops, medical-equipment rental-as-standalone…) at
least one — usually several — working Iranian incumbents already exist, several with free
tiers (کیسان free unlimited Moadian invoicing; ivira free STT) or ecosystem gravity
(Snapp Box moving, Snappfood petshop, Snapp Doctor nursing, official «پرستار من» app).

**The headline finding: the Iranian digital market is far more saturated than the
"sanctions = white space" intuition suggests.** What survives is either (a) structurally
messy B2B niches no one has organized (dead-stock liquidation), or (b) demographically
inevitable demand growing faster than incumbent quality (elder care).

**TOP 5 (ranked):**

1. **راکدشو Rakdsho** — B2B dead-stock (مستردرماندگی) liquidation marketplace — score 70, `good`
2. **مراقب‌یار MoraghebYar** — elder-care coordination with fixed transparent pricing — score 63, `good`
3. **آژانس‌ساز AjansSaz** — cloud SaaS for nursing/care agencies — score 57, `good` (capped)
4. **تجهیزات‌یار TajhizatYar** — medical/eldercare equipment rental aggregation — score 50, `lucky`
5. **ستاد هدیه SetadHedie** — corporate-gifting procurement platform — score 43, `lucky` (weak)

**If I could build only one: راکدشو.** Full reasoning, 30-day plan, and kill criteria in
§8.

---

## 1. Global assumptions & verified data

All Tomans (T). 1 T = 10 IRR. USD at free-market rate.

| Data point                             | Value                                                           | Status                           | Source (accessed 2026-09-04)                                                                                        |
| -------------------------------------- | --------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| USD free-market                        | **221,000–221,400 T**                                           | verified (2 checks, 4+ sources)  | [TGJU](https://www.tgju.org/profile/price_dollar_rl), دنیای اقتصاد, اقتصادنیوز, Pashizi/Navasan/AlanChand (morning) |
| USD official                           | ~137,500 T                                                      | verified                         | Trading Economics                                                                                                   |
| Inflation (p2p, Jul 2026)              | **87.9%** (peak 88.6% Jun)                                      | verified                         | [Trading Economics](https://tradingeconomics.com/iran/inflation-cpi); IMF avg-2026 68.9%                            |
| Population                             | ~86.5M                                                          | official estimate (SCI 1404)     | مرکز آمار via عصر ایران                                                                                             |
| Elderly 65+                            | **~8%** (~7M); conflicting claims to ~12%                       | official vs press — both labeled | SCI via [فارس](https://farsnews.ir); آرمان امروز                                                                    |
| Elderly 60+                            | ~12–14% (~10–12M); → 31–32% by 1430                             | official/projection              | بهزیستی/ایسنا                                                                                                       |
| Live-in elderly caregiver              | **19–20M T/month** (Tehran, 1405)                               | hard data (5 agencies)           | [دمانو](https://www.darmanno.com/blog/prices-of-elderly-nurse-at-home/), مهرپرور, کیان‌مهر, عاطفه, پرستاری۲۱        |
| Part-time caregiver                    | 8–9M T/month                                                    | hard data                        | same                                                                                                                |
| Nursing home                           | 13–32.5M T/month                                                | hard data                        | same                                                                                                                |
| O₂ concentrator rental                 | 300–400k T/day                                                  | hard data                        | [اسنپ‌ویزیت](https://snappvisit.com/)                                                                               |
| Small warehouse rent (Tehran)          | ~350–700k T/m²/mo; 50–70m² depot 22–40M T/mo + 100–250M deposit | hard data                        | [سوله‌نت](https://sooleh.net), [Divar](https://divar.ir/s/tehran/rent-industrial-agricultural-property)             |
| Small apparel workshop startup capital | ≥ 50M T                                                         | hard data                        | باسکول via search                                                                                                   |

**Soft assumptions used throughout (estimates, not data):** solo-developer opportunity
cost 80M T/month; MVP infra/SMS 5–15M T/month at launch scale; manual-renewal churn
12–18%/month; B2B SaaS ARPU bands 30–200k T/entity/month (consumer-grade) up to ~1M T
(business-grade); marketplace commission norm 8–12%; Iranian eCPM 2,000–20,000 T;
free→paid 0.5–3%; Cafe Bazaar Android-only monetization (iOS = 0).

**MVP cost baseline (all ideas):** 3–5 solo-months × 80M T + 20–40M T setup ≈
**260–440M T (~$1.2–2.0k)**. Difficulty ≥5 ideas use the midpoint scenario as base case
(financials-skill rule 4).

---

## 2. Discovery log — 21 candidates, 17 killed by market check

Each row names the incumbents found via live search (2026-09-04). This log is the
evidence base for every "competition" verdict downstream.

| #   | Candidate                             | Verdict                                                                              | Killing incumbents / evidence                                                                                                                           |
| --- | ------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Kindergarten SaaS                     | ❌ saturated                                                                         | [مهدیار](https://www.mahdyar.net/), دنیای مهد, مهد۲۴, همکلاسی, RKWEB + "[10-software](https://ashnashoo.ir)" comparison article                         |
| 2   | Gym/fitness SaaS                      | ❌ saturated                                                                         | پارسیان ("most-used"), زمان‌پرداز (40M T license), مای‌جیم (free), بادی‌سافت, چرتکه                                                                     |
| 3   | Persian STT                           | ❌ saturated + free rivals                                                           | [IoType](https://iotype.com/), [ivira](https://ivira.ai/speech-to-text/) (free unlimited), فارس‌آوا, Notta/ElevenLabs/HappyScribe (all support Persian) |
| 4   | Pet services/food                     | ❌ saturated                                                                         | پت‌آباد (+clinic, Cafe Bazaar), پتیا (marketplace), وتوریا, وت‌پرو, پت‌پرس, Snappfood petshop category                                                  |
| 5   | Wedding-venue booking                 | ❌ saturated                                                                         | ست‌جا (online booking), بانک تالار (proforma), تالارکده, بیات‌عروسی (since 1389), عروسی‌آنلاین                                                          |
| 6   | Moving/freight consumer               | ❌ saturated                                                                         | [Snapp Box](https://box.snapp.ir/moving-services/) (fixed transparent pricing!), نوبار, آچاره, اثاث‌کشی app                                             |
| 7   | Moadian tax-lite for IG sellers       | ❌ saturated + free                                                                  | کیسان (free unlimited e-invoices), مالیتور, فرداد, ابرآیرون + app «کسب» (invoice+inventory+price-list for IG sellers)                                   |
| 8   | Elevator-maintenance SaaS             | ❌ saturated                                                                         | [TLift](https://tlift.ir/), Lift+, هیرو آسانسور, اپ‌سور, سازه‌حساب, محک                                                                                 |
| 9   | Building-materials B2B                | ❌ saturated                                                                         | هایپرساز, دیجی‌مصالح, تأمین۲۴, سیوان‌لند + ایمالز/فرصت‌امروز price sites                                                                                |
| 10  | Shared micro-warehousing              | ❌ exists                                                                            | [روناد](https://www.instagram.com/ronad) (shared warehouse, daily billing, from 1m², targets online sellers)                                            |
| 11  | Restaurant direct-order menus         | ❌ saturated                                                                         | منوباز, منووُ, ایرانیو, آسازون, سپیدز                                                                                                                   |
| 12  | Small-batch manufacturing platform    | ❌ exists                                                                            | [روچی اسمارت](https://rochismart.com/) (production-order panel + live tracking), جامه‌بافت (private label)                                              |
| 13  | Corporate-gift e-shop                 | ❌ crowded shops (but no buyer-side procurement platform → survives only as weak #5) | جویاشاپ, ادگیفت, مکس‌چاپ, صدراگیفت, شهرگیفت…                                                                                                            |
| 14  | Care-agency SaaS                      | ⚠️ incumbent exists                                                                  | درمان‌دکتر (18-yr specialized nursing-agency software), official «پرستار من» app → survives as #3 with cap                                              |
| 15  | Elder-care consumer coordination      | ⚠️ contested                                                                         | هیراد, آسان‌درمان, اسنپ‌دکتر, آسانیسم — fragmented, tariff chaos documented → survives as #2                                                            |
| 16  | Medical-equipment rental (standalone) | ⚠️ fragmented + Snapp-visit gravity                                                  | پارسا, مهدشفا, درمان‌منزل, پارسان‌مد + اسنپ‌ویزیت partial → survives as #4                                                                              |
| 17  | B2B wholesale marketplace             | ❌ incumbent (adjacent to #1)                                                        | باسکول (major B2B wholesale), عمدباکس, عمده‌تامین                                                                                                       |
| 18  | Home-cleaning marketplace             | ❓ unverified (search rate-limited) — excluded for lack of verification              | (memory-only leads: ایوان‌سرویس, نظافتچی — NOT verified, so not analyzed)                                                                               |
| 19  | C2C escrow payments                   | ❌ regulatory wall                                                                   | holding funds = CBI PSP licensing; Divar's own secure-payment ambitions                                                                                 |
| 20  | Crypto/FX tools                       | ❌ regulatory wall                                                                   | CBI ban zone                                                                                                                                            |
| 21  | **B2B liquidation (مستردرماندگی)**    | ✅ **gap confirmed**                                                                 | only IG quote-tricks + Telegram lives; general B2B (باسکول) has no liquidation channel → **idea #1**                                                    |

---

## 3. IDEA 1 — راکدشو (Rakdsho): B2B dead-stock liquidation marketplace

### 3.1 Idea profile

- **Idea Name:** راکدشو — Rakdsho ("Dead-Stock Finder")
- **Core Concept:** A structured B2B marketplace where manufacturers, importers, and
  wholesalers list **dead stock (مستردرماندگی / راکد)** — cancelled export orders,
  over-runs, last-season goods, near-expiry items — as verified lots (photos, count,
  condition report), and discount retailers, Divar/Instagram resellers, and provincial
  wholesalers bid or buy at fixed price. Broker/concierge-fulfilled at the start (platform
  matches + invoices; logistics via contracted باربری), moving to self-serve.
- **Target Audience:** supply = Iranian producers/importers holding unsellable-at-retail
  inventory (apparel first — the largest observed IG wholesale vertical — then home goods,
  cosmetics, packaged food near-expiry); demand = متری‌فروشی‌ها, discount retailers,
  IG/Divar resellers hunting margin. Tehran launch, national within a year.
- **Why it works in Iran:** 88% p2p inflation makes holding stock ruinous (working
  capital evaporates monthly) yet today's only liquidation channels are chaotic Instagram
  lives and Telegram channels with no inspection, no escrow, no standard lots — buyers
  must physically verify or trust blindly. Search evidence: guides teach buyers to find
  مستردرماندگی via Instagram quote-tricks («"خرید عمده مستردرماندگی"» wrapped in
  quotes); general B2B wholesale (باسکول/عمدباکس) carries no liquidation/auction
  category. International analogue: B-Stock (US, rebuilt retail liquidation as verified
  B2B auctions).
- **Tech Stack Brief:** Next.js PWA + Capacitor (Cafe Bazaar/direct APK) for buyer-side
  browsing/alerts; supplier lot-intake web app (Excel/photo bulk upload); NestJS +
  PostgreSQL; Zarinpal for lot deposits/direct-to-seller payment minus commission (no
  wallet); Kavenegar SMS bid/outbid notices; Jalali auction windows; ArvanCloud CDN.
- **Existing similar products (web-checked 2026-09-04):** باسکول & عمدباکس (general B2B
  wholesale — no liquidation category/auction/verification), Telegram/IG liquidation
  channels (unstructured, no escrow), Divar (C2C retail, not lot-level B2B). **No direct
  structured-equivalent found — the wedge is real but باسکول could add a category.**
- **Monetization:** 7–10% commission on settled lots (blended 7% modeled); featured lot
  placement; inspection/verification fee for high-value lots.
- **Main risks:** two-sided cold start (supply is desperate → easier side; demand needs
  50+ live lots to feel alive); باسکول adding a liquidation vertical; B2B trust for
  prepaid large tickets (mitigate: inspection + delivery-on-approval via باربری C.O.D.).
- **MVP suggestion (6–10 weeks):** Telegram channel + spreadsheet + phone-broker: hand-list
  20 real lots from 10 Tehran apparel تولیدی‌ها, personally match buyers, take 5% cash
  commission. Success: 10 settled lots + 2 repeat suppliers.
- **Estimated difficulty:** 6/10

**Key assumptions (kill these, kill the idea):** (A1) producers will pay 7–10% to
liquidate fast rather than drip-sell on IG; (A2) ≥300 suppliers nationally have recurring
dead stock (not one-off); (A3) demand-side resellers will prepay/deposit for unseen-but-
verified lots; (A4) باسکول stays general for ≥18 months.

### 3.2 Market sizing

Method: bottom-up GMV-flow estimate (assumption-chain, all labeled) × commission. No
official liquidation-market data exists — treat all layers as **estimates**.

| Layer       | Basis                                                                                               | GMV flow (T/yr) | Platform revenue @7% (T/yr) | USD      |
| ----------- | --------------------------------------------------------------------------------------------------- | --------------- | --------------------------- | -------- |
| TAM         | ~100k production/import units (est.) × 15% with recurring dead stock × 1.5 lots/yr × 500M T avg lot | ~11,000 B       | ~770 B                      | ~$3.5M   |
| SAM         | Apparel+home+food verticals reachable via IG/Telegram supplier communities, Tehran-logistics (~25%) | ~2,750 B        | ~190 B                      | ~$0.9M   |
| SOM (24 mo) | 50→150 settled lots/mo, avg 350M T                                                                  | ~40–60 B        | **~3–4 B**                  | ~$14–18k |

Reality checks: (1) A single 350M T lot settled daily ≈ 127B T/yr GMV — SOM is well under
1% of that flow: conservative. (2) باسکول-scale comparison: SOM ≪ general B2B wholesale —
a wedge, not a rival. (3) Payment check: B2B high-ticket → inspection + C.O.D. via
باربری + direct-to-seller settlement; commission invoiced. Sensitivity: bear (5% take,
60 lots/mo at yr2) ~2.5B T/yr; bull (9% take, 200 lots/mo) ~7.6B T/yr.

### 3.3 Validation

**Category:** good 　**Score: 70/100**

Justification: the only candidate of 21 with a search-verified structural gap on both
sides (desperate supply, hungry demand) and a proven international analogue (B-Stock).
Marketplace cold-start keeps it out of the 80s; supply is the easy side (dead stock is a
pure cost to its owner), which is why this marketplace is `good` rather than `lucky`.

Main risks: (R1) باسکول/عمدباکس launching a liquidation vertical with existing traffic;
(R2) B2B payment trust — a burnt buyer on one 300M T lot kills word-of-mouth in a tight
community; (R3) lot quality fraud (mixed-grade pallets) → inspection ops cost.

**MVP validation experiments & kill criteria:**

- Experiment 1 (weeks 1–4): broker 10 lots manually via Telegram; **kill if <3 settle or
  buyers refuse deposits/inspection terms entirely.**
- Experiment 2 (weeks 4–8): offer 5 suppliers a 10%-commission "instant liquidation"
  (platform buys nothing, just guarantees buyer in 7 days); **kill if suppliers balk at
  10% — that means their IG drip-selling is good enough.**
- Validation evidence: ≥2 suppliers returning with second lots + ≥1 buyer prepaying for a
  verified-unseen lot. Kill evidence: median time-to-settle > 30 days (market too thin).

### 3.4 Financials

Difficulty 6 → midpoint = base. MVP 17–23 weeks solo (incl. broker tooling polish).
CAC (estimates): suppliers ≈ 0–5M T (they're motivated; founder outreach); first-time
buyers ≈ 50–150k T (IG/Telegram content). Pricing: commission 7% blended; featured
2–5M T/lot.

| Scenario (net, T/month) | Year 1 end         | Year 3            | Year 5           |
| ----------------------- | ------------------ | ----------------- | ---------------- |
| Conservative            | +250M (~$1.1k)     | +1.2B (~$5.4k)    | +3.5B (~$15.8k)  |
| **Base**                | **+700M (~$3.2k)** | **+4.5B (~$20k)** | **+12B (~$54k)** |
| Optimistic              | +1.3B (~$5.9k)     | +8B (~$36k)       | +22B (~$100k)    |

Base math: Y1-end 50 lots/mo × 350M T × 7% = 1.23B gross − 0.53B costs (VPS/SMS 10M,
support 25M, inspection/logistics ops 150M, marketing 250M, misc 95M) ≈ +700M net.
Y3: 180 lots/mo → 4.4B gross − 0.9B ops+team(2) ≈ +4.5B. Y5: 450 lots/mo national +
featured → ~13B gross − 4B (team of 5, inspection network) ≈ +12B.
Breakeven: cumulative net passes MVP 260–440M T around **month 10–14** (earliest of the
five — high per-transaction revenue).
**Sensitivities:** commission rate 5%→9% swings Y3 net ±60%; avg lot value ±30% swings
±30%; the model dies if settled lots/month plateaus < 15.

---

## 4. IDEA 2 — مراقب‌یار (MoraghebYar): elder-care coordination platform

### 4.1 Idea profile

- **Idea Name:** مراقب‌یار — MoraghebYar ("Care Mate")
- **Core Concept:** A coordination layer for family elder care: fixed **published**
  tariffs (the agencies' own 1405 price lists are public — 19–20M T/mo live-in,
  8–9M T/mo part-time), background-verified caregivers (سوابق + نظام پرستاری ID for
  medical-grade), Jalali shift scheduling, a family dashboard (meds, visits, notes), and
  structured replacement guarantees (a verified backup within 48h). Non-medical
  companionship care first — deliberately outside procedures requiring nursing licenses.
- **Target Audience:** adult children (35–55, urban, decile 7–9) arranging care for a
  parent, in Tehran/Karaj then top-7 cities. Supply: independent caregivers + small
  agencies needing demand.
- **Why it works in Iran:** ~7M people 65+ (8%, trending to 31–32% of population by
  1430); care tariffs are opaque and vary 2× between agencies (verified: five agencies,
  five different published prices); current discovery is Google-page-1 agencies with
  zero reviews or هیراد-style dispatch apps focused on nursing procedures; both-adult
  households work → no family caregiver available. Culture: care decisions are made by
  the children, remotely — a dashboard is the product, not an app for elders.
- **Tech Stack Brief:** family PWA + Capacitor app; caregiver responsive web (check-in,
  notes, photo log); NestJS + PostgreSQL; Kavenegar OTP + shift notices; Zarinpal for
  booking fee/subscription (never payroll — caregiver paid directly by family); Jalali;
  ArvanCloud.
- **Existing similar products (web-checked 2026-09-04):** هیراد (Cafe Bazaar 4.1,
  general home nursing/kids/elder), آسان‌درمان, اسنپ‌دکتر (home nursing procedures),
  آسانیسم (agency connector), official نظام پرستاری «پرستار من» (center lookup), dozens
  of agency sites with phone intake. **Wedge: elder-specific coordination + published
  fixed tariffs + replacement guarantee + family dashboard — none of the incumbents
  publish fixed prices or offer structured guarantees.**
- **Monetization:** family subscription ~149k T/mo (waived first month) + 15% of first
  month's caregiver fee; agency/caregiver visibility subscription later.
- **Main risks:** incumbent gravity (Snapp-ecosystem nursing plays); trust liability if a
  caregiver harms or steals (must carry vetting + insurance partnership); drifting into
  medical nursing acts → وزارت بهدست licensing.
- **MVP suggestion (6–8 weeks):** concierge — manually vet 20 caregivers, place with 15
  families from 3 Telegram groups for working daughters (گروه مراقبت از پدر و مادر);
  success = 8 placements + 3 paying the subscription unprompted.
- **Estimated difficulty:** 6/10

**Key assumptions:** (B1) families will pay ~150k T/mo for coordination on top of 8–20M T
care costs (≈1–2% — plausible); (B2) verifiable caregiver supply ≥ 150 in Tehran at
launch; (B3) vetting prevents the one catastrophic incident that kills trust; (B4)
non-medical positioning stays clearly outside nursing-procedure licensing.

### 4.2 Market sizing

Hard data: tariffs (above), elderly counts. Estimates: % needing paid care, formality rates.

| Layer       | Basis                                                                      | Care GMV (T/yr) | Platform revenue                  | USD    |
| ----------- | -------------------------------------------------------------------------- | --------------- | --------------------------------- | ------ |
| TAM         | ~7M 65+ × 8–10% needing regular paid care × 9M T/mo avg                    | ~63,000 B       | ~12% first-month + subs ≈ 1,900 B | ~$8.6M |
| SAM         | top-7 cities, app-willing families, non-medical segment (~10% of TAM flow) | ~6,300 B        | ~200 B                            | ~$0.9M |
| SOM (24 mo) | 800–1,200 active paying families                                           | ~150–220        | **~4 B**                          | ~$18k  |

Reality checks: (1) agencies collectively already move tens of billions T/month in
Tehran alone (tariffs × volume) — platform slice of 0.5% is modest. (2) Bottom-up: 1,000
families × 150k sub + 1.2 placements/family-yr × 2M first-month fee ≈ 4.2B T/yr ✓.
(3) Payment: families already pay agencies by card — collection friction low.
Sensitivity: bear 1.8B T/yr (500 families); bull 7B (2,000 families + agency tier).

### 4.3 Validation

**Category:** good 　**Score: 63/100**

Justification: demographically inevitable demand, verified tariff chaos (real pain),
named payers on both sides. Held below Rakdsho: contested field (5+ incumbents incl.
Snapp-adjacent), catastrophic-trust sensitivity, and services-ops depth beyond code.

Risks: (R1) a safety incident → existential reputational + legal exposure; (R2) هیراد or
اسنپ‌دکتر adding fixed-price elder packages with existing brand; (R3) caregiver churn to
direct relationships (families cut the platform after placement — the classic agency
disintermediation leak).

Experiments & kill criteria: (1) 15 manual placements; **kill if >70% of families cancel
subscription within 2 months of placement** (disintermediation leak fatal). (2) Offer
published fixed tariffs vs. agency quotes to 50 families; kill if <30% prefer fixed.
Validation evidence: ≥50% 3-month subscription retention. Kill evidence: caregivers
refusing background checks en masse (supply can't be verified).

### 4.4 Financials

Difficulty 6 → midpoint base. MVP 14–20 weeks solo +2 (vetting tooling). CAC (est.):
250–500k T/family (content in caregiver/family Telegram communities + referral 1M T);
~0 for caregivers initially.

| Scenario (net, T/month) | Year 1 end       | Year 3           | Year 5             |
| ----------------------- | ---------------- | ---------------- | ------------------ |
| Conservative            | +15M (~$70)      | +180M (~$800)    | +450M (~$2k)       |
| **Base**                | **+35M (~$160)** | **+450M (~$2k)** | **+1.4B (~$6.3k)** |
| Optimistic              | +90M (~$400)     | +1.1B (~$5k)     | +3.2B (~$14k)      |

Base math: Y1-end 350 families × 150k sub + ~25 placements/mo × 2M fee = 102.5M gross −
67M costs (vetting 20M, support 20M, CAC 15M, infra/SMS 12M) ≈ +35M. Y3: 2,200 families
→ 750M − 300M (team 2, ops) ≈ +450M. Y5: 6,500 families + agency tier → 1.9B − 0.5B ≈
+1.4B. Breakeven: **month 16–20**. Sensitivities: subscription churn 8%→20%/mo swings
Y3 ±45%; disintermediation (fee bypass) beyond 60% kills the placement-fee line.

---

## 5. IDEA 3 — آژانس‌ساز (AjansSaz): cloud SaaS for care agencies

### 5.1 Profile (condensed — analysis pattern identical to §3/§4)

- **Concept:** mobile-first dispatch/scheduling/billing SaaS for the hundreds of nursing
  & home-care agencies found in discovery (caregiver shift app with GPS check-in, client
  billing with Jalali cycles + inflation-indexed contract renewals, caregiver payroll
  sheets, family portal white-labeled per agency). Sell shovels in the elder-care gold
  rush instead of competing with agencies.
- **Existing similar products (web-checked):** درمان‌دکتر (18-year specialized
  nursing-agency software — desktop-era), تراپیا (clinic), official «پرستار من» (lookup
  only). Wedge: mobile caregiver app + family portal + modern pricing (subscription vs
  license).
- **Why now:** agencies priced at 2026 tariffs run on WhatsApp dispatch; the 18-yr
  incumbent's era shows agencies DO pay for software (validator's SME-SaaS trap: payment
  proven → score allowed above 50).
- **Monetization:** 600–900k T/mo per agency (2–10 caregiver seats), SMS bundles.
- **Key assumptions:** (C1) ≥1,500 agencies nationally (estimate — dozens of sites seen;
  no census); (C2) agencies pay business-grade ARPU; (C3) درمان‌دکتر is slow to mobile.

### 5.2 Sizing (all estimates except incumbent-existence)

TAM ~~3,500 agencies × 800k × 12 ≈ **34B T/yr (~~$150k)** · SAM ~1,500 modern-willing ≈
14B T/yr · SOM 24mo: 250 agencies ≈ **2.4B T/yr (~$11k)**. Reality check: TAM is the
smallest of the five — an honest lifestyle-scale ceiling, stated plainly.

### 5.3 Validation

**Category:** good (capped) 　**Score: 57/100** — payers proven (18-yr incumbent), tiny
TAM, migration friction from an entrenched tool. Verdict: **test**. Kill criteria: <5 of
15 demoed agencies agree to a 3-month pilot at 600k T/mo; or درمان‌دکتر ships a mobile
caregiver app within 6 months. Experiments: 15 agency interviews + data-migration offer.

### 5.4 Financials

Difficulty 5 → midpoint base. MVP 12–18 weeks. CAC 1.5–3M T/agency (in-person sales);
payback ~~4 months. Base: Y1-end 90 agencies × 800k = 72M gross − 40M ≈ **+32M T/mo**;
Y3 400 → **+220M T/mo (~~$1k)**; Y5 900 → +450M T/mo (~$2k). Breakeven **month 14–18**.
Sensitivity: ARPU ±200k swings Y3 ±35%; churn >3%/mo (B2B norm) extends breakeven past
24 months.

---

## 6. IDEA 4 — تجهیزات‌یار (TajhizatYar): equipment rental aggregation

### 6.1 Profile (condensed)

- **Concept:** price-transparent booking layer over the fragmented medical/eldercare
  equipment-rental market (hospital beds, O₂ concentrators, wheelchairs, lift hoists):
  published daily rates (verified anchor: concentrators 300–400k T/day via اسنپ‌ویزیت),
  hygiene/cleaning standards badge, delivery+setup, deposit escrow via gateway,
  maintenance-included tiers. Demand: post-surgery & elder families.
- **Existing similar products (web-checked):** پارسا/مهدشفا/درمان‌منزل/پارسان‌مد (agency
  sites, phone quotes), استگاه/شیپور classifieds, اسنپ‌ویزیت (partial, few items, one
  city district example). Wedge: multi-vendor price comparison + standardized condition
  — but اسنپ‌ویزیت's existence caps the ceiling.
- **Monetization:** 10–15% commission on rental value + delivery fees.
- **Key assumptions:** (D1) ≥300 rental providers reachable nationally (est.); (D2)
  families comparison-shop rather than call agency #1 (est.); (D3) اسنپ‌ویزیت doesn't
  scale the category.

### 6.2 Sizing (estimates on hard price anchors)

TAM: ~300k rental episodes/yr × ~3 mo × ~~4M T/mo ≈ 3,600B GMV → @12% ≈ **430B T/yr
(~~$1.9M)** · SAM Tehran+5 cities 40% ≈ 170B · SOM 24mo: ~1,000 active rentals ≈
**4.8B T/yr (~$22k)**.

### 6.3 Validation

**Category:** lucky 　**Score: 50/100** — real fragmentation + real prices, but
Snapp-ecosystem gravity and asset-condition disputes. Verdict: **test** (as a Telegram
price-comparison bot first — zero build). Kill criteria: providers refuse standardized
published rates (>70%); or <100 bot users/week from family-care Telegram groups.
Evidence that validates: 3 providers accepting platform bookings at published rates.

### 6.4 Financials

Difficulty 5 → midpoint. MVP 14–20 weeks. CAC 150–300k T (family-care community
content). Base: Y1-end 350 active rentals × 350k T/mo margin = 122M − 75M ≈ **+47M T/mo
(~~$210)**; Y3 1,500 → +300M (~$1.4k); Y5 4,000 → +700M (~~$3.2k). Breakeven **month
15–18**. Sensitivity: utilization (idle inventory) — provider-side margin compression
if <60% of listed items ever rent.

---

## 7. IDEA 5 — ستاد هدیه (SetadHedie): corporate-gifting procurement

### 7.1 Profile (condensed — included for completeness, weakest of the five)

- **Concept:** a buyer-side procurement platform for corporate gifting (Nowruz/Yalda/
  onboarding kits): budget-band configurator, 3 competitive quotes from vetted suppliers
  (the 10+ gift shops found), **official tax invoices (فاکتور رسمی/Moadian-compliant)**
  — the thing Instagram shops can't provide — branding QC, and per-employee address
  distribution.
- **Existing similar products (web-checked):** 10+ specialized gift shops (جویاشاپ,
  ادگیفت, مکس‌چاپ, صدراگیفت, شهرگیفت, پارت‌چاپ…) — all seller-side shops; no
  buyer-side procurement platform found. Wedge is procurement workflow + invoicing, not
  products.
- **Monetization:** 6–10% on executed orders.
- **Key assumptions:** (E1) HR/procurement pain is acute enough to switch from
  phone/Instagram sourcing (unproven); (E2) ~200k formal companies with gifting budgets
  (est.); (E3) suppliers accept platform invoicing terms.

### 7.2 Sizing (all estimates — flagged as weakest data in this report)

TAM ~~4,500B GMV-addressable → @8% ≈ **360B T/yr (~~$1.6M)** · SAM 90B · SOM 24mo ~5.8B
T/yr (~$26k) at 150 corporate orders/mo. Reality check: seasonal Nowruz/Yalda spikes
3–4× make monthly figures lumpy.

### 7.3 Validation

**Category:** lucky (weak) 　**Score: 43/100** — shops exist, buyer pain unproven,
B2B sales cycle for a solo founder. Verdict: **reject (or pivot to a pure
"official-invoice gifting" niche agency)**. Kill criteria (if tested): <10 of 50
cold-contacted HR buyers respond; quotes requested but conversion <20%.

### 7.4 Financials

Difficulty 5 → midpoint. MVP 12–18 weeks. CAC 2–5M T/account (direct sales). Base:
Y1-end 40 orders/mo × 3.2M margin ≈ 128M − 90M ≈ **+38M T/mo (~~$170)**; Y3 150 → +325M
(~$1.5k); Y5 400 → +900M (~~$4k). Breakeven **month 16–20**. Sensitivity: extreme
seasonality (two peaks carry ~60% of annual revenue — cash-flow planning required).

---

## 8. Final investment assessment

### 8.1 Assessment matrix

| Dimension              | راکدشo Rakdsho                                                       | مراقب‌یار MoraghebYar                                 | آژانس‌ساز AjansSaz                      | تجهیزات‌یار TajhizatYar                            | ستاد هدیه SetadHedie              |
| ---------------------- | -------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------- | -------------------------------------------------- | --------------------------------- |
| **Overall score /100** | **70**                                                               | **63**                                                | **57**                                  | **50**                                             | **43**                            |
| Validator category     | good                                                                 | good                                                  | good (capped)                           | lucky                                              | lucky (weak)                      |
| Market attractiveness  | High (verified gap, B2B GMV flow)                                    | High (demographic inevitability)                      | Low–Med (tiny TAM ~34B T/yr)            | Medium (fragmented, real prices)                   | Medium GMV, weak pull             |
| Competition            | باسکول adjacency only; no direct rival                               | 5+ incumbents (هیراد, اسنپ‌دکتر…)                     | 18-yr incumbent درمان‌دکتر              | Agencies + اسنپ‌ویزیت                              | 10+ gift shops                    |
| Defensibility          | Lot-verification reputation + supplier relationships (12–18 mo lead) | Vetting records + family lock-in dashboard            | Migration lock-in, weak moat            | Thin; price-comparison commodity                   | Thin; process only                |
| Ease of MVP            | Medium (marketplace 17–23 wk; concierge start helps)                 | Medium (14–22 wk + vetting ops)                       | High (standard SaaS 12–18 wk)           | High (aggregation 14–20 wk; bot-first)             | Medium (12–18 wk + supplier net)  |
| Willingness to pay     | Proven urgency (dead stock = bleeding cost)                          | Proven (families pay agencies 8–20M T/mo)             | Proven (agencies pay درمان‌دکتر)        | Moderate (rental market exists)                    | Unproven                          |
| Growth potential       | National + verticals (near-expiry food, returns)                     | High (aging curve to 2030s)                           | Low (niche ceiling)                     | Medium (post-surgery + elder)                      | Medium (formal-sector size)       |
| Capital requirements   | ~300–500M T MVP + working-capital-light                              | ~300–450M T + vetting/insurance setup                 | ~250–400M T                             | ~280–420M T                                        | ~250–400M T                       |
| Regulatory risk        | Low–Med (marketplace framing; eNAMAD; food vertical needs care)      | Medium (must stay non-medical; insurance partnership) | Low (pure software)                     | Medium (medical-device rental licensing surface)   | Low (invoicing compliance only)   |
| Execution difficulty   | 6/10                                                                 | 6/10                                                  | 5/10                                    | 5/10                                               | 5/10                              |
| Time to first revenue  | **Weeks** (first brokered lot)                                       | 2–3 months (first placements)                         | 2–4 months (pilot agencies)             | 1–2 months (bot referrals)                         | 3–6 months (B2B cycle)            |
| Biggest opportunity    | Becoming the B-Stock of Iran before باسکول notices                   | The default rails of aging Iran                       | Modernizing a paying-but-stale vertical | Price-transparency wedge ahead of اسنپ‌ویزیت scale | Formal-procurement invoice wedge  |
| Biggest risk           | باسکول adds liquidation category                                     | A catastrophic caregiver-trust incident               | درمان‌دکتر ships mobile                 | اسنپ‌ویزیت scales the category                     | Buyer pain doesn't exist          |
| Kill criteria          | <3/10 manual lots settle; suppliers reject 10% commission            | >70% subscription cancel ≤2 mo (disintermediation)    | <5/15 agencies pilot at 600k/mo         | >70% providers refuse published rates              | <10/50 HR buyers respond          |
| Recommended next step  | Broker 10 real lots this month (§8.3)                                | 15 manual placements in 3 Telegram communities        | 15 agency interviews + migration offer  | Price-comparison Telegram bot                      | Reject; revisit as service agency |

### 8.2 Ranking (strongest → weakest)

| Rank | Idea                           | Score | Verdict                    | Base Y1-end net/mo | Base Y3 net/mo   | Breakeven   |
| ---- | ------------------------------ | ----- | -------------------------- | ------------------ | ---------------- | ----------- |
| 1    | راکدشو (B2B liquidation)       | 70    | build (via concierge test) | +700M T (~$3.2k)   | +4.5B T (~$20k)  | month 10–14 |
| 2    | مراقب‌یار (elder care)         | 63    | test → build               | +35M T (~$160)     | +450M T (~$2k)   | month 16–20 |
| 3    | آژانس‌ساز (agency SaaS)        | 57    | test                       | +32M T (~$145)     | +220M T (~$1k)   | month 14–18 |
| 4    | تجهیزات‌یار (equipment rental) | 50    | test (bot first)           | +47M T (~$210)     | +300M T (~$1.4k) | month 15–18 |
| 5    | ستاد هدیه (corporate gifting)  | 43    | reject / pivot             | +38M T (~$170)     | +325M T (~$1.5k) | month 16–20 |

### 8.3 The one idea I would personally build: **راکدشو**

**Why:** it is the only candidate of 21 whose gap is _search-verified on both sides_
(desperate supply — dead stock is a monthly bleeding cost at 88% inflation; hungry demand
— resellers hunting margin, taught by guides to hunt via Instagram quote-tricks), it has
a proven international analogue (B-Stock), revenue starts with the **first brokered lot —
no build required to prove it** — and its risks are execution-shaped (cold start, trust
ops) rather than structural (regulation, incumbents, licenses). Every other candidate is
either capped by a small TAM (agency SaaS), gated by luck (equipment, gifting), or
carries trust/liability tail risk (elder care).

**What I would build in the first 30 days (no code):**

1. Days 1–7: visit/call 20 Tehran apparel تولیدی‌های with visible مستردرماندگی (from IG
   wholesale pages); collect 10 real lots (photos, counts, floor price). Sign nothing —
   handshake 5–10% broker fee.
2. Days 8–14: open a Telegram channel «راکدشو — حراج مستردرماندگی تاییدشده»; post lots
   with floor prices; DM 200 resellers/متری‌فروشی from IG wholesale communities.
3. Days 15–21: broker first deals manually (buyer pays seller directly; invoice the
   commission); arrange باربری C.O.D.; photograph condition reports.
4. Days 22–30: measure — lots settled, days-to-settle, repeat suppliers, buyer deposits
   accepted/refused. Decide: ≥3 settled + ≥1 repeat supplier → build the platform
   (Next.js + NestJS lot intake/auction, 17–23 wk). Less → kill or re-niche.

**Fastest way to validate customers will actually pay:** a supplier accepting the 10%
commission on a _guaranteed-buyer-in-7-days_ offer, and a buyer paying a refundable
deposit on a verified lot **before** the platform exists. Money moving beats every survey.

**The biggest reason NOT to build it:** باسکول (or عمدباکس) can add a liquidation
category with its existing B2B traffic in a sprint — your 12–18 month head start in
verification reputation and supplier relationships is the only thing that survives that,
and a solo founder might not build enough of it in time.

---

## 9. Sources & freshness

**Verified 2026-09-04 (this run):**

- FX: [TGJU](https://www.tgju.org/profile/price_dollar_rl) · دنیای اقتصاد · اقتصادنیوز · [Pashizi](https://www.pashizi.com/en/currency/usd) · [Navasan](https://navasan.net)
- Inflation: [Trading Economics — Iran CPI](https://tradingeconomics.com/iran/inflation-cpi)
- Elderly population: مرکز آمار via فارس (8% 65+) · آرمان امروز (12% claim) · ایسنا/بهزیستی (60+ projections to 1430)
- Caregiver tariffs 1405: [دمانو](https://www.darmanno.com/blog/prices-of-elderly-nurse-at-home/) · مهرپرور · کیان‌مهر · عاطفه · پرستاری۲۱
- Equipment rental: [اسنپ‌ویزیت](https://snappvisit.com/) · پارسا · مهدشفا · درمان‌منزل · پارسان‌مد
- Competitor checks (discovery log §2): mahdyar.net · donyaemahd.ir · mahd24.ir · hamkelasi.co · iotype.com · ivira.ai · amerandish.com · petabad.com · petia.ir · vetoria.ir · setjaa.com · banktalar.com · talarkadeh.com · box.snapp.ir · nobaar.com · achareh.co · keysuntsp.com · cafebazaar «کسب» · tlift.ir · lift-app.com · heroasansor.com · sazehhesab.com · hypersaz.com · digimasaleh.com · tamin24.com · anbaronline.ir · روناد (IG) · menobuzz.com · asazoon.com · rochismart.com · jamehbaft.com · buskool.com · omdbox.com · snapp.doctor · hirad-sc.com · darmandr.com · ino.ir («پرستار من») · jooyashop.com · adgift.ir · maxchap.ir · darman-manzel.ir

**Disclaimers:** Numbers marked "est." are assumption chains, not measurements — the
sizing layers for ideas 3–5 rest on unverified supplier/family counts. FX volatility can
halve USD equivalents within months; conservative columns are the likelier outcomes.
Nothing here is legal, tax, or investment advice; elder-care positioning (idea 2) and
equipment-rental licensing (idea 4) require a local lawyer's confirmation before launch.
