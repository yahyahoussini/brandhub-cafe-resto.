// @ts-check
import { t } from "../i18n/index.js";
import { Amount } from "./Amount.jsx";
import { cx } from "./cx.js";
import { Pill } from "./Pill.jsx";

/**
 * A product tile on the till and the waiter phone: at least 96 × 96 px (D12), name and price; selected = brand-soft
 * background and a 3 px border on the start side; out of stock shows the "Rupture" pill and cannot be tapped
 * (docs/07 §5). A product without a price (template not filled in yet) says so.
 * @param {{
 *   name: string,
 *   priceCentimes: number | null,
 *   selected?: boolean,
 *   outOfStock?: boolean,
 *   disabled?: boolean,
 *   onClick?: (e: MouseEvent) => void,
 *   class?: string,
 * }} props
 */
export function Tile({
  name,
  priceCentimes,
  selected = false,
  outOfStock = false,
  disabled = false,
  onClick,
  class: className,
}) {
  const inactive = disabled || outOfStock;
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-disabled={inactive || undefined}
      onClick={inactive ? undefined : onClick}
      class={cx(
        "flex min-h-tile min-w-tile flex-col items-start justify-between gap-2 rounded-sm border-2 p-3 text-start",
        "transition-colors duration-(--bh-motion-fast) active:translate-y-px",
        selected ? "border-brand border-s-[3px] bg-brand-soft" : "border-line bg-surface-2",
        inactive && "cursor-not-allowed active:translate-y-0",
        outOfStock && "bg-surface",
        className,
      )}
    >
      <span class={cx("line-clamp-2 text-tile font-medium", inactive ? "text-text-2" : "text-text")}>{name}</span>
      <span class="flex w-full flex-wrap items-end justify-between gap-1">
        {priceCentimes === null ? (
          <span class="text-body text-text-2">{t("tile.no_price")}</span>
        ) : (
          <Amount centimes={priceCentimes} class={cx("text-tile", inactive ? "text-text-2" : "text-text")} />
        )}
        {outOfStock && <Pill tone="danger">{t("term.out_of_stock")}</Pill>}
      </span>
    </button>
  );
}
