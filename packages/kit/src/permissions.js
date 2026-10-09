// @ts-check
/**
 * Who may do what, and when a manager's approval is needed (D38). The defaults are data/permissions.json; a client
 * tightens or relaxes them in settings (`permissions` per action, `approvals.discountCapBp`, `approvals.freeReprints`),
 * never below the floor marked there. The app asks before creating an event; the server asks again; the order and bank
 * rules only check that the approval is in the event.
 */

import defaults from "../../../data/permissions.json" with { type: "json" };
import { PAYMENT_CORRECTION_WINDOW_MS } from "./order.js";

/**
 * @typedef {object} ActionRule
 * @property {string[]} roles
 * @property {"always" | "if_sent" | "after_2_min" | "never"} approval
 * @property {Record<string, number>} [capBp] discount caps per role (basis points)
 * @property {number} [freeCount] reprints without approval
 * @property {boolean} reauth the owner retypes the password (back office)
 */

/** @typedef {{ role: string, active?: boolean, canApprove?: boolean }} StaffProfile */

/**
 * @typedef {object} ActionContext
 * @property {number} [discountBp] the discount asked, in basis points of the order (discount)
 * @property {boolean} [sent] something was sent to the kitchen (void_order) or the line was sent (void_line_*)
 * @property {boolean} [held] the sent line is held, not fired (void_line_sent)
 * @property {number} [ageMs] age of the payment (payment_correction)
 * @property {number} [reprintsDone] reprints already made of this ticket (reprint)
 */

const APPROVALS = ["always", "if_sent", "after_2_min", "never"];
/**
 * What a client may choose above each floor. `if_sent` and `after_2_min` answer different questions, so neither is
 * "stronger" than the other: only the floor itself or `always` keeps the floor's protection.
 */
const ALLOWED_ABOVE_FLOOR = {
  approval: ["always"],
  approval_if_sent: ["if_sent", "always"],
  approval_after_2_min: ["after_2_min", "always"],
};

/** @type {Record<string, any>} */
const DEFAULT_ACTIONS = /** @type {any} */ (defaults).actions;
export const ROLES = Object.freeze([.../** @type {any} */ (defaults).roles]);
export const DEFAULT_APPROVER_ROLES = Object.freeze([.../** @type {any} */ (defaults).approvers.default]);
export const ACTIONS = Object.freeze(Object.keys(DEFAULT_ACTIONS));

/**
 * The rules in force: defaults, then the client's settings, each clamped to its floor. `clamped` lists what the floor
 * refused, so the back office can say why a setting did not apply.
 * @param {Record<string, any>} [settings] values of marks.js (`settings` of the MarksState); defaults when omitted
 * @returns {{ actions: Record<string, ActionRule>, clamped: string[] }}
 */
export function effectivePermissions(settings = {}) {
  /** @type {Record<string, ActionRule>} */
  const actions = {};
  /** @type {string[]} */
  const clamped = [];
  const overrides = /** @type {Record<string, any>} */ (settings.permissions ?? {});
  for (const [action, def] of Object.entries(DEFAULT_ACTIONS)) {
    const o = overrides[action] ?? {};
    /** @type {ActionRule} */
    const rule = {
      roles: Array.isArray(o.roles) ? o.roles.filter((/** @type {string} */ r) => ROLES.includes(r)) : [...def.roles],
      approval: def.approval ?? "never",
      reauth: def.reauth === true,
    };
    // The owner can never be taken off an action the defaults give the owner (settings, permissions, staff…): a mistaken
    // or hostile override must not lock the owner out of their own business.
    if (def.roles.includes("owner") && !rule.roles.includes("owner")) {
      rule.roles.unshift("owner");
      clamped.push(`${action}.roles: the owner cannot be removed`);
    }
    // approval: a client may change it, never below the floor
    if (o.approval !== undefined) {
      if (!APPROVALS.includes(o.approval)) clamped.push(`${action}.approval: unknown value ${o.approval}`);
      else rule.approval = o.approval;
    }
    const allowed = typeof def.floor === "string" ? /** @type {Record<string, string[]>} */ (ALLOWED_ABOVE_FLOOR)[def.floor] : undefined;
    if (allowed && !allowed.includes(rule.approval)) {
      clamped.push(`${action}.approval: ${rule.approval} is below the floor ${allowed[0]}`);
      rule.approval = /** @type {ActionRule["approval"]} */ (allowed[0]);
    }
    if (def.capBp) {
      /** @type {Record<string, number>} */
      const caps = { ...def.capBp };
      for (const [role, cap] of Object.entries({ ...(settings["approvals.discountCapBp"] ?? {}), ...(o.capBp ?? {}) })) {
        // fail closed: a malformed cap keeps the default instead of disabling the check (NaN compares false)
        if (Number.isSafeInteger(cap) && cap >= 0 && cap <= 10000) caps[role] = cap;
        else clamped.push(`${action}.capBp.${role}: ${String(cap)} is not 0..10000`);
      }
      const max = def.floor?.cashierMaxBp;
      if (max !== undefined && caps.cashier > max) {
        clamped.push(`${action}.capBp.cashier: ${caps.cashier} is above the floor ${max}`);
        caps.cashier = max;
      }
      rule.capBp = caps;
    }
    if (def.freeCount !== undefined) {
      let wanted = o.freeCount ?? settings["approvals.freeReprints"] ?? def.freeCount;
      if (!Number.isSafeInteger(wanted) || wanted < 0) {
        clamped.push(`${action}.freeCount: ${String(wanted)} is not a whole number`);
        wanted = def.freeCount;
      }
      const max = def.floor?.maxFree ?? wanted;
      rule.freeCount = Math.max(0, Math.min(wanted, max));
      if (wanted > max) clamped.push(`${action}.freeCount: ${wanted} is above the floor ${max}`);
    }
    actions[action] = rule;
  }
  return { actions, clamped };
}

/**
 * @param {Record<string, ActionRule>} actions
 * @param {string} action
 */
function rule(actions, action) {
  const r = actions[action];
  if (!r) throw new RangeError(`unknown action ${action}`);
  return r;
}

/**
 * Whether a staff member may do an action at all (an inactive profile may do nothing).
 * @param {StaffProfile} staff
 * @param {string} action
 * @param {{ settings?: Record<string, any> }} [ctx]
 */
export function can(staff, action, ctx = {}) {
  if (!staff || staff.active === false) return false;
  return rule(effectivePermissions(ctx.settings).actions, action).roles.includes(staff.role);
}

/**
 * Whether the action needs an approver's PIN, for this staff member and this situation. Call `can` first.
 * @param {StaffProfile} staff
 * @param {string} action
 * @param {ActionContext & { settings?: Record<string, any> }} [ctx]
 */
export function needsApproval(staff, action, ctx = {}) {
  const r = rule(effectivePermissions(ctx.settings).actions, action);
  if (action === "discount") {
    const cap = r.capBp?.[staff.role] ?? 0;
    return (ctx.discountBp ?? 0) > cap || r.approval === "always";
  }
  if (action === "reprint") return (ctx.reprintsDone ?? 0) >= (r.freeCount ?? 0) || r.approval === "always";
  if (action === "void_line_sent" && ctx.held === true) return false; // held lines (not fired) need no approval
  switch (r.approval) {
    case "always":
      return true;
    case "if_sent":
      return ctx.sent === true;
    case "after_2_min":
      return (ctx.ageMs ?? 0) > PAYMENT_CORRECTION_WINDOW_MS;
    default:
      return false;
  }
}

/**
 * Whether a staff member may approve (type the PIN of "Validation gérant"): flagged `canApprove`, named in the
 * setting `approvals.approvers`, or, by default, an owner or a manager.
 * @param {StaffProfile & { id?: string }} staff
 * @param {Record<string, any>} [settings]
 */
export function isApprover(staff, settings = {}) {
  if (!staff || staff.active === false) return false;
  if (staff.canApprove === true) return true;
  if (staff.canApprove === false) return false;
  const list = settings["approvals.approvers"];
  if (Array.isArray(list)) return staff.id !== undefined && list.includes(staff.id);
  return DEFAULT_APPROVER_ROLES.includes(staff.role);
}
