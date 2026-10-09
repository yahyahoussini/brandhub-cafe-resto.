// @ts-check
import { cx } from "./cx.js";
import { Icon } from "./Icon.jsx";

/**
 * Tones: the state colour is on the border and the icon; the text stays in the body colour on the soft fill, so it
 * reads at 4.5:1 (docs/07 §2 "state is always text plus colour"; npm run contrast).
 */
const TONES = {
  neutral: { box: "bg-surface border-line text-text", icon: "text-text-2" },
  brand: { box: "bg-brand-soft border-brand text-text", icon: "text-brand" },
  ok: { box: "bg-ok-soft border-ok text-text", icon: "text-ok" },
  warn: { box: "bg-warn-soft border-warn text-text", icon: "text-warn" },
  danger: { box: "bg-danger-soft border-danger text-text", icon: "text-danger" },
};

/**
 * A short state label: "Rupture", "Prêt", "Synchronisé".
 * @param {{
 *   tone?: keyof typeof TONES,
 *   icon?: import("preact").ComponentType<any>,
 *   flipIcon?: boolean,
 *   class?: string,
 *   children: import("preact").ComponentChildren,
 * }} props
 */
export function Pill({ tone = "neutral", icon, flipIcon = false, class: className, children }) {
  const t = TONES[tone];
  return (
    <span class={cx("inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 label", t.box, className)}>
      {icon && <Icon icon={icon} size={20} flip={flipIcon} class={cx("size-4", t.icon)} />}
      <span>{children}</span>
    </span>
  );
}
