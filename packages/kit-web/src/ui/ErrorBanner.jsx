// @ts-check
import { TriangleAlert } from "lucide-preact";
import { cx } from "./cx.js";
import { Icon } from "./Icon.jsx";

/**
 * An error says what happened and what to do ("Imprimante hors ligne — le ticket attend. Vérifiez le papier.",
 * docs/06 §1). The danger colour is the start bar and the icon; the text stays readable on the soft fill.
 * `code` shows the docs/03 §9 code for support.
 * @param {{
 *   message: string,
 *   action?: string,
 *   code?: string,
 *   children?: import("preact").ComponentChildren,
 *   class?: string,
 * }} props `children` holds buttons (Réessayer).
 */
export function ErrorBanner({ message, action, code, children, class: className }) {
  return (
    <div
      role="alert"
      class={cx(
        "flex flex-wrap items-start gap-3 rounded-sm border-2 border-s-4 border-danger bg-danger-soft px-4 py-3 text-text",
        className,
      )}
    >
      <Icon icon={TriangleAlert} size={24} class="text-danger" />
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <p class="text-till font-medium">{message}</p>
        {action && <p class="text-body">{action}</p>}
        {code && (
          <p dir="ltr" class="self-start font-mono text-mono text-text-2">
            {code}
          </p>
        )}
      </div>
      {children && <div class="flex gap-2">{children}</div>}
    </div>
  );
}
