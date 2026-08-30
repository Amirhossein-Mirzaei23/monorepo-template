---
name: iran-startup-financials
description: Estimate MVP development timelines and Iranian-market financials — downloads/installs at 6 months and 1 year, monthly income in Tomans/Rials with USD equivalents, running costs, net income and breakeven month, and monetization strategies that actually work in Iran (local ad networks, gateway subscriptions, marketplace commissions, Cafe Bazaar billing). Use when the user asks about revenue or income projections, payback or breakeven estimates, download forecasts, برآورد درآمد, or how much an Iranian app can earn.
---

# Iran Startup Financial & Timeline Estimation (Skill 3 of the Iran startup pipeline)

Estimate what each idea costs in time and earns in Tomans. Companion skills:
`iran-startup-ideas` and `iran-startup-feasibility` (both before — the difficulty score
tempers the outlook per Non-negotiable rule 4).

## Non-negotiable rules

1. **State the FX assumption in every deliverable — rate, date, and sources.** Verify the
   current USD→Toman free-market rate with a web search at run time, cross-checking **two**
   sources (e.g. Mazaneh, Navasan, Alanchand). If search fails, use the dated fallback band
   in Data freshness below and label it unverified. 1 Toman = 10 Rials; everyday speech uses
   Tomans, banknotes say Rials — label units explicitly.
2. **Always give ranges (conservative → optimistic), never point estimates.** Most products
   land at or below the conservative end; say so.
3. **Show the math** — the assumptions (paying customers, bookings, ad impressions) next to
   the revenue, so the user can adjust one number and re-derive.
4. **Let the difficulty score temper the outlook — and say so.** From
   `iran-startup-feasibility`: score ≥ 7 → the conservative end is the base case and add a
   25–50% timeline buffer; 5–6 → midpoint is the base case; ≤ 4 → full range. State which
   rule applied in the output.
5. **Gross → net → breakeven.** Never stop at gross income: subtract running costs (below)
   and state the breakeven month against the MVP time investment.

## Workflow

1. Collect per-idea inputs: team size (default: solo dev; alternative: 2–3 person team),
   stack (default: the repo standard — Next.js PWA + Capacitor WebView + NestJS), and the
   feasibility score from `iran-startup-feasibility`.
2. Estimate MVP timeline from the velocity table.
3. Forecast installs and monthly income at 6 and 12 months using the benchmark table.
4. Define the monetization strategy with named Iranian mechanisms (below).
5. Compile per-idea sections plus one comparison table across ideas.

## Velocity table (MVP: web + WebView app, this monorepo's stack)

| Product archetype                         | Solo dev    | Team of 2–3 |
| ----------------------------------------- | ----------- | ----------- |
| Content / simple utility                  | 8–12 weeks  | 5–8 weeks   |
| B2B/B2B2C SaaS                            | 10–16 weeks | 7–11 weeks  |
| Consumer data product (pipeline + models) | 12–18 weeks | 9–13 weeks  |
| Two-sided marketplace (booking/orders)    | 14–20 weeks | 10–14 weeks |

Add +2–3 weeks if the product needs native-feel WebView polish (push via Najva/OneSignal,
deep links, offline mode). Regulated sectors add weeks for eNAMAD/Samandehi paperwork and
moderation tooling — pull that from the feasibility review, don't ignore it.

## Benchmark table (sanity bands, state as adjustable assumptions)

- Free→paid conversion for Persian-language freemium: **0.5–3%**.
- Iranian display ad eCPM (Yektanet/Tapad/Anetwork): roughly **2,000–20,000 Tomans per 1,000
  impressions** depending on format; native/video at the top of the band.
- Marketplace commission norm: **8–12%** of GMV.
- B2B SaaS pricing that Iranian SMEs actually pay: **30,000–200,000 Tomans/month** per seat
  or per entity (building, shop, lodge).
- Consumer subscriptions that convert: **30,000–100,000 Tomans/month** (≈ a fast-food meal);
  above that, expect big churn.
- Cafe Bazaar in-app billing works for Android; iOS revenue via PWA is near-zero — model it
  as 0 and treat any iOS income as upside.
- Install baselines for a decent 6-month consumer launch (Bazaar + Telegram/Instagram
  promotion, no paid featuring): 20k–100k. B2B2C products grow per-customer
  (2k–10k installs), not virally — do not hold them to consumer curves.
- Manual-renewal subscription churn: ~10–20%/month — year-one revenue is churn-dominated,
  not conversion-dominated. Name the churn figure used in the assumption math.
- Seasonality: travel/event/marketplace demand concentrates in Nowruz and summer peaks —
  model peak months at 2–3× the off-season baseline.

## Cost benchmarks (re-verify per Data freshness before quoting)

- Iranian VPS/CDN at MVP scale (mid-tier + ArvanCloud): ~2–10M Tomans/month.
- SMS (Kavenegar): ~1,000–3,000 Tomans/message depending on volume and sender type.
- Gateway fees: ~1% or a fixed per-transaction fee (verify current Zarinpal/IDPay pricing).
- Cafe Bazaar revenue share on in-app billing: verify the current percentage before
  modeling it.
- Support/moderation: from ~10M Tomans/month part-time — non-optional for marketplaces.

## Monetization mechanisms that work in Iran

Name which of these each idea uses; mechanisms outside this list need justification:

- **Local ad networks** — Yektanet, Tapad, Anetwork (paid in Tomans).
- **Gateway subscriptions** — recurring or manual-renew plans billed via Zarinpal/IDPay/PayPing
  in Tomans (true auto-renew without cards-on-file is limited; expect renewal nudges via SMS).
- **SMS-gateway services** — sold per-bundle through Kavenegar with a markup.
- **Transaction/service fee** — 8–12% of GMV; pay merchants directly, never hold funds in a
  wallet (Central Bank licensing).
- **Freemium SaaS** — free tier capped hard enough to force upgrades.
- **Cafe Bazaar in-app billing** — one-offs and consumables on Android.
- **Featured/promoted listings** — marketplace upsell for suppliers.
- **B2B data/API licensing** — aggregated, anonymized datasets to dealers/insurers/research.

## Output format (per idea)

- **Estimated Development Time:** weeks/months for MVP (web + WebView), solo vs team
- **6-Month Estimate:** installs, plus monthly income in Tomans (and Rials + USD equivalent)
- **1-Year Estimate:** installs, plus monthly income in Tomans (and Rials + USD equivalent)
  — each with the assumption math shown
- **Monetization Strategy:** named mechanisms from the list above
- **Costs & Net Income:** monthly cost lines from the cost benchmarks, net income, and the
  breakeven month against the MVP investment

Close with a comparison table: idea | MVP time | 6-mo net | 1-yr net | breakeven month.

## Example (frozen sample — do not reuse numbers verbatim)

60 paying buildings × 250,000 T/month avg = 15M T gross; costs (VPS + SMS + gateway) ≈ 7M T
→ **8M T net** (~$40 at 200,000 T/USD, verified 2026-08-29). Difficulty 5/10 → midpoint base
case, no timeline buffer. Breakeven month: when cumulative net income repays the MVP
investment (dev weeks × the developer's monthly opportunity cost).

## Data freshness

Time-sensitive claims: FX, ad eCPM bands, conversion rates, pricing bands, install
baselines, SMS/gateway/VPS costs, store commission. Anchor date: **2026-08-29**
(free-market FX then ≈ 190,000–205,000 T/USD, official ≈ 137,500 T). Re-verify FX and cost
figures via web search **every run**. FX fallback if search fails: 150,000–220,000 T/USD,
anchored 2026-08 — label it unverified. FX and benchmark figures across the three skills
are anchored per their Data freshness blocks; if skills disagree, re-verify and trust the
most recently dated source.

## Disclaimers (always include, briefly)

Numbers are scenario planning, not forecasts; FX volatility in Iran can halve the USD value
of Tomans revenue within months; the conservative end is the likelier outcome.
