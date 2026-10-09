// @ts-check
import { Inbox } from "lucide-preact";
import { cx } from "./cx.js";
import { Icon } from "./Icon.jsx";

/**
 * What a list or screen shows when it has nothing yet ("Aucune vente aujourd'hui", docs/06 §8): what is empty, why,
 * and the next action when there is one.
 * @param {{
 *   title: string,
 *   body?: string,
 *   icon?: import("preact").ComponentType<any>,
 *   action?: import("preact").ComponentChildren,
 *   class?: string,
 * }} props
 */
export function EmptyState({ title, body, icon = Inbox, action, class: className }) {
  return (
    <div class={cx("flex flex-col items-center gap-3 px-6 py-10 text-center", className)}>
      <Icon icon={icon} size={24} class="text-text-2" />
      <p class="text-till font-medium text-text">{title}</p>
      {body && <p class="max-w-reading text-body text-text-2">{body}</p>}
      {action}
    </div>
  );
}
