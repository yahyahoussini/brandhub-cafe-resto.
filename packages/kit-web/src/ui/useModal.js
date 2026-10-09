// @ts-check
import { useEffect, useRef } from "preact/hooks";

const FOCUSABLE =
  'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Modal behaviour for Sheet and ApprovalDialog: focus moves into the panel, Tab and Shift+Tab stay inside it, Escape
 * calls the latest `onClose`, and focus goes back to where it was when the modal closes.
 * @param {import("preact").RefObject<HTMLElement>} panel
 * @param {boolean} active
 * @param {() => void} onClose
 */
export function useModal(panel, active, onClose) {
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!active) return;
    const before = /** @type {HTMLElement | null} */ (document.activeElement);
    panel.current?.focus();
    /** @param {KeyboardEvent} e */
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close.current();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      const items = /** @type {HTMLElement[]} */ ([...panel.current.querySelectorAll(FOCUSABLE)]);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const inside = panel.current.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      before?.focus();
    };
  }, [active]);
}
