// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { ACTIONS, can, effectivePermissions, isApprover, needsApproval } from "../src/permissions.js";
import { settingsDefaults } from "../src/marks.js";

const cashier = { role: "cashier" };
const waiter = { role: "waiter" };
const manager = { role: "manager" };
const kitchen = { role: "kitchen" };

test("the default matrix of data/permissions.json (D38)", () => {
  assert.equal(can(cashier, "sell"), true);
  assert.equal(can(kitchen, "sell"), false);
  assert.equal(can(waiter, "discount"), false);
  assert.equal(can(cashier, "settings"), false);
  assert.equal(can({ role: "owner" }, "settings"), true);
  assert.equal(can({ role: "cashier", active: false }, "sell"), false, "an inactive profile may do nothing");
  assert.ok(ACTIONS.includes("void_line_sent"));
});

test("discount caps per role; above the cap needs approval", () => {
  assert.equal(needsApproval(cashier, "discount", { discountBp: 1000 }), false);
  assert.equal(needsApproval(cashier, "discount", { discountBp: 1001 }), true);
  assert.equal(needsApproval(manager, "discount", { discountBp: 5000 }), false);
  assert.equal(needsApproval(waiter, "discount", { discountBp: 1 }), true);
});

test("voids, payments and reprints follow their rule", () => {
  assert.equal(needsApproval(waiter, "void_line_sent", {}), true);
  assert.equal(needsApproval(waiter, "void_line_sent", { held: true }), false, "held lines need no approval");
  assert.equal(needsApproval(waiter, "void_order", { sent: false }), false);
  assert.equal(needsApproval(waiter, "void_order", { sent: true }), true);
  assert.equal(needsApproval(cashier, "payment_correction", { ageMs: 60_000 }), false);
  assert.equal(needsApproval(cashier, "payment_correction", { ageMs: 180_000 }), true);
  assert.equal(needsApproval(cashier, "reprint", { reprintsDone: 0 }), false);
  assert.equal(needsApproval(cashier, "reprint", { reprintsDone: 1 }), true);
  assert.equal(needsApproval(cashier, "no_sale"), true);
});

test("settings tighten or relax, never below the floor", () => {
  const settings = {
    ...settingsDefaults("cafe"),
    "approvals.discountCapBp": { cashier: 3000, waiter: 500 },
    "approvals.freeReprints": 5,
    permissions: {
      no_sale: { approval: "never" },
      void_order: { approval: "always" },
      discount: { roles: ["owner", "manager", "cashier", "waiter"] },
    },
  };
  const { actions, clamped } = effectivePermissions(settings);
  assert.equal(actions.discount.capBp?.cashier, 2000, "cashier cap is held at the floor of 20 %");
  assert.equal(actions.discount.capBp?.waiter, 500);
  assert.equal(actions.reprint.freeCount, 3, "at most 3 free reprints");
  assert.equal(actions.no_sale.approval, "always", "an always-approval floor cannot be removed");
  assert.equal(actions.void_order.approval, "always", "tightening is allowed");
  assert.equal(can(waiter, "discount", { settings }), true);
  assert.equal(needsApproval(waiter, "discount", { discountBp: 400, settings }), false);
  assert.deepEqual(clamped.sort(), [
    "discount.capBp.cashier: 3000 is above the floor 2000",
    "no_sale.approval: never is below the floor always",
    "reprint.freeCount: 5 is above the floor 3",
  ]);
});

test("approvers: flagged canApprove, named in the setting, or owners and managers by default", () => {
  assert.equal(isApprover(manager), true);
  assert.equal(isApprover(cashier), false);
  assert.equal(isApprover({ role: "cashier", canApprove: true }), true);
  assert.equal(isApprover({ role: "manager", canApprove: false }), false);
  assert.equal(isApprover({ id: "stf_1", role: "waiter" }, { "approvals.approvers": ["stf_1"] }), true);
  assert.equal(isApprover({ role: "manager", active: false }), false);
});

test("an unknown action is a programming error", () => {
  assert.throws(() => can(cashier, "fly"), RangeError);
});
