# 14 · Your tasks — what only you can do, and by when

| # | Task | Needed by | Where it goes | Time |
|---|---|---|---|---|
| 1 | Write down Gate 1: the result of the 18 Sep interviews, who pilot 1 is, what hardware and till they use today | prompt 00 | `docs/STATUS.md → Inputs` | 20 min |
| 2 | Say whether any code exists from the 5 Sep runbook (the new pack starts from an empty repository) | prompt 00 | answer Claude Code | 2 min |
| 3 | Create the GitHub repository `brandhub-cafe-resto` (private) | prompt 01 | GitHub | 5 min |
| 4 | Switch Cloudflare to Workers Paid ($5/month) | prompt 04 | Cloudflare dashboard | 5 min |
| 5 | Run `node tools/admin.mjs keys:generate` and paste the public keys as secrets | prompt 07 | your computer, Wrangler | 15 min |
| 6 | Buy or borrow the reference kit for testing (tablet, 80 mm printer USB or Ethernet, drawer, mini-PC if waiters) | prompt 09 (12 Oct) | your desk | 1–2 h |
| 7 | Pilot 1's menu with prices, legal identity (ICE, IF, RC, patente, CNSS) and the VAT answer from their accountant | prompt 11 (26 Oct) | onboarding of the pilot tenant | 1 h |
| 8 | Meta Business verification and a WhatsApp Business number for reports; submit the template | prompt 18 (9 Nov) | Meta Business Suite | 1 h + waiting |
| 9 | Review the Darija text of the evening report (`data/evening-report.json`) | prompt 18 | the file | 15 min |
| 10 | CGU, DPA and privacy texts reviewed by a lawyer (French and Arabic) | prompt 20 (27 Nov) | `apps/*/web/legal/` | lawyer |
| 11 | Your support WhatsApp number and hours | prompt 20 | settings of the product | 5 min |
| 12 | Pilot agreement signed; pilot visit booked (docs/13) | 29 Nov | paper | 30 min |
| 13 | The legal entity that invoices clients; your invoice template with ICE and RIB | before 1 Feb 2027 | your accounting | — |
| 14 | CNDP: your own filings as BrandHub, and the templates for clients (lawyer) | before 1 Feb 2027 | CNDP site | — |
| 15 | OMPIC check of "BrandHub" (classes 9, 35, 42) | before public launch | OMPIC | 1 h |
| 16 | Decide the prices to keep, the free entry app, the loss-review price | Gate 2, 15 Jan 2027 | `DECISIONS.md` D7, D9 | 1 h |
| 17 | Resto pilot: choose the restaurant, collect its menu and recipes (quantities per dish) | prompt 27 (25 Jan 2027) | onboarding of the Resto pilot | 2–3 h |
| 18 | Ask Glovo for Partner API access if a Resto client needs it: the approval, staging credentials and store ids, the API documentation they send, and one payout statement from the client's Glovo portal | before prompt 43 | Glovo account manager | 4–8 weeks (vendor report) |
| 19 | Code-signing certificate for the Station installer (optional, removes the Windows warning) | when you want | certificate seller | — |
| 20 | Lawyer: the oral consent text read on the phone, what an online order page must show (Law 31-08, distance selling), the booking and deposit policy texts | prompt 37 (13 Apr 2027) | `docs/11-compliance.md §11` | lawyer |
| 21 | Accountant: VAT for takeaway, delivery and the delivery fee; VAT when a deposit is received and when it is kept after a no-show | prompt 37 | settings `taxes.byMode`, `deposits.*` | 30 min |
| 22 | Create a Cloudflare Turnstile widget for `resto.brandhub.ma` (free); put the secret with `wrangler secret put` | prompt 38 | Cloudflare dashboard | 10 min |
| 23 | Check Meta's opt-in rules for reminders sent from BrandHub's WhatsApp number to a client's customers (Kredi); if not allowed, reminders go by click-to-chat from the client's phone | prompt 22 (Dec 2026) | `DECISIONS.md` D35 | 30 min |
| 24 | Access to a Hikvision NVR with POS support (a client's or borrowed) for the camera test | prompt 42 (Jul 2027) | the test venue | 1 h |
| 25 | A Sunmi or iMin till, only if prompt 09 recorded a printing failure on it and a client needs it | prompt 45 | your desk | — |
| 26 | Check whether the DGI has published the e-invoicing decree and technical specifications | prompt 46, and when a client enters its phase | DGI site, the client's accountant | 30 min |
| 27 | Resto pilot: agreement signed (FR/AR) and the Resto versions of the CGU, DPA and privacy texts if they differ | prompt 36 (2 Apr 2027) | paper, `apps/resto/web/legal/` | lawyer |
