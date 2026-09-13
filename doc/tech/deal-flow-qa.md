# DEAL-004 manual QA script — the deal flow, two phones

The DEAL-004 card's acceptance: "buyer and seller views drive one deal to
completion from both phones". Run this against a seeded dev environment
(`npm run dev`, two browsers/phones logged in as a buyer and a seller account).

Preconditions: one ACTIVE lot owned by the seller (fixed-price works fastest);
the buyer opened the lot's chat thread.

## Walk

1. **Create** — buyer: make an offer in chat («پیشنهاد قیمت»); seller: accept
   it from /offers دریافتی; buyer: POST /deals via the accepted offer (API or
   the chat entry point when wired). Both parties: the deal appears in /deals
   (buyer tab خرید, seller tab فروش) with status «در مذاکره».
2. **Negotiate stage** — either side taps «پذیرش معامله» on /deals/:code; the
   other side's same button shows disabled with the «در انتظار اقدام …»
   tooltip; the timeline grows a «توافق شده» entry (Jalali date).
3. **Payment stage** — buyer: «ورود به مرحله پرداخت» → status «در انتظار
   پرداخت»; buyer taps «پرداخت کردم» → toast «پرداخت شما اعلام شد», the button
   disappears, the timeline carries «خریدار پرداخت را اعلام کرد»; seller taps
   «تأیید دریافت پرداخت» → status «پرداخت شده».
4. **Fulfilment** — seller advances «آماده‌سازی سفارش» → «ارسال شد» →
   «تحویل داده شد» (buyer sees each change within the 30 s detail polling or
   on refresh).
5. **Completion** — buyer taps «تأیید دریافت کالا» → status «تکمیل شده»
   (emerald chip), the action bar empties, the deal card dims on the list.
6. **Cancel path (second deal)** — buyer cancels early from the detail
   («لغو معامله», reason ≥ 1 char) → status «لغو شده»; the seller's lot
   available quantity is restored (check /dashboard/lots).
7. **Dispute validation** — on the third deal, tap «اعلام اختلاف» and type a
   1-word reason → inline «حداقل ۲۰ نویسه» error; a ≥ 20-char reason submits →
   status «در اختلاف», action bar shows only the waiting note for both sides.
8. **409 refresh state** — with the detail open in both browsers, advance the
   status on one side then tap a now-stale action on the other → toast with
   the fa error copy and the detail re-renders the real state.
