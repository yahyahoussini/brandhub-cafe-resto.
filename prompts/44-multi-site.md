# Prompt 44 — Multi-site: one client, several restaurants

> Run after prompt 43 (V2). Resto only: a Café tenant keeps one site until a decision says otherwise. A client gets a
> second site when its licence says `limits.sites` ≥ 2 (set by Yahya through the control API).

## Goal
An owner with two to five restaurants runs each one on its own Station and tills, sees them side by side and in total,
publishes one menu with local prices, and moves stock between sites (or from a central kitchen) with every gram
accounted for.

## Read first
`DECISIONS.md` D19, D20, D22, D24, D27, D38, D39 · `docs/03-domain-model.md` (all) · `docs/04-sync-protocol.md §3, §7` ·
`docs/09-control-api.md §2, §5` (limits, `secondSite`) · `docs/10-reports-analytics.md` · `docs/11-compliance.md §1, §2, §6` ·
`packages/kit/src/receipts.js` (prefix rule).

## Do
1. Model: sites `sit_…` inside the tenant's TenantStore (one Durable Object per client, D19), as marks `site.set {name,
   code, address, legal {name, ice, if, rc, patente, cnss}, commune, settings overrides}`. A site can be its own company:
   receipts print the site's legal lines; B2B invoice series and the compliance pack are per legal entity (sites that
   share an ICE share them); the débit-de-boissons rate is per site's commune.
2. Scope: devices, banks, orders, tables, kitchen tickets, stock levels, counts, receipts of goods and clock punches carry
   the site of the device that wrote them (`device.set {siteId}`); catalog, recipes, suppliers, staff profiles and
   tenant settings stay tenant-wide. Update docs/03 with the site column of each projection.
3. Sync: pull and the Station's directory are filtered by site (docs/04 §3): a Station receives its site's events plus the
   tenant-wide marks; push refuses an event whose site differs from the device's (`E_FORBIDDEN_SITE`, added to docs/03
   §9). Each site has its own Station.
4. Receipt prefixes per site: the first site keeps `C1`, `S1`…; others prefix the site code letter (`BC1`, `BS1`, within
   the kit's rule of 1–4 characters); the ledger stays per device.
5. Central menu: the owner edits one menu; per-site availability and prices (`priceBySite`, like `priceByZone`); a site
   manager can "86" a dish at his site but cannot change prices (permission `catalog_edit` per site).
6. Staff: a staff member works at one or several sites; his PIN works on those sites' devices only; roles per site;
   the owner and "group" managers see every site, a site manager only his own (permissions and every report query).
7. Transfers `trf_…`: movements `stock.transfer_sent {transferId, toSiteId, qtyMilli}` at the sending site and
   `stock.transfer_received {transferId, fromSiteId, qtyMilli}` at the receiving one, valued at the latest cost; a list
   of transfers in transit and their gaps (sent − received); a central kitchen is a site with no tills that sends
   prepared items (recipes with yields, prompt 32).
8. Consolidation in `/gestion → Groupe`: revenue, covers, average per cover, food cost %, cash gaps, voids and stock
   gaps per site side by side and in total; the evening report per site (to its manager) and one for the group (to the
   owner).
9. Licence: creating a site checks `limits.sites`; above the limit, « Ajouter un établissement » shows "Contactez
   BrandHub" and records the request, which sets `secondSite: true` in the control report (define it so in docs/10 §6).
10. Capacity: measure the store's size per site-month on the load test and write in STATUS how many years a 5-site
    client stays under the Durable Object limit (10 GB, docs/research/facts §C1); if it is under 8 years, propose an
    archive decision in DECISIONS.md (nothing is deleted without it).

## Constraints
No query crosses tenants; a site manager's session never returns another site's rows (tests on the API, not only the
UI). The first site of an existing client keeps its data, prefixes and receipts unchanged.

## Acceptance checks (run them, paste the output)
1. E2E with `limits.sites: 2`: site B "Maârif" with its own Station and till `BC1`; a sale at each site; each Station
   holds only its site's orders; the group view totals both; site B's manager cannot read site A's banks (API test).
2. A transfer of 5 kg of chicken from A to B received as 4,8 kg: in transit until received; gap 0,2 kg valued at
   the latest cost; levels right at both sites.
3. With `limits.sites: 1`: the second site is refused and the control report shows `secondSite: true`.
4. Receipts at site B print site B's legal lines; a B2B invoice at site B uses its entity's series.
5. `npm run gate`; the storage projection in STATUS.

## Release
Resto V2 is complete with this prompt (camera link, delivery inbox, multi-site): tag `resto-v2.0.0` in the release
window (D46). The delivery inbox stays switched off for a client until its Glovo integration is approved.

## Update docs/STATUS.md
Row 44; the storage projection; the first multi-site client, when there is one; the `resto-v2.0.0` tag and date.

## Commit
`feat(resto): multi-site with per-site scope, central menu, transfers and group reports`
