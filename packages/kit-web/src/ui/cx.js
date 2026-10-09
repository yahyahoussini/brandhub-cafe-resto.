// @ts-check
/**
 * Joins class names, skipping false, null and undefined (`cx("a", on && "b")`). The `bh/logical-css` lint checks
 * every string passed here.
 * @param {...(string | false | null | undefined | 0)} parts
 */
export function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}
