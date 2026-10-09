// @ts-check
import { cx } from "./cx.js";

/**
 * A Lucide icon at the design system's stroke (1.75) and sizes (20 or 24 px), hidden from screen readers (the text
 * next to it says the same). `flip` mirrors icons that point (arrows, backspace) in right-to-left (docs/07 §4).
 * @param {{ icon: import("preact").ComponentType<any>, size?: 20 | 24, flip?: boolean, class?: string }} props
 */
export function Icon({ icon: Glyph, size = 20, flip = false, class: className }) {
  return (
    <Glyph
      size={size}
      strokeWidth={1.75}
      aria-hidden="true"
      focusable="false"
      class={cx("shrink-0", flip && "rtl:-scale-x-100", className)}
    />
  );
}
