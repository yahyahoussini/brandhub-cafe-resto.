// @ts-check
import { LoaderCircle } from "lucide-preact";
import { t } from "../i18n/index.js";
import { cx } from "./cx.js";
import { Icon } from "./Icon.jsx";

const VARIANTS = {
  primary: "bg-brand text-on-brand border-brand active:bg-brand-ink data-[state=pressed]:bg-brand-ink",
  secondary: "bg-surface-2 text-brand border-brand active:bg-brand-soft data-[state=pressed]:bg-brand-soft",
  danger: "bg-danger text-on-brand border-danger active:translate-y-px",
};

const SIZES = {
  staff: "min-h-btn px-6 text-till",
  // 16 px labels in the back office too: docs/07 §2 forbids blue text below 16 px on grey (secondary on a dark card).
  office: "min-h-btn-office px-4 text-till",
};

/**
 * A button. `primary` is the one main action of a screen (docs/07 §2: blue for one thing per screen); 56 px high on
 * staff screens, 40 px in the back office (docs/07 §5).
 * @param {{
 *   variant?: keyof typeof VARIANTS,
 *   size?: keyof typeof SIZES,
 *   type?: "button" | "submit",
 *   loading?: boolean,
 *   disabled?: boolean,
 *   state?: "pressed",
 *   icon?: import("preact").ComponentType<any>,
 *   flipIcon?: boolean,
 *   block?: boolean,
 *   onClick?: (e: MouseEvent) => void,
 *   class?: string,
 *   children?: import("preact").ComponentChildren,
 * }} props `state="pressed"` shows the pressed look (style guide, toggle buttons).
 */
export function Button({
  variant = "primary",
  size = "staff",
  type = "button",
  loading = false,
  disabled = false,
  state,
  icon,
  flipIcon = false,
  block = false,
  onClick,
  class: className,
  children,
}) {
  const inactive = disabled || loading;
  return (
    <button
      type={type}
      disabled={disabled}
      aria-disabled={inactive || undefined}
      aria-busy={loading || undefined}
      data-state={state}
      // A loading submit button stays focusable but must not submit twice (a second payment); cancel the click.
      onClick={inactive ? (e) => e.preventDefault() : onClick}
      class={cx(
        "inline-flex items-center justify-center gap-2 rounded-sm border-2 font-medium select-none",
        "transition-colors duration-(--bh-motion-fast) active:translate-y-px data-[state=pressed]:translate-y-px",
        SIZES[size],
        block && "w-full",
        disabled ? "bg-surface-2 text-text-3 border-mid cursor-not-allowed active:translate-y-0" : VARIANTS[variant],
        loading && "cursor-progress",
        className,
      )}
    >
      {loading ? <Icon icon={LoaderCircle} class="animate-spin" /> : icon && <Icon icon={icon} flip={flipIcon} />}
      <span>{children}</span>
      {loading && <span class="sr-only">{t("state.loading")}</span>}
    </button>
  );
}
