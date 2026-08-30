# Iran Startup Skills — Review & Improvement Plan

> **Reviewed:** 2026-08-29 · **Method:** skill-creator review loop (draft → review → improve → re-test)
> **Files reviewed:**
>
> - `.agents/skills/iran-startup-ideas/SKILL.md`
> - `.agents/skills/iran-startup-feasibility/SKILL.md`
> - `.agents/skills/iran-startup-financials/SKILL.md`

---

## Verdict (TL;DR)

The skills are structurally sound: trigger-rich bilingual descriptions, lean bodies
(90–150 lines, well under the 500-line budget), concrete Iran-specific checklists, and a
firm web + WebView architecture standard. They are usable today — and in fact already
produced one real deliverable (`doc/iran_startup_ideas.md`).

The review found **2 priority-zero issues** (one factual bug, one missing policy), **5
priority-one quality gaps**, and **7 priority-two polish items**. The most urgent: the
financials skill's fallback exchange-rate band is stale by ~2× (written for a
~100k T/USD world; the verified Aug-2026 free-market rate is ~190,000–205,000 T/USD), and
if the runtime web search ever fails, every USD figure it produces would be roughly
doubled in error.

---

## What's Working (keep, and don't bloat)

- **Descriptions trigger well.** All three are pushy, name concrete user phrasings, and
  include Persian triggers (ایده استارتاپ، ارزیابی ایده، برآورد درآمد). Trigger overlap
  between them is low and sensible (ideas = generation, feasibility = scoring/risk,
  financials = money/time).
- **Anchor table in feasibility** (`iran-startup-feasibility/SKILL.md:23-31`) makes 1–10
  scores comparable and forces justification — this is the best part of the pipeline.
- **Non-negotiable rules in financials** (`iran-startup-financials/SKILL.md:12-21`):
  ranges-not-points, show-the-math, state-the-FX. Exactly right.
- **Architecture standard in ideas** enforces dual deployment (PWA + Capacitor WebView,
  Cafe Bazaar/direct APK, Zarinpal/Kavenegar, Jalali + RTL) — no generated idea can drift
  into a native-app or Stripe-payment fantasy.
- **Style:** imperative, explains _why_ where it matters, no MUST/NEVER shouting.

The improvements below should be added without growing any file past ~200 lines — if a
fix feels heavy, it goes into a `references/` file instead of the body.

---

## Findings by Priority

### P0 — Factual correctness (fix before next use)

**IMP-01 · Stale FX fallback band in `iran-startup-financials` (lines 14–17).**
The rule says: verify the rate via web search; if that fails, fall back to
"~90,000–120,000 Tomans per USD (2025–2026 era)". The verified free-market rate on
2026-08-29 is **~190,000–205,000 T/USD** (official ~137,500). The primary rule (search
first) saved the last run, but the fallback is a trap for any offline run.
**Fix:** replace the band with a _dated_ fallback (e.g., "150,000–220,000 T, last
anchored 2026-08") and require cross-checking two sources plus stamping the rate and date
in every output.

**IMP-02 · No data-freshness policy in any of the three skills.**
The bodies embed era-bound facts with no "last verified" markers and no re-verify
instruction: ad eCPM bands, free→paid conversion, install baselines, SaaS pricing bands,
the "40% inflation" figure in feasibility's checklist, the incumbents list (Divar,
Digikala, Snapp…), and the FX band above. Skills get stale silently.
**Fix:** add a short `## Data freshness` block to each SKILL.md listing which claims are
time-sensitive, the anchor date, and an instruction to re-verify via web search before
relying on them. (Cheaper and less brittle than extracting a shared reference file — see
IMP-12.)

### P1 — Quality gaps

**IMP-03 · No worked examples anywhere.**
skill-creator's strongest guidance is "examples beat rules," and none of the three skills
contains a literal filled-in output block. The pipeline _did_ produce one good deliverable
(`doc/iran_startup_ideas.md`), so proven example content already exists.
**Fix:** add one compact example per skill — a single five-field idea block (ideas), one
anchor-justified score with verdict (feasibility), one income table with visible math
(financials). Keep each under ~20 lines, marked `Example (frozen sample — do not reuse
numbers verbatim)`.

**IMP-04 · The feasibility→financials handshake has no mechanics.**
`iran-startup-financials/SKILL.md:9-10` says the difficulty score "should temper the
financial outlook," but no rule defines how, so two runs can temper differently.
**Fix (proposed rule, lives in financials):** difficulty ≥ 7 → report the conservative end
as the base case and add a 25–50% timeline buffer; 5–6 → midpoint as base case; ≤ 4 → full
range. State which rule applied in the output.

**IMP-05 · Financials models revenue but no costs — yet promises a payback note.**
The output format (`iran-startup-financials/SKILL.md:85-86`) requires a "when does it pay
back a solo dev's time" line, but the skill provides no cost benchmarks to compute it:
hosting/CDN, SMS unit costs, gateway fees, store commission on Cafe Bazaar billing,
moderation/support hours. It also over-triggers slightly: the description advertises
"startup costs," which the body can't currently deliver.
**Fix:** add a cost benchmark block (Iranian VPS + ArvanCloud band, Kavenegar per-SMS
band, gateway fee band, Cafe Bazaar revenue-share band — each flagged for re-verification
per IMP-02), require a net-income line and a breakeven month in the output, and reword the
description from "startup costs" to "revenue, income, and payback estimates" until the
cost side is real.

**IMP-06 · Feasibility risks carry no severity or mitigation.**
Every risk is an equal bullet, so a reader can't tell a launch-blocker from a nuisance,
and the format's "single hardest risk" isn't followed by what to do about it.
**Fix:** tag each risk **H/M/L** inside the three category lists, and extend the Verdict
line to "ship / ship-with-changes / avoid — hardest risk + one-line mitigation." Keep it
to a tag, not a scored risk matrix (that would bloat the file).

**IMP-07 · Typo in `iran-startup-ideas` cheat sheet.**
The Regulation bullet reads `thisماد (eNAMAD)` — a mixed-script glitch; should be
`eNAMAD (اینماد)`. Harmless to triggering but embarrassing in a document that gets read.
**Fix:** one-line edit.

### P2 — Structure & polish

**IMP-08 · Ideas skill never asks what the ideas are _for_.**
Solo-dev side income, venture-scale startup, and agency client project select completely
different ideas (a 5/10-difficulty SaaS vs a 9/10 fintech bet). The skill proceeds on
defaults without capturing this.
**Fix:** add one input — operator goal (default: solo dev building for income; state it)
— and a sentence on how it biases selection (income → difficulty ≤ 6; venture → allow
7–9 with licensing runway).

**IMP-09 · "Why it works in Iran" claims aren't required to cite evidence.**
Good, verifiable signals exist: Divar category listing volumes, Telegram/Instagram channel
sizes, incumbent app review complaints, price spreads. The current quality bar asks for
recognition, not evidence.
**Fix:** extend the quality-bar self-check with a signals checklist (2+ observable
signals per idea; name where you'd check them).

**IMP-10 · Feasibility ignores team context and relative calibration.**
24/7 peak operations are a very different difficulty for a solo dev vs a team of five;
and scoring ideas in isolation invites every idea landing at 6.
**Fix:** add "state the assumed team; adjust ops-heavy categories for it" to the workflow,
and require the comparison table to also rank ideas relative to each other.

**IMP-11 · Financials lacks churn and seasonality assumptions.**
Tomans subscriptions renew manually (SMS nudges), so monthly churn is the dominant driver
of year-one revenue; travel/marketplace ideas live and die by Nowruz/summer spikes. The
one real run handled both ad hoc — codify what was improvised.
**Fix:** add benchmark lines (manual-renewal churn ~10–20%/month; seasonal demand
concentration for travel categories) and require the assumption math to name the churn
figure used.

**IMP-12 · Duplicated Iran context across skills → drift (already happened once).**
Architecture rules, regulation lists, and FX facts appear in all three files with slight
variants; the FX drift in IMP-01 is the first symptom. Extracting a shared `references/`
file is possible but fragile (skills get copied/moved independently).
**Recommendation:** keep the duplication, add the IMP-02 freshness blocks, and add one
line to each skill: "FX and benchmark figures are anchored per the Data freshness block —
if skills disagree, re-verify and trust the dated source."

**IMP-13 · Pipeline orchestration is under-specified.**
Only the ideas skill mentions compiling a single deliverable; there is no output-file
convention and no defined handoff contract between skills.
**Recommendation (two options):** (a) extend the ideas skill's final step with the
compile contract — default output `doc/iran_startup_ideas.md`, sections in pipeline order,
global assumptions table at top (what the real run already did); or (b) add a tiny fourth
`iran-startup-pipeline` skill (~40 lines) if the full pipeline becomes a frequent
request. Prefer (a) until the pipeline runs more than once.

**IMP-14 · Frontmatter could carry `license`/`metadata` — deliberately not recommended.**
Reserved frontmatter fields exist, but adding unused metadata is ceremony without benefit;
the freshness blocks (IMP-02) carry provenance where the model actually reads it. No
change.

---

## Consolidated Backlog

| ID     | Priority | Skill                | Change                                                                    | Effort |
| ------ | -------- | -------------------- | ------------------------------------------------------------------------- | ------ |
| IMP-01 | **P0**   | financials           | Replace stale FX fallback band with dated band + 2-source check           | S      |
| IMP-02 | **P0**   | all three            | Add `## Data freshness` blocks with anchor dates                          | S      |
| IMP-03 | P1       | all three            | Add one compact worked example per skill                                  | S–M    |
| IMP-04 | P1       | financials           | Define the difficulty→outlook tempering rule                              | S      |
| IMP-05 | P1       | financials           | Add cost benchmarks, net-income line, breakeven month; reword description | M      |
| IMP-06 | P1       | feasibility          | H/M/L risk tags + mitigation in verdict                                   | S      |
| IMP-07 | P1       | ideas                | Fix `thisماد` → `eNAMAD (اینماد)` typo                                    | S      |
| IMP-08 | P2       | ideas                | Operator-goal input with stated default                                   | S      |
| IMP-09 | P2       | ideas                | Pain-point evidence (signals) self-check                                  | S      |
| IMP-10 | P2       | feasibility          | Team-context adjustment + relative ranking                                | S      |
| IMP-11 | P2       | financials           | Churn + seasonality benchmark lines                                       | S      |
| IMP-12 | P2       | all three            | Cross-skill disagreement note (keep duplication, add dates)               | S      |
| IMP-13 | P2       | ideas (or new skill) | Compile contract for the full pipeline                                    | S–M    |
| IMP-14 | —        | —                    | No change (documented decision: no extra frontmatter)                     | —      |

Rough total: P0 ≈ 30 minutes of edits; P0+P1 ≈ 2 hours. All fixes keep every file under
200 lines.

**Status (2026-08-29):** IMP-01 through IMP-13 applied to the three SKILL.md files
(112–133 lines each, within budget); IMP-14 remains a documented no-change. One extra fix
found during application: the financials intro named `iran-startup-financials` as its own
companion skill where it should have said `iran-startup-feasibility` — corrected. All three
Open Decisions were resolved per their recommendations (cost model added to financials;
ideas skill extended with the compile contract instead of a fourth skill; duplication +
freshness blocks kept over a shared reference file).

---

## Test Prompts (for validating the improvements)

Per the skill-creator loop, run these after applying the backlog — each should trigger the
intended skill **by description alone** (no `/skill` forcing), and pass its acceptance
criteria. Run one at a time and inspect the trace as well as the result.

1. **Trigger + defaults (ideas):**
   `برام ۳ تا ایده استارتاپ برای بازار ایران بده که با وب و اپ وب‌ویو کار کنه`
   _Pass:_ 3 ideas, all five fields each, architecture standard respected, defaults stated.
   _After IMP-08/09:_ operator goal stated; ≥ 2 evidence signals per idea.

2. **Foreign idea, no handoff (feasibility):**
   `Is a meal-kit subscription a good idea for Iran? How hard would it be to build as a web + webview app?`
   _Pass:_ anchored score (expect ~6–8: cold-chain logistics + health licensing), all
   three categories, verdict. _After IMP-06:_ H/M/L tags + mitigation. _After IMP-10:_
   team assumption stated.

3. **Numbers under uncertainty (financials):**
   `یه اپ مدیریت ساختمان تو ایران بعد از یه سال چقدر درآمد خالص داره؟`
   _Pass:_ FX rate verified via search and date-stamped; ranges with visible math; no
   point estimates. _After IMP-05/11:_ net income after costs, breakeven month, churn
   figure named.

4. **Full pipeline (orchestration, after IMP-13):**
   `Run the full Iran startup pipeline for 2 ideas in domestic tourism and compile the report`
   _Pass:_ all three skills' output formats present, numbers consistent across sections,
   compiled doc saved to the agreed path.

If a run produces busywork (re-verifying the same fact twice, regenerating identical
tables), that's over-prescription — cut the offending rule rather than adding more.

---

## Open Decisions (owner's call)

1. **Add the cost model to financials (IMP-05)?** Recommended yes — it converts an income
   estimator into a payback estimator, which is what decision-making actually needs.
2. **Fourth orchestrator skill vs extending the ideas skill (IMP-13)?** Recommended:
   extend now; add the skill only if the full pipeline runs regularly.
3. **Shared reference file vs duplication + freshness blocks (IMP-12)?** Recommended:
   duplication + freshness blocks; a shared file breaks if a skill directory is copied
   elsewhere.

_Apply the backlog by editing the three SKILL.md files in place; then rerun the test
prompts above and record results in this document's Test log section._

## Test Log

| Date       | Prompt # | Skill triggered | Pass/fail | Notes                                                                                                                                                                                                                                       |
| ---------- | -------- | --------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-29 | —        | —               | —         | Backlog applied (IMP-01–IMP-13 + companion-skill typo fix). Trigger tests for prompts 1–4 pending: the skills were created this session and are not in this session's discovery list — run them in a fresh ZCode turn and log results here. |
| —          | —        | —               | —         | Baseline before improvements: one real pipeline run on 2026-08-29 produced `doc/iran_startup_ideas.md`                                                                                                                                      |
