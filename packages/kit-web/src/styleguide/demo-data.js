// @ts-check
/**
 * Demo content of the style guide, all from the pack: product names from the menu templates (data/menu-templates),
 * prices from the acceptance days of docs/01 §6 (café) and §7 (restaurant), "not a recommendation". The templates
 * themselves carry no prices; the owner fills them in.
 */
import cafe from "../../../../data/menu-templates/cafe.json" with { type: "json" };
import resto from "../../../../data/menu-templates/resto.json" with { type: "json" };

/** @typedef {{ fr: string, ar: string }} Name */
/** @typedef {{ name: Name, priceCentimes: number | null }} DemoProduct */

const PRICES = {
  cafe: {
    "Café noir": 1000,
    "Nss nss": 1000,
    "Café crème": 1200,
    "Thé à la menthe (verre)": 800,
    "Jus d'orange pressé": 1500,
    Msemen: 500,
    "Eau minérale 50 cl": 600,
  },
  resto: {
    "Salade marocaine": 2500,
    Harira: 2000,
    "Tajine poulet citron olives": 7500,
    "Brochettes kefta": 7000,
    "Thé à la menthe (théière)": 2500,
  },
};

/** A product of the template that has no demo price, to show the "Prix à saisir" tile. */
const UNPRICED = { cafe: "Café noir double", resto: "Tajine kefta aux œufs" };

/**
 * @param {"cafe" | "resto"} product
 * @returns {{ priced: DemoProduct[], unpriced: DemoProduct }}
 */
export function demoProducts(product) {
  /** @type {{ name: Name }[]} */
  const items = (product === "cafe" ? cafe : resto).products;
  /** @param {string} fr */
  const find = (fr) => {
    const p = items.find((x) => x.name.fr === fr);
    if (!p) throw new Error(`style guide: "${fr}" is not in the ${product} template`);
    return p.name;
  };
  const prices = /** @type {Record<string, number>} */ (PRICES[product]);
  return {
    priced: Object.entries(prices).map(([fr, priceCentimes]) => ({ name: find(fr), priceCentimes })),
    unpriced: { name: find(UNPRICED[product]), priceCentimes: null },
  };
}

/** Banks counted at 15:00 on the café acceptance day (docs/01 §6): Sara −5,00, Ali 0,00. */
export const DEMO_BANKS = [
  { id: "sara", staffKey: "styleguide.staff_sara", expected: 52500, counted: 52000, gap: -500 },
  { id: "ali", staffKey: "styleguide.staff_ali", expected: 3000, counted: 3000, gap: 0 },
];

/** Day revenue of docs/01 §6 (106,00 TTC) and its first receipt number. */
export const DEMO_REVENUE = 10600;
export const DEMO_RECEIPT_NO = "C1-000001";
