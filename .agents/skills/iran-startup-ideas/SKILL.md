---
name: iran-startup-ideas
description: Generate startup and product ideas tailored to the Iranian market, each architected as a responsive web platform plus a WebView mobile app (PWA wrapped with Capacitor/Cordova for Cafe Bazaar / direct APK distribution). Use whenever the user asks for Iran-focused startup ideas, Iranian or Persian app ideas (ایده استارتاپ), Iran market opportunities, or wants to brainstorm products for Iranian users — even if the word "startup" is never used. After generating, every idea must be verified against the live market via web search for existing similar startups and apps (Iranian or regional) before it is presented as novel.
---

# Iran Startup Idea Generation (Skill 1 of the Iran startup pipeline)

Generate N distinct startup ideas for the Iranian market. This skill is the first of three
companion skills: `iran-startup-ideas` → `iran-startup-feasibility` → `iran-startup-financials`.
When the user wants the full analysis, run all three and compile per the Full-pipeline
compile contract below.

## Inputs

- **N** — number of ideas. Default to **3** when the user does not specify.
- **Sector focus** (optional) — e.g. fintech, tourism, e-commerce. Bias ideas toward it but
  still diversify the portfolio: mix B2B vs B2C, SaaS vs marketplace vs data product.
- **Operator goal** (optional) — default: **a solo developer building for income**; that
  biases selection toward difficulty ≤ 6 with fast, legal revenue. Venture-scale goals may
  include 7–9 difficulty ideas with licensing runway; an agency client project biases toward
  demonstrable MVPs in ≤ 3 months.

Proceed with defaults rather than blocking on questions; state the defaults you used.

## Workflow

1. Ground every idea in a verifiable Iranian pain point from the cheat sheet below. Reject
   ideas that are merely a US/EU startup translated into Persian — the "Why it works in Iran"
   section must name concrete local forces (inflation behavior, Shaparak rails, filtering,
   logistics, consumer habits). Generic ideas fail this test.
2. Diversify difficulty profiles deliberately: include at least one idea with light regulatory
   burden so the portfolio is not uniformly hard to launch.
3. For each idea produce **all five required fields** exactly as in the Output format below.
4. The Tech Stack Brief must confirm dual deployment: a responsive web app **and** a WebView
   mobile app from the same codebase. Never propose a fully-native mobile stack.
5. **Post-generation market check (mandatory).** After drafting, verify every idea against
   the live market with web searches before presenting the ideas as final — an idea that a
   single search could invalidate must not survive as "novel":
   - Search in Persian **and** English: «[idea keywords] اپلیکیشن», «[idea] استارتاپ
     ایرانی», "[idea] app Iran", plus incumbent-space queries (Divar, Snapp, Digikala,
     Jabama, Cafe Bazaar / Myket listings; TechRasa / Digiato / Persian Wikipedia coverage).
   - For each idea, record the closest existing products found: name, one line on what it
     does, any scale/traction signal (downloads, funding, reviews), and the source name +
     access date.
   - If a direct, established equivalent exists, either replace the idea or reframe
     "Why it works in Iran" around a concrete, search-evidenced gap the incumbent leaves
     (recurring complaints in app reviews, an unserved segment, pricing structure).
6. After generating (including the market check), point the user to the companion skills
   for scoring and financial estimates, or run the full pipeline if they asked for
   complete analysis.

## Output format

Per idea:

- **Idea Name:** catchy Persian name (with Latin transliteration / English gloss)
- **Core Concept:** 2–3 sentences on what the web/WebView platform does
- **Target Audience:** who in Iran, with rough scale and geography (Tehran-first vs national)
- **Why it works in Iran:** the local cultural, economic, or technological pain points
- **Tech Stack Brief:** web + WebView deployment plan (see Architecture standard below)
- **Existing similar products:** (verified via web search, [date]) closest Iranian /
  regional / global products found — name + one line each + traction signal if known;
  then one line on this idea's wedge against them, or "no direct equivalent found"

## Example (frozen sample — do not reuse numbers verbatim)

- **Idea Name:** هم‌ساختمان — HamSakhteman ("Co-Building")
- **Core Concept:** Building-management SaaS — online شارژ ساختمان billing, shared-expense
  ledger, assembly voting, SMS notices; manager web dashboard + resident PWA/WebView app.
- **Target Audience:** volunteer building managers and building-service companies in major
  cities (hundreds of thousands of buildings); residents as second audience.
- **Why it works in Iran:** dues still collected by cash and paper ledgers; 30–50% inflation
  silently breaks Excel budgets; incumbents are fragmented micro-apps; Shaparak rails make
  billing loops cheap to automate.
- **Tech Stack Brief:** Next.js PWA + Capacitor (Cafe Bazaar/direct APK), NestJS +
  PostgreSQL, Zarinpal direct-to-manager, Kavenegar SMS, Jalali cycles, Excel import.
- **Existing similar products:** (web-checked [date]) e.g. two micro building-charge apps
  found on Cafe Bazaar — name them with links; wedge vs them = inflation-indexed budgets +
  assembly voting, which their user reviews explicitly request.

## Architecture standard (every idea must comply)

- **Web:** responsive PWA (in this repo: Next.js `apps/web`), RTL-first UI, Jalali (شمسی)
  calendar via a library such as `dayjs-jalali` — Gregorian-only dates are a rejection bug in
  Iran. Offline-tolerant service-worker caching, because mobile data is throttled or drops.
- **WebView mobile app:** wrap the same PWA with **Capacitor**. Distribute on Android via
  **Cafe Bazaar / Myket + a direct-APK download page**. For iOS, the PWA itself is the channel
  (add-to-home-screen) — there is no official Iranian App Store presence, so do not plan
  around App Store distribution.
- **Backend:** NestJS (`apps/api`) + PostgreSQL. Host on an Iranian provider or a
  sanctions-tolerant host (e.g. Hetzner), behind an Iranian CDN (ArvanCloud) for latency.
- **Payments:** a Shaparak-connected gateway in Tomans (Zarinpal / IDPay / PayPing). Never
  plan around Stripe/PayPal/Google Play billing — they do not work for Iranian merchants.
- **Notifications:** SMS via Kavenegar/Ghasedak is the trusted channel; Iranian push services
  (e.g. Najva) for Android, since FCM delivery to Cafe Bazaar installs is unreliable.

## Iran market cheat sheet

Pain-point raw material — mine this, do not copy it verbatim into every idea:

- **Economy:** chronic 30–50% inflation; prices renegotiated weekly; households hedge via
  gold/coins/real estate/dollars; purchasing power erosion makes subscription pricing in
  Tomans tricky (price annually or index-linked).
- **Payments:** Shaparak network, domestic gateways (Zarinpal, IDPay, PayPing), IBAN
  (شبا) transfers, no international cards. Card-to-card is a de-facto payment habit.
- **Platforms incumbents:** Digikala (e-commerce), Divar (classifieds), Snapp/Tapsi (ride),
  Aliababa/Jabama (travel), Torob/Emalls (price comparison), Cafe Bazaar/Myket (Android).
  Ideas that ignore these incumbents' gravity are naive.
- **Distribution reality:** Google Play exists on Iranian phones but billing does not;
  Cafe Bazaar is the store that matters. Telegram/Instagram channels are the real growth
  engine for consumer apps; Instagram is also the de-facto SME storefront.
- **Regulation:** eNAMAD (اینماد) trust seal for online sales, ساماندهی (Samandehi)
  registration for websites (required to survive filtering waves), sector licenses for
  tourism/health/fintech, strict filtering (پاسخگویی) regime for user-generated content.
- **Connectivity & devices:** mid/low-end Android dominates; international CDN/JS CDNs can
  be slow or blocked — self-host fonts/assets behind ArvanCloud. Design for 3G-quality
  networks and small viewports.
- **Culture & habits:** high trust in SMS and phone calls over email; family/group
  decision-making; Nowruz and summer = travel peaks; Friday weekend; Persian-only UX for
  mass market (English UX caps your audience to a niche).

## Quality bar

Before finalizing, self-check each idea:

- Would a Tehrani and a Shirazi both recognize the pain point within one sentence?
- Is there a named reason a Silicon Valley equivalent would NOT work here unchanged?
- Can the MVP ship on the Architecture standard in ≤ 4 months with 1–3 developers?
- Does "Why it works in Iran" cite at least two observable signals — e.g. Divar category
  volume, Telegram/Instagram channel sizes, incumbent app-review complaints, price spreads?
  Name where each signal can be checked; unobservable pain points weaken every downstream
  skill.
- Did the post-generation market check run? "Existing similar products" must name real
  found products (with sources and date) or state plainly that none were found — never
  assume a gap.

## Full-pipeline compile contract

When the user wants the complete analysis, run all three skills and compile **one** markdown
deliverable (default path in this repo: `doc/iran_startup_ideas.md`):

1. Title, generation date, and a **Global Assumptions** table (FX rate + date, team,
   distribution, payments) at the top.
2. One top-level section per idea, in pipeline order: Idea Profile (skill 1) → Difficulty
   Review (skill 2) → Financial & Timeline Estimate (skill 3).
3. Close with a portfolio comparison table and a one-paragraph recommendation.
4. Numbers must stay consistent across sections — if skill 3 revises an assumption, fix it
   everywhere it appears.

## Data freshness

Time-sensitive claims: inflation rate, incumbents list, platform habits, regulation
specifics, and market-check / competitor findings. Anchor date: **2026-09-04** — re-verify
via web search before relying on them in a new run; competitor findings from an earlier
run are stale and must be re-searched, not reused. FX and benchmark figures across the three skills are anchored per their Data
freshness blocks; if skills disagree, re-verify and trust the most recently dated source.
