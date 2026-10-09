// @ts-check
/**
 * Mounts the dev-only style guide (prompt 02). `?lang=fr|ar`, `?theme=light|dark` and `?digits=latn|arab` choose the
 * variant, so Playwright can screenshot each one; the switches in the page keep the URL in step.
 */
import { h, render } from "preact";
import { useState } from "preact/hooks";
import { digits, isLocale, locale, setDigits, setLocale } from "../i18n/index.js";
import { Styleguide, applyTheme } from "./Styleguide.jsx";

/**
 * @param {HTMLElement} el
 * @param {{ product: "cafe" | "resto" }} opts
 */
export function mountStyleguide(el, { product }) {
  const params = new URLSearchParams(location.search);
  const lang = params.get("lang") ?? "fr";
  setLocale(isLocale(lang) ? lang : "fr");
  setDigits(params.get("digits") === "arab" ? "arab" : "latn");
  const initialTheme = params.get("theme") === "dark" ? "dark" : "light";
  applyTheme(initialTheme);

  /** Keeps the URL in step with the switches. */
  function syncUrl(/** @type {string} */ theme) {
    const p = new URLSearchParams({ lang: locale.value, theme, digits: digits.value });
    history.replaceState(null, "", `${location.pathname}?${p}`);
  }

  function App() {
    const [theme, setTheme] = useState(/** @type {"light" | "dark"} */ (initialTheme));
    syncUrl(theme);
    return h(Styleguide, {
      product,
      theme,
      onTheme: (/** @type {"light" | "dark"} */ next) => {
        applyTheme(next);
        setTheme(next);
      },
    });
  }

  render(h(App, null), el);
}
