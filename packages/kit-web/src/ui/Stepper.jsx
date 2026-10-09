// @ts-check
import { Minus, Plus } from "lucide-preact";
import { formatNumber, t } from "../i18n/index.js";
import { cx } from "./cx.js";
import { Icon } from "./Icon.jsx";

const KEY =
  "inline-flex size-target items-center justify-center rounded-sm border-2 border-line bg-surface-2 text-text active:translate-y-px active:bg-brand-soft";

/**
 * A quantity stepper with 48 px targets (docs/07 §5). At the minimum or maximum a button is aria-disabled, not disabled,
 * so keyboard focus stays on it.
 * @param {{
 *   value: number,
 *   onChange?: (value: number) => void,
 *   min?: number,
 *   max?: number,
 *   label: string,
 *   disabled?: boolean,
 *   class?: string,
 * }} props `label` names the quantity for screen readers ("Café noir").
 */
export function Stepper({ value, onChange, min = 0, max = 99, label, disabled = false, class: className }) {
  const canDown = !disabled && value > min;
  const canUp = !disabled && value < max;
  return (
    <div role="group" aria-label={label} class={cx("inline-flex items-center gap-2", className)}>
      <button
        type="button"
        aria-label={t("stepper.decrease")}
        aria-disabled={!canDown || undefined}
        onClick={() => canDown && onChange?.(value - 1)}
        class={cx(
          KEY,
          !canDown && "cursor-not-allowed border-mid text-text-3 active:translate-y-0 active:bg-surface-2",
        )}
      >
        <Icon icon={Minus} />
      </button>
      <output aria-live="polite" class="min-w-target text-center text-till font-medium tabular-nums">
        <bdi dir="ltr">{formatNumber(value)}</bdi>
      </output>
      <button
        type="button"
        aria-label={t("stepper.increase")}
        aria-disabled={!canUp || undefined}
        onClick={() => canUp && onChange?.(value + 1)}
        class={cx(KEY, !canUp && "cursor-not-allowed border-mid text-text-3 active:translate-y-0 active:bg-surface-2")}
      >
        <Icon icon={Plus} />
      </button>
    </div>
  );
}
