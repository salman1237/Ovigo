# Ovigo Frontend — Design System

Source of truth for the visual language introduced in Phase 6 (see
`OVIGO_TECHNICAL_DOCUMENT.md` §8 for the full redesign plan and the competitive
research — ShareTrip/GoZayaan palette and font extraction — behind these
choices). Tokens live in `src/app/globals.css`; read this file before adding a
new color, font, or shadow anywhere rather than picking one ad hoc.

## Color

Two color families, deliberately unequal in weight:

- **`primary` (blue, `primary-50`→`primary-950`)** — the trust/signature color.
  Used everywhere: nav, primary buttons, links, active states. This already
  existed before Phase 6 and is unchanged.
- **`accent` (amber, `accent-50`→`accent-950`)** — new in Phase 6. Reserved for
  energy/urgency/deals: "3 seats left," discount tags, star ratings, a
  homepage promo highlight. Keep it to a minority of any given screen (rule of
  thumb: if more than ~10% of a page is amber, it's being overused and starts
  competing with primary instead of accenting it).

Semantic colors (`success`/`warning`/`danger`, Tailwind's `emerald`/`amber`/`red`)
stay separate from `accent` even though `warning` and `accent` are both
amber-family — `warning` means "admin/status caution," `accent` means
"traveler-facing highlight." Don't reuse one for the other's job.

## Typography

- **Body text** — Geist Sans (`font-sans`), unchanged.
- **Headings (`h1`/`h2`/`h3`)** — Plus Jakarta Sans (`font-heading`), applied
  automatically via a bare-tag CSS rule in `globals.css` (not a utility class
  you need to remember to add). If a "heading" is styled as a `<div>` or `<p>`
  instead of a real heading tag, apply `font-heading` explicitly — but prefer
  fixing it to a real `<h1>`/`<h2>`/`<h3>` first, since that's also an
  accessibility/SEO issue, not just a styling one.
- Chosen as a free, geometric-bold alternative to Gilroy (the display face
  GoZayaan uses) — same visual family, no commercial license needed.

## Shadows / depth

- **`shadow-sm`** (Tailwind default) — dense, functional surfaces: admin
  tables, dashboard cards, anything data-heavy where visual weight should stay
  low.
- **`shadow-elevated`** (new token, `Card` component's `variant="elevated"`) —
  a layered, multi-stop shadow for marketing-facing cards (tour/property/
  vehicle listings, homepage sections) — the "tactile/premium" depth
  GoZayaan's cards have that a single flat shadow doesn't produce. Don't use
  it on dense list rows; it's tuned to look right on a handful of cards per
  screen, not a table of fifty.

## Component variants added in Phase 6

- `Card` — new `variant` prop: `"flat"` (default, `shadow-sm`) or
  `"elevated"` (`shadow-elevated`). Existing usages are unaffected (default
  stays flat).
- `Badge` — new `variant="accent"`: bold-filled amber (`bg-accent-500`,
  white text), for deal/urgency/rating badges. Distinct from the existing
  `variant="warning"` (soft amber tint) — see the color section above for why
  they're kept separate despite sharing a hue family.

## What NOT to do

- Don't introduce a third color family without updating this doc and the
  Phase 6 plan first — two is already the deliberate ceiling for this pass.
- Don't apply `font-heading` to body copy, buttons, or badges — it's a
  display face, not a body-text replacement; at small sizes/long strings it
  reads worse than Geist Sans.
- Don't reach for `shadow-elevated` as a general "make it look nicer" shadow
  on every card in the app — it's specifically for marketing-facing,
  low-density surfaces (see above).
