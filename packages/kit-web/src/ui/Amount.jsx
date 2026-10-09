// @ts-check
import { formatAmount } from "../i18n/index.js";
import { cx } from "./cx.js";

/**
 * An amount in centimes, in DM Serif Display with tabular figures, kept left to right inside Arabic text (docs/07 §7).
 * The kit formats it; UI code never computes money (CLAUDE.md).
 * @param {{ centimes: number, class?: string }} props
 */
export function Amount({ centimes, class: className }) {
  return (
    <bdi dir="ltr" class={cx("amount", className)}>
      {formatAmount(centimes)}
    </bdi>
  );
}
