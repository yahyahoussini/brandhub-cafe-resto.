// @ts-check
import { useEffect, useRef } from "preact/hooks";
import { cx } from "./cx.js";

/** docs/07 §5: black, 4 s. */
export const TOAST_MS = 4000;

/**
 * A short confirmation ("Ticket imprimé"): black, at the bottom, gone after 4 s. Errors use `ErrorBanner`, not a toast.
 * @param {{ message: string, onDone?: () => void, duration?: number, inline?: boolean, showId?: number | string }} props
 *   `showId` restarts the 4 s when the same message is shown again (pass a counter); `inline` keeps it in place and on
 *   screen (style guide).
 */
export function Toast({ message, onDone, duration = TOAST_MS, inline = false, showId }) {
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (inline) return;
    const id = setTimeout(() => done.current?.(), duration);
    return () => clearTimeout(id);
  }, [message, showId, duration, inline]);
  return (
    <div
      role="status"
      aria-live="polite"
      class={cx(
        "w-max max-w-[min(32rem,calc(100vw-2rem))] rounded-sm border-2 border-line bg-black px-5 py-3 text-till text-on-black",
        !inline && "fixed inset-x-0 bottom-6 z-50 mx-auto",
      )}
    >
      {message}
    </div>
  );
}
