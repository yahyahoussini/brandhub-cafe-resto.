// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyBankEvent, assertBankAccepts, BankRuleError, cashVariance, doseAlert, doseVariance, expectedCash } from "../src/bank.js";
import { uuidv7 } from "../src/ids.js";

const T0 = Date.UTC(2026, 10, 30, 7, 0, 0);

function bankScript(device = "dev_till") {
  let seq = 0;
  let at = T0;
  /** @type {any[]} */
  const events = [];
  /**
   * @param {string} type
   * @param {Record<string, any>} [data]
   * @param {{ device?: string }} [o]
   */
  const add = (type, data = {}, o = {}) => {
    seq += 1;
    at += 60_000;
    const ev = { id: uuidv7(at), type, entity: "bnk_1", seq, device: o.device ?? device, staff: "stf_sara", at, data };
    events.push(ev);
    return ev;
  };
  const drop = () => {
    events.pop();
    seq -= 1;
  };
  const fold = () => events.reduce((s, ev) => applyBankEvent(s, ev), null);
  return { add, drop, events, fold };
}

/** @param {() => unknown} fn @param {string} c */
const code = (fn, c) => assert.throws(fn, (e) => e instanceof BankRuleError && e.code === c);

test("a till shift: float, cash sales, a paid-out, blind count, close", () => {
  const b = bankScript();
  b.add("bank.opened", { kind: "till", holder: "stf_sara", floatCentimes: 50000 });
  b.add("bank.cash_out", { amountCentimes: 3000, reason: "menthe au marché", approvedBy: "stf_manager" });
  b.add("bank.counted", { countedCentimes: 486000 });
  b.add("bank.closed", {});
  const s = b.fold();
  const cashSales = [150000, 289000];
  assert.equal(expectedCash(s, cashSales), 50000 + 439000 - 3000);
  assert.equal(cashVariance(s, cashSales), 486000 - 486000);
  assert.equal(s.status, "closed");
});

test("a waiter who is short by 35 DH", () => {
  const b = bankScript("dev_phone_ali");
  b.add("bank.opened", { kind: "waiter", holder: "stf_ali", floatCentimes: 0 });
  b.add("bank.counted", { countedCentimes: 41500 });
  const s = b.fold();
  assert.equal(cashVariance(s, [20000, 25000]), -3500);
});

test("the drawer never opens without a sale unless a manager approves", () => {
  const b = bankScript();
  b.add("bank.opened", { kind: "till", holder: "stf_sara", floatCentimes: 0 });
  const s = b.fold();
  code(() => applyBankEvent(s, b.add("bank.no_sale", { reason: "monnaie" })), "E_APPROVAL_REQUIRED");
  b.drop();
  const ok = applyBankEvent(s, b.add("bank.no_sale", { reason: "monnaie", approvedBy: "stf_manager" }));
  assert.equal(ok.noSaleCount, 1);
});

test("closing needs a blind count first", () => {
  const b = bankScript();
  b.add("bank.opened", { kind: "till", holder: "stf_sara", floatCentimes: 0 });
  const s = b.fold();
  code(() => applyBankEvent(s, b.add("bank.closed", {})), "E_STATUS");
});

test("the manager settles a waiter's bank from the till by taking it over", () => {
  const b = bankScript("dev_phone_ali");
  b.add("bank.opened", { kind: "waiter", holder: "stf_ali", floatCentimes: 0 });
  const s = b.fold();
  code(() => applyBankEvent(s, b.add("bank.counted", { countedCentimes: 1000 }, { device: "dev_till" })), "E_NOT_OWNER");
  b.drop();
  const taken = applyBankEvent(s, b.add("bank.taken_over", { approvedBy: "stf_manager" }, { device: "dev_till" }));
  const counted = applyBankEvent(taken, b.add("bank.counted", { countedCentimes: 1000 }, { device: "dev_till" }));
  assert.equal(counted.owner, "dev_till");
  // the waiter's phone comes back online with a late event: refused, goes to the review list
  code(() => applyBankEvent(counted, b.add("bank.cash_in", { amountCentimes: 500, reason: "x" }, { device: "dev_phone_ali" })), "E_NOT_OWNER");
});

test("dose counter: 212 on the machine, 205 sold, 3 declared tests → gap 4 doses", () => {
  const v = doseVariance({ openReading: 18_400, closeReading: 18_612, dosesSold: 205, dosesOffTill: 3, avgDoseCentimes: 1200 });
  assert.deepEqual(v, { ok: true, reason: null, machineDoses: 212, expectedDoses: 208, gapDoses: 4, gapCentimes: 4800 });
});

test("dose counter reset is reported, not guessed", () => {
  const v = doseVariance({ openReading: 99_990, closeReading: 120, dosesSold: 100 });
  assert.equal(v.ok, false);
  assert.equal(v.reason, "counter_reset");
});

test("dose alert fires after two periods over the threshold", () => {
  const quiet = { machineDoses: 200, gapDoses: 3 };
  const loud = { machineDoses: 200, gapDoses: 20 };
  assert.equal(doseAlert([quiet, loud]), false);
  assert.equal(doseAlert([loud, loud]), true);
  assert.equal(doseAlert([loud, quiet, loud]), false);
  assert.equal(doseAlert([{ machineDoses: 1000, gapDoses: 25 }, { machineDoses: 1000, gapDoses: 31 }]), false); // 3 % of 1000 = 30
});

test("only the device that holds an open bank puts money in it", () => {
  const b = bankScript("dev_phone_ali");
  b.add("bank.opened", { kind: "waiter", holder: "stf_ali", floatCentimes: 0 });
  let s = b.fold();
  assertBankAccepts(s, "dev_phone_ali");
  code(() => assertBankAccepts(s, "dev_till"), "E_NOT_OWNER");
  code(() => assertBankAccepts(null, "dev_phone_ali"), "E_BANK_UNKNOWN");
  // "Remettre ma caisse": the manager takes the bank over at the till and counts it
  b.add("bank.taken_over", { approvedBy: "stf_karim" }, { device: "dev_till" });
  s = b.fold();
  code(() => assertBankAccepts(s, "dev_phone_ali"), "E_NOT_OWNER");
  assertBankAccepts(s, "dev_till");
  b.add("bank.counted", { countedCentimes: 3000 }, { device: "dev_till" });
  s = b.fold();
  code(() => assertBankAccepts(s, "dev_till"), "E_BANK_CLOSED");
});
