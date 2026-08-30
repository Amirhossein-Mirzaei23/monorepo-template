---
name: iran-startup-feasibility
description: Review and score startup ideas for the Iranian market on a 1–10 difficulty scale, with challenges categorized as Technical, Market/Operational, and Legal/Regulatory (filtering, eNAMAD, sector licenses, scraping legality). Use when the user has startup ideas (their own or generated with iran-startup-ideas) and wants difficulty scoring, feasibility analysis, risk assessment, ارزیابی ایده, or a go/no-go comparison for Iran.
---

# Iran Startup Feasibility Review (Skill 2 of the Iran startup pipeline)

Take concrete startup ideas (from the user or from `iran-startup-ideas`) and score how hard
each one is to execute in Iran specifically. Companion skills: `iran-startup-ideas` (before)
and `iran-startup-financials` (after).

## Workflow

1. Restate each idea in one line so the review is self-contained.
2. State the assumed team (default: solo developer) and score with it — 24/7 peak
   operations and physical supply acquisition are roughly one full point harder solo.
3. Score difficulty 1–10 using the anchor table below. Justify the number against the
   anchors — not a vibe.
4. List the concrete difficulties in three mandatory categories: **Technical**,
   **Market/Operational**, **Legal/Regulatory**. Every idea gets all three sections, even if
   one is short. Tag each difficulty **H** (launch-blocker), **M** (material), or **L**
   (nuisance). Name Iran-specific items, not generic startup risks ("user acquisition"
   alone is too vague; "user acquisition without Instagram ads after a filtering wave" is not).
5. Finish with a comparison table across all ideas: name, score, hardest single risk. Rank
   the ideas against each other, not only by absolute score — scoring in isolation invites
   every idea landing at 6.

## Difficulty anchors

| Score | Anchor                                                                                                                                         |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–2   | Static content or simple tool. No payments, no third-party integrations, one audience.                                                         |
| 3–4   | Standard CRUD SaaS with a Shaparak gateway + SMS OTP. Compliance = eNAMAD + Samandehi paperwork only.                                          |
| 5–6   | Two-sided marketplace or meaningful data pipeline; multi-stakeholder operations; standard e-commerce compliance; incumbent platforms adjacent. |
| 7–8   | Gray-zone data acquisition (scraping/ToS conflicts), or a sector with real licensing (tourism, health-adjacent), or 24/7 peak operations.      |
| 9–10  | Regulated money handling (Central Bank PSP/wallet licenses), core banking/insurance/health services, or a nationwide logistics fleet.          |

## Difficulty checklists (mine these per idea)

**Technical**

- Local API integration: gateway reconciliation (partial/refunded payments), Kavenegar SMS
  quotas and costs, Shaba/IBAN payout flows.
- Poor connectivity: offline-first PWA, aggressive caching, image budgets for 3G-quality
  networks, self-hosted fonts/assets (foreign CDNs are slow/blocked).
- WebView constraints: no heavy native-style animations, sticky-scroll jank, keyboard/RTL
  input quirks, push delivery to Cafe Bazaar installs needs an Iranian push service (Najva)
  because FCM is unreliable there.
- Jalali calendar + Persian digits/RTL everywhere; Excel import/export (Persian SMEs live in
  Excel and will hand you corrupted CSVs).
- Data products: scraping fragility (selectors, rate limits, IP blocks), dedupe, spam-listing
  filtering, modeling prices under 40% inflation.

**Market/Operational**

- Cold start: which side first, and the cheapest way to fake the other side.
- User acquisition channels: Cafe Bazaar ASO, Telegram/Instagram channels, content SEO —
  and what happens to the plan if Instagram is throttled.
- Trust deficit: users expect phone-call support; budget human support in Persian.
- Price sensitivity under inflation; Tomans pricing needs annual/indexed structure.
- Incumbent gravity: what stops Divar/Digikala/Snapp/Aliababa from shipping this natively?
- Supply acquisition (marketplaces): rural/low-digital-literacy hosts need phone-based
  onboarding, not a self-serve dashboard.

**Legal/Regulatory**

- eNAMAD (اینماد) required for online sales; Samandehi (ساماندهی) registration required to
  survive filtering; expect a پاسخگویی (complaint/response) obligation for user-generated
  content — moderation tooling is mandatory, not optional.
- Sector licenses: tourism (Ministry of Cultural Heritage permits for accommodation),
  health (Ministry of Health), anything money-like (Central Bank).
- Scraping/republishing: ToS violations, personal data in listings (phone numbers), copyright
  in photos — gray zone that can end in endpoint blocking.
- Avoid holding user funds in a wallet (PSP licensing); route payments directly to the
  merchant's gateway account and take a service fee.
- Consumer protection law applies to marketplaces (refund/cancellation terms).

## Output format

Per idea:

- **Difficulty Score:** X/10, with a one-sentence anchor justification and the assumed team
- **Technical Difficulties:** bulleted list, each tagged H/M/L
- **Market/Operational Difficulties:** bulleted list, each tagged H/M/L
- **Legal/Regulatory Difficulties:** bulleted list, each tagged H/M/L
- **Verdict:** one line — ship / ship-with-changes / avoid, the single hardest risk, and a
  one-line mitigation for it

Close with a comparison table:

| Idea | Difficulty | Hardest single risk |
| ---- | ---------- | ------------------- |

## Example (frozen sample — do not reuse numbers verbatim)

- **Idea:** rural eco-lodge booking marketplace (web + WebView), assumed team: solo dev.
- **Difficulty Score:** 6/10 — two-sided marketplace with sector licensing (anchor 5–6);
  below 7 because payments route direct-to-host, no wallet.
- **Top difficulties:** Technical — double-booking on phone-booked calendars (H).
  Market — boots-on-ground host onboarding (H); Nowruz seasonality (M). Legal — host-permit
  verification via Ministry of Cultural Heritage (M); staying a platform, not a licensed
  travel agency (H).
- **Verdict:** ship-with-changes — hardest risk is supply acquisition; mitigate by
  launching in one province with a local partner.

## Data freshness

Time-sensitive claims: the ~40% inflation figure, filtering/پاسخگویی enforcement intensity,
sector-license specifics, FCM-vs-Najva push reliability. Anchor date: **2026-08-29** —
re-verify licensing and filtering claims before any go/no-go decision. FX and benchmark
figures across the three skills are anchored per their Data freshness blocks; if skills
disagree, re-verify and trust the most recently dated source.
