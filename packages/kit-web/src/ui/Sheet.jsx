// @ts-check
import { X } from "lucide-preact";
import { useId, useRef } from "preact/hooks";
import { t } from "../i18n/index.js";
import { cx } from "./cx.js";
import { Icon } from "./Icon.jsx";
import { useModal } from "./useModal.js";

/**
 * The options sheet: a bottom sheet, the only element with a shadow (docs/07 §4–§5). Escape, the backdrop or the close
 * button calls `onClose`; focus stays inside while it is open and comes back where it was. `inline` draws it in place
 * (style guide).
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   title: string,
 *   footer?: import("preact").ComponentChildren,
 *   inline?: boolean,
 *   children?: import("preact").ComponentChildren,
 * }} props
 */
export function Sheet({ open, onClose, title, footer, inline = false, children }) {
  const titleId = useId();
  const panel = useRef(/** @type {HTMLDivElement | null} */ (null));

  useModal(panel, open && !inline, onClose);

  if (!open) return null;
  const sheet = (
    <div
      ref={panel}
      role="dialog"
      aria-modal={inline ? undefined : "true"}
      aria-labelledby={titleId}
      tabIndex={-1}
      class={cx(
        "flex max-h-[85vh] w-full flex-col rounded-t-sm border-t-2 border-line bg-surface-2 shadow-sheet",
        !inline && "fixed inset-x-0 bottom-0 z-50 animate-[sheet-in_var(--bh-motion)_ease-out]",
      )}
    >
      <header class="flex items-center justify-between gap-4 border-b-2 border-line px-6 py-4">
        <h2 id={titleId} class="font-display text-title text-text">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("action.close")}
          class="inline-flex size-target items-center justify-center rounded-sm text-text-2 active:bg-surface"
        >
          <Icon icon={X} size={24} />
        </button>
      </header>
      <div class="overflow-y-auto px-6 py-4 text-till text-text">{children}</div>
      {footer && <footer class="flex justify-end gap-3 border-t-2 border-line px-6 py-4">{footer}</footer>}
    </div>
  );
  if (inline) return sheet;
  return (
    <div class="fixed inset-0 z-40">
      <div class="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      {sheet}
    </div>
  );
}
