// @ts-check
import { Delete } from "lucide-preact";
import { localizeDigits, t } from "../i18n/index.js";
import { cx } from "./cx.js";
import { Icon } from "./Icon.jsx";

/** @typedef {"0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "00" | "back"} KeypadKey */

/** @type {KeypadKey[]} */
const AMOUNT_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "back"];

export const KEY_CLASS =
  "inline-flex h-key-h w-key-w items-center justify-center rounded-sm border-2 border-line bg-surface-2 text-key font-medium tabular-nums text-text select-none transition-colors duration-(--bh-motion-fast) active:translate-y-px active:bg-brand-soft disabled:cursor-not-allowed disabled:border-mid disabled:text-text-3 disabled:active:translate-y-0 disabled:active:bg-surface-2";

/**
 * The numeric keypad: keys 64 × 56 px, digits 22 px (docs/07 §5). Laid out 1-2-3 from the left in both languages,
 * like every phone and terminal keypad. It only reports keys; the amount is parsed by the kit.
 * @param {{
 *   onKey: (key: KeypadKey) => void,
 *   keys?: (KeypadKey | null)[],
 *   disabled?: boolean,
 *   label?: string,
 *   class?: string,
 * }} props `keys` replaces the layout (null leaves a gap), e.g. the PIN pad without "00".
 */
export function Keypad({ onKey, keys = AMOUNT_KEYS, disabled = false, label, class: className }) {
  return (
    <div
      role="group"
      aria-label={label ?? t("keypad.label")}
      dir="ltr"
      class={cx("grid w-max grid-cols-3 gap-2", className)}
    >
      {keys.map((k, i) =>
        k === null ? (
          <span key={`gap-${i}`} aria-hidden="true" />
        ) : (
          <button
            key={k}
            type="button"
            disabled={disabled}
            aria-label={k === "back" ? t("keypad.delete") : undefined}
            onClick={() => onKey(k)}
            class={KEY_CLASS}
          >
            {k === "back" ? <Icon icon={Delete} size={24} /> : localizeDigits(k)}
          </button>
        ),
      )}
    </div>
  );
}
