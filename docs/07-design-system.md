# 07 · Design system — BrandHUB Product Design System v1

Source: the "BrandHUB Product Design System" of 5 Sep 2026 (tokens and rules copied here). Prompt 02 turns this file into
`packages/kit-web/src/ui/tokens.css` and the Preact components; nothing else defines colours or sizes.

## 1. Identity
Wordmark "BrandHUB" with "HUB" in brand blue; the two-shape mark (`viewBox 0 0 44 44`) for icons and the favicon; mark
alone at ≤ 32 px. Product names in the apps: "BrandHub Café", "BrandHub Resto". Voice: direct, confident, honest; no
"veuillez patienter".

## 2. Colour tokens
| Token | Light | Dark | Use |
|---|---|---|---|
| `--bh-brand` | #1A1BBF | #6C86FF | one primary action per screen, selection |
| `--bh-brand-ink` | #14158F | — | pressed |
| `--bh-brand-soft` | #E8E8FA | #171A3A | selected tile background |
| `--bh-accent` | #3A6BFF | — | large text or dark surfaces only |
| `--bh-black` | #0A0A0A | #0A0A0A | |
| `--bh-bg` | #FFFFFF | #0A0A0A | page |
| `--bh-surface` | #F4F4F4 | #141414 | panels |
| `--bh-surface-2` | #FFFFFF | #1E1E1E | cards, sheets |
| `--bh-line` | #E6E6E6 | #2A2A2A | seams |
| `--bh-mid` | #BFBFBF | — | disabled borders |
| `--bh-text` | #1A1A1A | #F2F2F2 | body |
| `--bh-text-2` | #444444 | #C4C4C4 | secondary |
| `--bh-text-3` | #767676 | #8A8A8A | hints |
| `--bh-ok` / soft | #1F8A4C / #E4F3EA | #4CC479 | success, synced, ready |
| `--bh-warn` / soft | #B86E00 / #FBEFD9 | #F0A63A | pending, preparing, bill requested |
| `--bh-danger` / soft | #C8102E / #FBE3E6 | #FF5A6E | offline > 10 min, late, gaps |
Rules: blue for one thing per screen; never blue text on grey boxes below 16 px; semantic colours never decorate; state
is always text plus colour. Contrast: brand on white 10.7:1; dark brand 5.4:1.

## 3. Type
- Latin: **DM Serif Display** for amounts and titles, **DM Sans** for operations, **DM Mono** for references and timers.
- Arabic: **IBM Plex Sans Arabic** for the interface, **Noto Kufi Arabic 700** for display. Never set Arabic in DM Serif
  Display or DM Sans. Arabic body one step larger (`html[lang="ar"] { font-size: 106.66% }`); Arabic labels use weight 700
  instead of letter-spacing.
- All five families are under the SIL Open Font License; bundle `woff2` subsets with the app (offline, no Google Fonts).
- Scale: display 44/1.05 and 28/1.15 · amount 40/1, tabular figures · label 11, capitals, tracking .2em · body 15/1.6 (16
  on the till) · product tile 16–18 · kitchen line 20 (24 in rush mode) · mono 13.

## 4. Shape, spacing, motion
Radius 2 px (tokens 2/2/4), 0 on tables; 2 px seams; no shadows except the options sheet. 4 px grid; paddings 16/24;
gaps 32/48; gutters 24/40; reading column 860 px. Motion 120–160 ms; kitchen new-ticket flash 2 × 300 ms plus a sound;
`prefers-reduced-motion` respected. No gradients, glass effects, large radii or emoji icons. Icons: Lucide, stroke 1.75,
20/24 px, flipped in right-to-left when they point (`rtl:-scale-x-100`).

## 5. Components (sizes on the till, handhelds and screens)
| Component | Spec |
|---|---|
| Product tile | min 96 × 96 px; name, price; selected = brand-soft background + 3 px border on the start side; "Rupture" pill |
| Primary button | 56 px high on staff screens (40 px in the back office), one per screen |
| Stepper | 48 px targets |
| Keypad / PIN pad | keys 64 × 56 px, digits 22 px |
| Table cell (floor) | 88 px, 4 px state bar on top |
| Input | 48 px on staff screens, 44 px in the back office; label above, never a placeholder as label |
| Toast | black, 4 s |
| Sync badge | pill with icon + text; green/orange/red per D15 |
| Options sheet | bottom sheet, the only element with a shadow |
Surfaces: the till is light (portrait orders use a bottom sheet); kitchen screens are dark, three columns; receipts are
monospace with 8-pt legal text.

## 6. State colours
Kitchen: new = brand, preparing = warning, ready = success, late = danger. Tables: free = none, occupied = brand,
reserved = brand-soft, bill requested = warning, cleaning = muted. Banks: balanced = success, gap within threshold =
warning, gap above threshold = danger.

## 7. Right to left
Logical properties only (lint-enforced); numbers and amounts keep western digits and left-to-right order inside
right-to-left text (`<bdi>` or `dir="ltr"` on the amount); phone numbers and receipt numbers are always `dir="ltr"`; every
screen is screenshotted in Arabic in its prompt.
