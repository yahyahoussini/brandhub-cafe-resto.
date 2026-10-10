# @brandhub/tools

Command-line tools: admin.mjs (signed control API calls), hardware-test/, build and gate scripts.

## Staging (prompt 04)
`node tools/scripts/staging.mjs` prints, and runs nothing, the commands of docs/12 §2 for both products (Café first):
create the registry (D1) and the files bucket (R2) in the EU jurisdiction, apply the registry migrations, build the PWA
(`node tools/scripts/build-web.mjs <product>`), deploy the Worker with `--env staging`, then `curl` `/api/health` and
check each resource's jurisdiction. Names come from `apps/<product>/worker/wrangler.jsonc` (env.staging). Secrets are
named only: `wrangler secret put` asks for each value. `node tools/scripts/staging.mjs cafe` prints one product.
