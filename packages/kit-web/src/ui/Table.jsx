// @ts-check
import { cx } from "./cx.js";

/**
 * @template Row
 * @typedef {{
 *   key: string,
 *   label: string,
 *   align?: "start" | "end",
 *   render?: (row: Row) => import("preact").ComponentChildren,
 * }} Column
 */

/**
 * A data table for the back office: no radius, 2 px seams (docs/07 §4); scrolls sideways rather than squeezing, so it
 * stays readable at 200 % zoom (docs/06 §8). Numbers align to the end.
 * @template {Record<string, any>} Row
 * @param {{
 *   columns: Column<Row>[],
 *   rows: Row[],
 *   rowKey: (row: Row) => string,
 *   caption?: string,
 *   empty?: import("preact").ComponentChildren,
 *   class?: string,
 * }} props `empty` is shown instead of the body when there are no rows (an EmptyState).
 */
export function Table({ columns, rows, rowKey, caption, empty, class: className }) {
  return (
    <div class={cx("w-full overflow-x-auto border-2 border-line", className)}>
      <table class="w-full border-collapse text-body">
        {caption && <caption class="px-4 py-3 text-start font-medium text-text">{caption}</caption>}
        <thead class="bg-surface">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                class={cx(
                  "border-b-2 border-line px-4 py-3 label text-text-2",
                  c.align === "end" ? "text-end" : "text-start",
                )}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>{empty}</td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={rowKey(row)} class="bg-surface-2">
                {columns.map((c) => (
                  <td
                    key={c.key}
                    class={cx(
                      "border-b-2 border-line px-4 py-3 text-text",
                      c.align === "end" ? "text-end" : "text-start",
                    )}
                  >
                    {c.render ? c.render(row) : String(row[c.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
