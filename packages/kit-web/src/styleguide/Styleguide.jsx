// @ts-check
import { useState } from "preact/hooks";
import { digits, locale, setDigits, setLocale, t } from "../i18n/index.js";
import {
  Amount,
  ApprovalDialog,
  Button,
  EmptyState,
  ErrorBanner,
  Input,
  Keypad,
  Pill,
  PinPad,
  Sheet,
  Stepper,
  SyncBadge,
  Table,
  Tile,
  Toast,
  cx,
  syncState,
} from "../ui/index.js";
import { DEMO_BANKS, DEMO_RECEIPT_NO, DEMO_REVENUE, demoProducts } from "./demo-data.js";

/** @typedef {"light" | "dark"} Theme */

const PRODUCT_NAMES = { cafe: "BrandHub Café", resto: "BrandHub Resto" };

/** Swatches: literal class names so Tailwind generates them. */
const SWATCHES = [
  ["--bh-brand", "bg-brand"],
  ["--bh-brand-ink", "bg-brand-ink"],
  ["--bh-brand-soft", "bg-brand-soft"],
  ["--bh-accent", "bg-accent"],
  ["--bh-black", "bg-black"],
  ["--bh-bg", "bg-bg"],
  ["--bh-surface", "bg-surface"],
  ["--bh-surface-2", "bg-surface-2"],
  ["--bh-line", "bg-line"],
  ["--bh-mid", "bg-mid"],
  ["--bh-text", "bg-text"],
  ["--bh-text-2", "bg-text-2"],
  ["--bh-text-3", "bg-text-3"],
  ["--bh-ok", "bg-ok"],
  ["--bh-ok-soft", "bg-ok-soft"],
  ["--bh-warn", "bg-warn"],
  ["--bh-warn-soft", "bg-warn-soft"],
  ["--bh-danger", "bg-danger"],
  ["--bh-danger-soft", "bg-danger-soft"],
];

/** @param {Theme} theme */
export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
}

/**
 * @param {{ title: string, children: import("preact").ComponentChildren }} props
 */
function Section({ title, children }) {
  return (
    <section class="flex flex-col gap-4 border-t-2 border-line pt-6">
      <h2 class="font-display text-title text-text">{title}</h2>
      <div class="flex flex-wrap items-start gap-6">{children}</div>
    </section>
  );
}

/**
 * @param {{ state: string, class?: string, children: import("preact").ComponentChildren }} props
 */
function State({ state, class: className, children }) {
  return (
    <figure class={cx("m-0 flex flex-col items-start gap-2", className)}>
      <figcaption class="label text-text-2">{t(`styleguide.states.${state}`)}</figcaption>
      {children}
    </figure>
  );
}

/**
 * @template {string} V
 * @param {{ label: string, value: V, options: { value: V, label: string, lang?: string }[], onChange: (v: V) => void }} props
 */
function Choice({ label, value, options, onChange }) {
  return (
    <div role="radiogroup" aria-label={label} class="flex items-center gap-2">
      <span class="label text-text-2">{label}</span>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          lang={o.lang}
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          class={cx(
            "min-h-target rounded-sm border-2 px-3 text-body",
            value === o.value ? "border-brand bg-brand-soft text-text" : "border-line bg-surface-2 text-text",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The dev-only style guide: every component of the UI kit in every state of docs/06 §8, in French and Arabic, light
 * and dark (prompt 02). Mounted by `/styleguide` in each web app's Vite dev server; never built into the apps.
 * @param {{ product: "cafe" | "resto", theme: Theme, onTheme: (t: Theme) => void }} props
 */
export function Styleguide({ product, theme, onTheme }) {
  const lang = locale.value;
  const name = /** @param {{ fr: string, ar: string }} n */ (n) => (lang === "ar" ? n.ar : n.fr);
  const { priced, unpriced } = demoProducts(product);
  const [selected, setSelected] = useState(0);
  const [qty, setQty] = useState(2);
  const [entry, setEntry] = useState("5000");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [toast, setToast] = useState(/** @type {string | null} */ (null));
  const [approval, setApproval] = useState(false);
  const now = Date.UTC(2026, 10, 30, 9, 0);

  /** @param {import("../ui/Keypad.jsx").KeypadKey} k */
  const onKey = (k) => setEntry((e) => (k === "back" ? e.slice(0, -1) : (e + k).replace(/^0+/, "").slice(0, 7)));

  return (
    <div class="min-h-screen bg-bg text-text">
      <header class="flex flex-wrap items-center gap-x-8 gap-y-3 border-b-2 border-line bg-bg px-6 py-4">
        <p dir="ltr" class="font-display text-title text-text">
          Brand<span class="text-brand">HUB</span>
        </p>
        <p class="text-till text-text-2">{PRODUCT_NAMES[product]}</p>
        <h1 class="text-till font-medium text-text">{t("styleguide.title")}</h1>
        <div class="flex flex-wrap items-center gap-4 sm:ms-auto">
          <Choice
            label={t("styleguide.language")}
            value={lang}
            onChange={setLocale}
            options={[
              { value: "fr", label: t("styleguide.lang_fr"), lang: "fr" },
              { value: "ar", label: t("styleguide.lang_ar"), lang: "ar" },
            ]}
          />
          <Choice
            label={t("styleguide.theme")}
            value={theme}
            onChange={onTheme}
            options={[
              { value: "light", label: t("styleguide.theme_light") },
              { value: "dark", label: t("styleguide.theme_dark") },
            ]}
          />
          <Choice
            label={t("styleguide.digits")}
            value={digits.value}
            onChange={setDigits}
            options={[
              { value: "latn", label: t("styleguide.digits_latn") },
              { value: "arab", label: t("styleguide.digits_arab") },
            ]}
          />
        </div>
      </header>

      <main class="mx-auto flex max-w-[80rem] flex-col gap-10 px-6 py-8">
        <p class="text-body text-text-2">{t("styleguide.dev_only")}</p>

        <Section title={t("styleguide.sections.colours")}>
          {SWATCHES.map(([token, cls]) => (
            <div key={token} class="flex w-36 flex-col gap-1.5">
              <span class={cx("h-12 w-full rounded-sm border-2 border-line", cls)} />
              <code dir="ltr" class="self-start font-mono text-mono text-text-2">
                {token}
              </code>
            </div>
          ))}
        </Section>

        <Section title={t("styleguide.sections.type")}>
          <div class="flex flex-col gap-3">
            <p class="font-display text-display">{t("styleguide.type_samples.display")}</p>
            <p class="font-display text-title">{t("styleguide.type_samples.title")}</p>
            <p>
              <Amount centimes={DEMO_REVENUE} class="text-amount" />
            </p>
            <p class="label text-text-2">{t("styleguide.type_samples.label")}</p>
            <p class="max-w-reading text-body">{t("styleguide.type_samples.body")}</p>
            <p class="text-till">{t("styleguide.type_samples.body")}</p>
            <p dir="ltr" class="self-start font-mono text-mono text-text-2">
              {DEMO_RECEIPT_NO}
            </p>
          </div>
        </Section>

        <Section title={t("styleguide.sections.button")}>
          <State state="default">
            <div class="flex flex-wrap gap-3">
              <Button>{t("term.pay")}</Button>
              <Button variant="secondary">{t("term.send_bar")}</Button>
              <Button variant="danger">{t("term.void")}</Button>
            </div>
          </State>
          <State state="pressed">
            <div class="flex flex-wrap gap-3">
              <Button state="pressed">{t("term.pay")}</Button>
              <Button variant="secondary" state="pressed">
                {t("term.send_bar")}
              </Button>
            </div>
          </State>
          <State state="disabled">
            <Button disabled>{t("term.pay")}</Button>
          </State>
          <State state="loading">
            <Button loading>{t("term.pay")}</Button>
          </State>
          <State state="office">
            <div class="flex flex-wrap gap-3">
              <Button size="office">{t("term.close_till")}</Button>
              <Button size="office" variant="secondary">
                {t("term.reprint")}
              </Button>
            </div>
          </State>
        </Section>

        <Section title={t("styleguide.sections.tile")}>
          <p class="w-full text-body text-text-2">{t("styleguide.demo_prices")}</p>
          <div class="grid w-full grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-3">
            {priced.map((p, i) => (
              <Tile
                key={p.name.fr}
                name={name(p.name)}
                priceCentimes={p.priceCentimes}
                selected={selected === i}
                outOfStock={i === priced.length - 1}
                onClick={() => setSelected(i)}
              />
            ))}
            <Tile name={name(unpriced.name)} priceCentimes={null} />
          </div>
          <State state="selected">
            <Tile name={name(priced[0].name)} priceCentimes={priced[0].priceCentimes} selected />
          </State>
          <State state="disabled">
            <Tile name={name(priced[1].name)} priceCentimes={priced[1].priceCentimes} disabled />
          </State>
        </Section>

        <Section title={t("styleguide.sections.stepper")}>
          <State state="default">
            <Stepper label={name(priced[0].name)} value={qty} onChange={setQty} />
          </State>
          <State state="empty">
            <Stepper label={name(priced[0].name)} value={0} />
          </State>
          <State state="disabled">
            <Stepper label={name(priced[0].name)} value={1} disabled />
          </State>
        </Section>

        <Section title={t("styleguide.sections.keypad")}>
          <State state="default">
            <div class="flex flex-col gap-3">
              <p class="label text-text-2">{t("styleguide.input_label")}</p>
              <Amount centimes={Number(entry || "0")} class="text-amount" />
              <Keypad onKey={onKey} />
            </div>
          </State>
          <State state="disabled">
            <Keypad onKey={() => {}} disabled />
          </State>
        </Section>

        <Section title={t("styleguide.sections.pinpad")}>
          <State state="default">
            <PinPad onComplete={() => setToast(t("styleguide.toast_printed"))} initialCount={2} />
          </State>
          <State state="error">
            <PinPad onComplete={() => {}} error={t("approval.wrong_pin")} />
          </State>
          <State state="loading">
            <PinPad onComplete={() => {}} initialCount={4} loading />
          </State>
        </Section>

        <Section title={t("styleguide.sections.sheet")}>
          <State state="default" class="w-full max-w-[36rem]">
            <Sheet
              open
              inline
              onClose={() => {}}
              title={t("styleguide.sheet_title")}
              footer={<Button>{t("action.validate")}</Button>}
            >
              <p>{t("styleguide.sheet_body")}</p>
            </Sheet>
          </State>
          <Button variant="secondary" onClick={() => setSheetOpen(true)}>
            {t("styleguide.sheet_title")}
          </Button>
          <Sheet
            open={sheetOpen}
            onClose={() => setSheetOpen(false)}
            title={t("styleguide.sheet_title")}
            footer={<Button onClick={() => setSheetOpen(false)}>{t("action.validate")}</Button>}
          >
            <p>{t("styleguide.sheet_body")}</p>
          </Sheet>
        </Section>

        <Section title={t("styleguide.sections.toast")}>
          <State state="success">
            <Toast inline message={t("styleguide.toast_printed")} />
          </State>
          <Button variant="secondary" onClick={() => setToast(t("styleguide.toast_printed"))}>
            {t("term.reprint")}
          </Button>
          {toast && <Toast message={toast} onDone={() => setToast(null)} />}
        </Section>

        <Section title={t("styleguide.sections.sync")}>
          <State state="success">
            <SyncBadge sync={syncState({ pending: 0, lastContactAt: now - 30_000, now })} />
          </State>
          <State state="loading">
            <SyncBadge sync={syncState({ pending: 3, lastContactAt: now - 120_000, now })} />
          </State>
          <State state="offline">
            <SyncBadge sync={syncState({ pending: 12, lastContactAt: now - 12 * 60_000, now })} />
          </State>
        </Section>

        <Section title={t("styleguide.sections.input")}>
          <State state="default" class="w-72">
            <Input
              label={t("styleguide.input_label")}
              value=""
              hint={t("styleguide.input_hint")}
              inputMode="decimal"
              ltr
            />
          </State>
          <State state="success" class="w-72">
            <Input label={t("styleguide.input_label")} value="50,00" inputMode="decimal" ltr />
          </State>
          <State state="error" class="w-72">
            <Input
              label={t("styleguide.input_label")}
              value="50.0.0"
              error={t("styleguide.input_error")}
              inputMode="decimal"
              ltr
            />
          </State>
          <State state="disabled" class="w-72">
            <Input label={t("styleguide.input_label")} value="50,00" disabled ltr />
          </State>
          <State state="office" class="w-72">
            <Input label={t("styleguide.input_label")} value="" size="office" ltr />
          </State>
        </Section>

        <Section title={t("styleguide.sections.pill")}>
          <Pill tone="brand">{t("styleguide.kitchen.new")}</Pill>
          <Pill tone="warn">{t("styleguide.kitchen.preparing")}</Pill>
          <Pill tone="ok">{t("styleguide.kitchen.ready")}</Pill>
          <Pill tone="danger">{t("styleguide.kitchen.late")}</Pill>
          <Pill tone="warn">{t("term.low_stock")}</Pill>
          <Pill tone="danger">{t("term.out_of_stock")}</Pill>
          <Pill>{t("term.shift")}</Pill>
        </Section>

        <Section title={t("styleguide.sections.table")}>
          <State state="default" class="w-full max-w-[44rem]">
            <Table
              caption={t("styleguide.table_caption")}
              rowKey={(r) => r.id}
              rows={DEMO_BANKS}
              columns={[
                { key: "staff", label: t("styleguide.col_staff"), render: (r) => t(r.staffKey) },
                {
                  key: "expected",
                  label: t("styleguide.col_expected"),
                  align: "end",
                  render: (r) => <Amount centimes={r.expected} />,
                },
                {
                  key: "counted",
                  label: t("styleguide.col_counted"),
                  align: "end",
                  render: (r) => <Amount centimes={r.counted} />,
                },
                {
                  key: "gap",
                  label: t("term.gap"),
                  align: "end",
                  render: (r) => <Amount centimes={r.gap} class={r.gap === 0 ? "text-text" : "text-danger"} />,
                },
              ]}
            />
          </State>
          <State state="empty" class="w-full max-w-[44rem]">
            <Table
              rowKey={(r) => r.id}
              rows={/** @type {typeof DEMO_BANKS} */ ([])}
              columns={[
                { key: "staff", label: t("styleguide.col_staff") },
                { key: "gap", label: t("term.gap"), align: "end" },
              ]}
              empty={<EmptyState title={t("empty.sales_today")} />}
            />
          </State>
        </Section>

        <Section title={t("styleguide.sections.approval")}>
          <State state="default">
            <ApprovalDialog open inline onApprove={() => {}} onCancel={() => {}} />
          </State>
          <State state="selected">
            <ApprovalDialog open inline initialReason="customer_left" onApprove={() => {}} onCancel={() => {}} />
          </State>
          <State state="error">
            <ApprovalDialog
              open
              inline
              initialReason="comped"
              error={t("approval.wrong_pin")}
              onApprove={() => {}}
              onCancel={() => {}}
            />
          </State>
          <Button variant="secondary" onClick={() => setApproval(true)}>
            {t("term.approval")}
          </Button>
          <ApprovalDialog open={approval} onApprove={() => setApproval(false)} onCancel={() => setApproval(false)} />
        </Section>

        <Section title={t("styleguide.sections.empty")}>
          <State state="empty" class="w-full max-w-[36rem] border-2 border-line">
            <EmptyState
              title={t("empty.sales_today")}
              body={t("empty.sales_today_hint")}
              action={<Button size="office">{t("term.till")}</Button>}
            />
          </State>
        </Section>

        <Section title={t("styleguide.sections.error_banner")}>
          <State state="error" class="w-full max-w-[44rem]">
            <ErrorBanner message={t("error.printer_offline")} action={t("error.printer_offline_action")}>
              <Button size="office" variant="secondary">
                {t("action.retry")}
              </Button>
            </ErrorBanner>
          </State>
        </Section>
      </main>
    </div>
  );
}
