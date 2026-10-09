// @ts-check
import { CircleCheck, CloudOff, RefreshCw } from "lucide-preact";
import { t } from "../i18n/index.js";
import { Pill } from "./Pill.jsx";

/**
 * The sync badge on every staff screen (D15, docs/06 §1): green "Synchronisé", orange "N en attente", red "Hors ligne
 * depuis N min" after 10 minutes without contact. Give it the result of `syncState()`.
 * @param {{ sync: import("./sync-state.js").SyncState, class?: string }} props
 */
export function SyncBadge({ sync, class: className }) {
  const view =
    sync.state === "offline"
      ? {
          tone: /** @type {const} */ ("danger"),
          icon: CloudOff,
          text: Number.isFinite(sync.minutes) ? t("sync.offline", { count: sync.minutes }) : t("term.offline"),
        }
      : sync.state === "pending"
        ? { tone: /** @type {const} */ ("warn"), icon: RefreshCw, text: t("sync.pending", { count: sync.pending }) }
        : { tone: /** @type {const} */ ("ok"), icon: CircleCheck, text: t("term.synced") };
  return (
    <span role="status" aria-label={t("sync.aria", { state: view.text })} class={className}>
      <Pill tone={view.tone} icon={view.icon}>
        {view.text}
      </Pill>
    </span>
  );
}
