// @ts-check
/**
 * `npm run size:ui`: gzip weight of the UI kit as an app ships it (prompt 02 → docs/STATUS.md; prompt 10 turns these
 * into budgets). Builds every export of `@brandhub/kit-web/ui` and `/i18n` with Vite, once with Preact, signals and
 * Lucide left out (the kit's own code) and once with them (what the till route pays), plus the CSS and the fonts.
 * The CSS covers the utilities the kit and the style guide use, without the inlined fonts.
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { build } from "vite";
import { ROOT } from "./workspaces.mjs";

const appRoot = join(ROOT, "apps/cafe/web");
const work = mkdtempSync(join(tmpdir(), "bh-ui-size-"));
const entry = join(work, "entry.js");
writeFileSync(
  entry,
  [
    `import "${join(appRoot, "src/styles.css")}";`,
    `export * from "${join(ROOT, "packages/kit-web/src/ui/index.js")}";`,
    `export * from "${join(ROOT, "packages/kit-web/src/i18n/index.js")}";`,
    "",
  ].join("\n"),
);

/** @param {string} dir */
function sizes(dir) {
  /** @type {Record<string, { raw: number, gzip: number }>} */
  const out = { js: { raw: 0, gzip: 0 }, css: { raw: 0, gzip: 0 }, woff2: { raw: 0, gzip: 0 } };
  for (const f of readdirSync(dir, { recursive: true })) {
    const p = join(dir, String(f));
    if (!statSync(p).isFile()) continue;
    const ext = String(f).split(".").pop() ?? "";
    if (!(ext in out)) continue;
    let buf = readFileSync(p);
    // Library builds inline assets: measure the fonts from their files, not as base64 inside the CSS.
    if (ext === "css") buf = Buffer.from(buf.toString("utf8").replace(/url\(\s*["']?data:[^)]*\)/g, "url()"));
    out[ext].raw += buf.length;
    out[ext].gzip += gzipSync(buf, { level: 9 }).length;
  }
  return out;
}

/** @param {boolean} withDeps */
async function run(withDeps) {
  const outDir = join(work, withDeps ? "with-deps" : "kit-only");
  const { default: preact } = await import("@preact/preset-vite");
  const { default: tailwindcss } = await import("@tailwindcss/vite");
  await build({
    root: appRoot,
    logLevel: "silent",
    configFile: false,
    plugins: [preact(), tailwindcss()],
    build: {
      outDir,
      emptyOutDir: true,
      assetsInlineLimit: 0,
      lib: { entry, formats: ["es"], fileName: "ui" },
      rolldownOptions: withDeps ? {} : { external: [/^preact/, /^@preact\//, /^lucide-preact/] },
    },
  });
  return sizes(outDir);
}

const fonts = sizes(join(ROOT, "packages/kit-web/fonts")).woff2;
const kb = (/** @type {number} */ n) => `${(n / 1024).toFixed(1)} KB`;
const own = await run(false);
const all = await run(true);
rmSync(work, { recursive: true, force: true });
console.log(`UI kit + i18n JS, own code:            ${kb(own.js.gzip)} gzip (${kb(own.js.raw)} raw)`);
console.log(`UI kit + i18n JS, with Preact, signals, Lucide: ${kb(all.js.gzip)} gzip (${kb(all.js.raw)} raw)`);
console.log(`CSS (tokens, theme, utilities used):   ${kb(all.css.gzip)} gzip (${kb(all.css.raw)} raw)`);
console.log(`Fonts, 8 woff2 files (already compressed): ${kb(fonts.gzip)} gzip (${kb(fonts.raw)} raw)`);
