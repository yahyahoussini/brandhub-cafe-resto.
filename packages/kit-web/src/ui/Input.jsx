// @ts-check
import { TriangleAlert } from "lucide-preact";
import { useId } from "preact/hooks";
import { cx } from "./cx.js";
import { Icon } from "./Icon.jsx";

/**
 * A text field with its label above, never a placeholder as label; 48 px on staff screens, 44 px in the back office
 * (docs/07 §5). `ltr` keeps numbers, phone numbers and references left to right in Arabic (docs/07 §7).
 * @param {{
 *   label: string,
 *   value: string,
 *   onInput?: (value: string) => void,
 *   type?: "text" | "tel" | "email" | "password" | "search",
 *   inputMode?: "text" | "numeric" | "decimal" | "tel" | "email",
 *   hint?: string,
 *   error?: string,
 *   size?: "staff" | "office",
 *   ltr?: boolean,
 *   disabled?: boolean,
 *   required?: boolean,
 *   autoComplete?: string,
 *   class?: string,
 * }} props
 */
export function Input({
  label,
  value,
  onInput,
  type = "text",
  inputMode,
  hint,
  error,
  size = "staff",
  ltr = false,
  disabled = false,
  required = false,
  autoComplete,
  class: className,
}) {
  const id = useId();
  // Phone numbers are always left to right (docs/07 §7).
  const isLtr = ltr || type === "tel";
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div class={cx("flex flex-col gap-1.5", className)}>
      <label for={id} class="label text-text-2">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        inputMode={inputMode}
        dir={isLtr ? "ltr" : undefined}
        disabled={disabled}
        required={required}
        autoComplete={autoComplete}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={[errorId, hintId].filter(Boolean).join(" ") || undefined}
        onInput={(e) => onInput?.(/** @type {HTMLInputElement} */ (e.currentTarget).value)}
        class={cx(
          "w-full rounded-sm border-2 bg-surface-2 px-3 text-text outline-none transition-colors duration-(--bh-motion-fast)",
          "focus:border-brand disabled:cursor-not-allowed disabled:border-mid disabled:text-text-3",
          size === "staff" ? "h-input text-till" : "h-input-office text-body",
          isLtr && "text-start",
          error ? "border-danger" : "border-line",
        )}
      />
      {error && (
        <p id={errorId} class="flex items-center gap-1.5 text-body text-danger">
          <Icon icon={TriangleAlert} />
          {error}
        </p>
      )}
      {hint && (
        <p id={hintId} class="text-body text-text-2">
          {hint}
        </p>
      )}
    </div>
  );
}
