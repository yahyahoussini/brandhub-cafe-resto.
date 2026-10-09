// @ts-check
import "../src/styles.css";
import { mountStyleguide } from "@brandhub/kit-web/styleguide";

const el = document.getElementById("app");
if (el) mountStyleguide(el, { product: "cafe" });
