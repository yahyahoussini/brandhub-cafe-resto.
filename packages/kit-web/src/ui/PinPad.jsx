// @ts-check
import { TriangleAlert } from "lucide-preact";
import { useState } from "preact/hooks";
import { t } from "../i18n/index.js";
import { cx } from "./cx.js";
import { Icon } from "./Icon.jsx";
import { Keypad } from "./Keypad.jsx";

/** @type {(import("./Keypad.jsx").KeypadKey | null)[]} */
const PIN_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", null, "0", "back"];

/**
 * A staff or manager PIN pad: keys 64 × 56 px (docs/07 §5); shows how many digits were typed, never the digits.
 * Calls `onComplete` when `length` digits are typed, then clears. Remount it (`key`) to reset after an error.
 * @param {{
 *   onComplete: (pin: string) => void,
 *   length?: number,
 *   label?: string,
 *   error?: string,
 *   loading?: boolean,
 *   disabled?: boolean,
 *   initialCount?: number,
 *   class?: string,
 * }} props `initialCount` pre-fills dots (style guide only).
 */
export function PinPad({
  onComplete,
  length = 4,
  label,
  error,
  loading = false,
  disabled = false,
  initialCount = 0,
  class: className,
}) {
  const [pin, setPin] = useState("0".repeat(Math.min(initialCount, length)));
  const inactive = disabled || loading;

  /** @param {import("./Keypad.jsx").KeypadKey} key */
  function onKey(key) {
    if (inactive) return;
    if (key === "back") return setPin(pin.slice(0, -1));
    const next = (pin + key).slice(0, length);
    if (next.length === length) {
      setPin("");
      onComplete(next);
    } else setPin(next);
  }

  return (
    <div class={cx("flex w-max flex-col items-center gap-4", className)}>
      <p class="label text-text-2">{label ?? t("pin.label")}</p>
      <div
        role="status"
        aria-live="polite"
        aria-label={t("pin.entered", { count: pin.length, length })}
        dir="ltr"
        class="flex gap-3"
      >
        {Array.from({ length }, (_, i) => (
          <span
            key={i}
            class={cx(
              "size-4 rounded-sm border-2",
              error ? "border-danger" : "border-text-2",
              i < pin.length && (error ? "bg-danger" : "bg-text"),
            )}
          />
        ))}
      </div>
      {error && (
        <p role="alert" class="flex items-center gap-2 text-body text-danger">
          <Icon icon={TriangleAlert} />
          {error}
        </p>
      )}
      <Keypad keys={PIN_KEYS} onKey={onKey} disabled={inactive} label={label ?? t("pin.label")} />
      {loading && <p class="text-body text-text-2">{t("state.loading")}</p>}
    </div>
  );
}
