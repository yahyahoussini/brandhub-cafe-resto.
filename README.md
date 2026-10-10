# BrandHub Café + BrandHub Resto — build pack for Claude Code

This folder is the starting repository of two products:

- **BrandHub Café** on `cafe.brandhub.ma`: the till, the waiter phones and the owner's evening report for cafés.
- **BrandHub Resto** on `resto.brandhub.ma`: the dining room, the kitchen screens and the food cost for restaurants.

CLYO Systems (the French till resold in Morocco) is the reference we studied and beat; its name never appears in the
products. The plan behind this pack, with the market scan and the five-expert brainstorm, is the doc
"BrandHub Café + BrandHub Resto — Brainstorm & Build Plan".

## What is inside
| File or folder | What it is | Who edits it |
|---|---|---|
| `DECISIONS.md` | 50 decisions (products, UX, architecture, devices, security, operations) with reasons | you, to change a decision |
| `CLAUDE.md` | the rules Claude Code follows on every prompt | rarely |
| `prompts/00…46` | the build, one prompt at a time (index: `prompts/README.md`) | nobody (run them) |
| `packages/kit/` | the business rules already written and tested: money and VAT, ids, orders, cash banks and dose counter, receipt numbers, printer bytes, time zone, licence, signed control calls, chained journal (75 passing tests) | nobody |
| `data/` | menu templates (café, restaurant), permissions, plans, modules, printer profiles, tax presets, glossary | **you** (prices, tax rates with your accountant) |
| `docs/01…14` | specifications: products, architecture, data, sync, devices, UX, design, security, control API, reports, compliance, deploy, pilot, your tasks | read |
| `docs/research/` | the market scan, the verified facts and a digest of the 4–5 Sep plan, with sources | read |

## Before you start
1. Install **Node 22.13 or newer**, **Git** and **Claude Code**. On the Windows PC that will build the Station, also Git and Node.
2. Unzip this folder, open a terminal inside it, run `npm test` (the kit's 75 tests must pass), then `claude`.
3. Create a private GitHub repository `brandhub-cafe-resto` (prompt 01 connects it).
4. The brandhub.ma pack should be running first: its coming-soon Worker holds `cafe.brandhub.ma` and `resto.brandhub.ma`
   until prompt 20 (Café) and prompt 36 (Resto) take them over.

## How to run the prompts
1. Paste `prompts/00-orientation.md` into Claude Code. Read the answer.
2. Run the next prompt only when the previous one's acceptance checks pass. **One prompt at a time.**
3. When Claude Code says a fact is missing, fill it (see `docs/14-human-tasks.md`), then continue.
4. To change a decision, edit `DECISIONS.md`, then say "Apply the change to Dnn".

## The sequence
| Phase | Prompts | Dates | Result |
|---|---|---|---|
| Kit | 00–10 | 5–23 Oct 2026 | repository, design system, rules, cloud store, accounts, sync, control API, Station, printing, quality gates |
| Café V1 | 11–18 | 26 Oct–20 Nov | onboarding, till, waiter banking, shifts, dose counter, stock, back office, evening report |
| Café release | 19–20 | 23–27 Nov | hardening and release; pilot 1 live on Mon 30 Nov |
| Café V1.1 | 21–26 | 1 Dec 2026–22 Jan 2027 | Borsat, Kredi, compliance pack, Mode Ramadan, coût de la tasse, stamp card |
| Resto V1 | 27–36 | 25 Jan–2 Apr 2027 | Station-based restaurant: floor plan, handhelds, kitchen screens, recipes, stock, staff; pilot 12 Apr |
| Resto V1.1 | 37–41 | Apr–Jun 2027 | delivery, direct orders, reservations, order book, menu engineering |
| V2 | 42–46 | from Jul 2027 | camera link, delivery-app inbox, multi-site, Android shell, e-invoicing export |

At one prompt every one or two days, with your inputs ready, the dates hold. Features freeze on 20 Nov whatever is missing.

## What only you can provide (details: `docs/14-human-tasks.md`)
- **Before prompt 00:** the result of the 18 Sep interviews (Gate 1), who pilot 1 is, and whether any code already exists.
- **Before prompt 04:** Cloudflare Workers Paid ($5/month) on the account that runs brandhub.ma.
- **Before prompt 09:** the pilot's hardware (tablet, printer, drawer, router), or the reference kit bought for testing.
- **Before prompt 11:** pilot 1's menu with prices, legal identity (ICE, IF, RC, patente, CNSS), VAT rates confirmed by their accountant.
- **Before prompt 18:** a WhatsApp Business number and Meta Business verification; the evening-report template submitted (approval can take days; the report goes by email meanwhile).
- **Before prompt 20:** CGU, DPA and privacy texts reviewed by a lawyer; your support WhatsApp number.
- **Before the first invoice (1 Feb 2027):** the legal entity that invoices clients; CNDP formalities (`docs/11-compliance.md §8`).

## Running cost
Cloudflare Workers Paid, $5 a month for both products at pilot scale; WhatsApp about 7 MAD per owner per month from
1 Oct 2026 (reseller figure); a code-signing certificate for the Station installer when you want to remove the Windows
warning (price to check at purchase). Everything else in the stack is free at this size.

## What this pack does not do
It does not build admin.brandhub.ma (the signed `tools/admin.mjs` covers it until then), does not sell or support
hardware, does not connect to card terminals (no public API found in September 2026), does not invent prices, legal mentions or claims,
and does not claim any tax certification.
