// @ts-check
import { ShieldCheck } from "lucide-preact";
import { useId, useState } from "preact/hooks";
import { t } from "../i18n/index.js";
import { Button } from "./Button.jsx";
import { cx } from "./cx.js";
import { Icon } from "./Icon.jsx";
import { PinPad } from "./PinPad.jsx";

/** The reason list of docs/06 §1; the key is stored in the event's `reason`, the label is translated. */
export const APPROVAL_REASONS = /** @type {const} */ (["error", "customer_left", "comped", "breakage", "other"]);
/** @typedef {(typeof APPROVAL_REASONS)[number]} ApprovalReason */

/**
 * "Validation gérant" (docs/06 §1): the manager picks a reason, then types his PIN on the same device. The caller
 * checks the PIN offline and records the approval in the event (`approvedBy`), never a shared password.
 * @param {{
 *   open: boolean,
 *   onApprove: (approval: { pin: string, reason: ApprovalReason }) => void,
 *   onCancel: () => void,
 *   reasons?: readonly ApprovalReason[],
 *   initialReason?: ApprovalReason,
 *   error?: string,
 *   loading?: boolean,
 *   inline?: boolean,
 * }} props `error` (wrong PIN) also clears the pad; `inline` draws it in place (style guide).
 */
export function ApprovalDialog({
  open,
  onApprove,
  onCancel,
  reasons = APPROVAL_REASONS,
  initialReason,
  error,
  loading = false,
  inline = false,
}) {
  const [reason, setReason] = useState(/** @type {ApprovalReason | undefined} */ (initialReason));
  const titleId = useId();
  if (!open) return null;
  const panel = (
    <div
      role="dialog"
      aria-modal={inline ? undefined : "true"}
      aria-labelledby={titleId}
      class="flex w-full max-w-[28rem] flex-col gap-5 rounded-sm border-2 border-line bg-surface-2 p-6"
    >
      <h2 id={titleId} class="flex items-center gap-2 font-display text-title text-text">
        <Icon icon={ShieldCheck} size={24} class="text-brand" />
        {t("term.approval")}
      </h2>
      <fieldset class="flex flex-col gap-2">
        <legend class="mb-2 label text-text-2">{t("approval.reason")}</legend>
        <div role="radiogroup" class="flex flex-wrap gap-2">
          {reasons.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={reason === r}
              onClick={() => setReason(r)}
              class={cx(
                "min-h-target rounded-sm border-2 px-4 text-till",
                reason === r ? "border-brand bg-brand-soft text-text" : "border-line bg-surface-2 text-text",
              )}
            >
              {t(`approval.reasons.${r}`)}
            </button>
          ))}
        </div>
      </fieldset>
      {!reason && <p class="text-body text-text-2">{t("approval.choose_reason")}</p>}
      <PinPad
        key={error ?? "pin"}
        class="self-center"
        label={t("approval.pin")}
        error={error}
        loading={loading}
        disabled={!reason}
        onComplete={(pin) => reason && onApprove({ pin, reason })}
      />
      <Button variant="secondary" onClick={onCancel} block>
        {t("action.cancel")}
      </Button>
    </div>
  );
  if (inline) return panel;
  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/40" aria-hidden="true" />
      <div class="relative w-full max-w-[28rem]">{panel}</div>
    </div>
  );
}
