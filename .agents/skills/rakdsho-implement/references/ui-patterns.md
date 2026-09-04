# UI Patterns — Commerce App + WhatsApp Negotiation

The benchmark: a modern commerce app (Digikala/Shein-grade product surfaces) fused with
WhatsApp-style negotiation. The anti-benchmark: a classifieds/directory website (Divar-style
link lists, dense text rows, desktop tables on mobile). Every screen should feel like an _app_,
not a webpage.

## Color palette (minimal modern — set once, never per-screen)

Configure in `apps/web/src/styles/globals.css` (Tailwind v4 + shadcn tokens already live there):

- **Brand/primary**: deep teal (`oklch(≈0.55 0.11 180)`, ~`#0f766e`). Used for CTAs, active tabs,
  own chat bubbles, links. This is the ONLY saturated brand color.
- **Neutrals**: zinc scale. Surfaces white / `zinc-50`; borders `zinc-200`; secondary text
  `zinc-500`; primary text `zinc-900`.
- **Semantic only beyond that**: emerald-600 = verified/success/online, amber-500 = ending
  soon/warnings, red-600 = danger/errors. No other color families. No gradients. No per-feature
  accent colors.
- Depth via borders and spacing (`rounded-xl` cards, `rounded-2xl` sheets, `shadow-sm` max —
  prefer a hairline border over a shadow).
- One accent per view: a screen shows either the primary CTA or a semantic state prominently,
  never a rainbow.

## Mobile-first layout system

- Design at 360px first; desktop is a responsive upgrade (max-width container, multi-column
  grids), never a separate design.
- `(app)` shell: bottom tab bar (56–64px, safe-area inset, active = primary color + filled
  icon); desktop converts to a sidebar.
- Sticky bottom action bar on lot detail and deal detail: primary CTA «گفتگو با فروشنده» /
  «پیشنهاد قیمت» / state-advance button, 52px tall, full-width, thumb-reachable.
- Sheets over pages for secondary flows on mobile: filters (MKT-008), offer form (OFR-004),
  share, report. Bottom sheet slides up, `rounded-t-2xl`, drag handle, focus-trapped, esc/close.
- Lists: 2-column card grid on mobile for lots; 1-column list only for conversations/deals.
- Skeletons matching final layout while loading; empty states with one illustration/icon + one
  CTA («اولین لات خود را بسازید»); error states with retry — never blank screens.
- Touch targets ≥ 44×44px; icon-only buttons get `aria-label`; primary navigation works
  one-handed.
- FAB (bottom-start, above tab bar) for «افزودن لات» on seller surfaces.

## Commerce patterns (marketplace surfaces)

- **Image-first lot cards** (MKT-005): aspect-square cover with lazy thumb variant, title 2-line
  clamp, price hierarchy — total price bold + «قیمت واحد ~۲۲٬۵۰۰ تومان» muted below, quantity
  chip («۸۰۰ عدد»), condition chip, city + verified badge row, relative time muted. Card = one
  link; heart button sits outside the link.
- **Price display**: always via `formatToman()` (fa digits + «تومان»); large prices render
  «۱۸۰ میلیون تومان» style compaction on cards, full digits on detail.
- **Trust visible**: verified badge component (emerald, tooltip), seller metrics strip on
  profiles, «تأییدشده» filter chip.
- **Urgency sparingly**: amber «۲ روز مانده» chip for ending-soon lots only — countdown-style,
  never blinking/red.
- **Lot detail**: full-bleed swipeable gallery (images + videos with posters) at top, sticky
  action bar at bottom, spec block as labeled rows, seller summary card with metrics + link.

## WhatsApp-style chat (CHT surfaces)

This is a negotiation tool, not a support widget — copy WhatsApp's mechanics:

- Pinned lot-context header: cover thumb + title + price + status chip, «مشاهده لات» link —
  always visible so users never forget what they're negotiating.
- Bubbles: own = primary background/white text, end-aligned; counterpart = `zinc-100`,
  start-aligned; `max-w-[80%]`, `rounded-2xl` with a small tail radius on the sender side.
  Timestamps + ticks inline-muted inside bubbles: ✓ delivered (server ack), ✓✓ read (primary
  color when read).
- Day separators as centered gray pills (Jalali via `formatJalali`).
- Sticky composer: input + attachment button + send; send disabled when empty; auto-grow
  textarea. Quick-action chips row above composer before the first message («قیمت بپرس»,
  «عکس بیشتری بفرست», «ویدیو بفرست», «پیشنهاد قیمت», «هماهنگی بازدید»).
- Typing indicator: three animated dots in counterpart bubble space.
- Media messages: image bubbles tap-to-fullscreen (swipe gallery), video bubbles poster +
  play overlay; pending uploads show progress % inside the bubble with cancel/retry.
- Optimistic sends: temp bubble immediately, reconcile on ack/echo, failed bubble gets red
  retry tap.
- Conversation list: avatar + name + verified, last message preview, unread badge (primary
  pill with count), lot thumb on the opposite side, relative time.

## RTL & Persian

- `dir="rtl"` is the default state; use logical CSS only (`ms-`/`me-`, `ps-`/`pe-`,
  `text-start`/`text-end`, `flex-row` flips naturally). Never `left:`/`right:` in new code.
- All user-facing copy in Persian, concise commerce tone; numbers via `formatFaDigits`, dates
  via `formatJalali`, money via `formatToman` (`apps/web/src/lib/format.ts`).
- Mirror directional icons (back arrow, send) for RTL; non-directional icons unchanged.

## Component sourcing

- shadcn/ui primitives (`apps/web/src/components/ui/`) + lucide-react icons ONLY. No new UI/icon
  libraries, no CSS-in-JS, no animation libraries — Tailwind utilities + `tw-animate-css`
  already present. Charts (ANL) use inline SVG.
- App-level shared components go in `apps/web/src/components/`; feature-scoped ones in
  `features/<f>/components/`.
