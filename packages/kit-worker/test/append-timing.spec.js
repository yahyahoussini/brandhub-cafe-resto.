// @ts-check
/**
 * The time to append one full push (200 events: 40 cash sales of 5 events) to a client's store, over RPC, in local
 * workerd: the median of 5 runs, each on a fresh client (prompt 04, STATUS). Printed for the build log; not a budget.
 */
import { describe, expect, it } from "vitest";
import { newId } from "@brandhub/kit/ids";
import { MAX_BATCH_EVENTS } from "../src/sync-rules.js";
import { venue } from "./fixtures.js";
import { addOwner, api, codes, count, storeOf } from "./workerd.js";

const RUNS = 5;

describe("append timing", () => {
  it(`appends one ${MAX_BATCH_EVENTS}-event batch: median of ${RUNS} runs, a fresh client each`, async () => {
    /** @type {number[]} */
    const runs = [];
    for (let i = 0; i < RUNS; i++) {
      const v = venue();
      const { till, sara } = v.ids;
      const stub = storeOf(v.ids.tenant);
      await addOwner(stub, v.ids.owner);
      expect(codes(await api(stub).append(v.setup(), v.callers.office))).toEqual([]);
      const bank = newId("bnk");
      const opened = v.ev({
        device: till,
        staff: sara,
        type: "bank.opened",
        entity: bank,
        data: { kind: "till", holder: sara, floatCentimes: 50000 },
      });
      expect(codes(await api(stub).append([opened], v.callers.till))).toEqual([]);

      const batch = [];
      for (let n = 1; batch.length < MAX_BATCH_EVENTS; n++) {
        const sale = v.sale({
          device: till,
          staff: sara,
          bank,
          lines: [
            ["noir", 1],
            ["msemen", 1],
          ],
          pay: { tender: "cash", amount: 1500, tendered: 2000 },
          receiptNo: `C1-${String(n).padStart(6, "0")}`,
        });
        batch.push(...sale.events);
      }
      expect(batch).toHaveLength(MAX_BATCH_EVENTS);
      const before = await count(stub, "events");

      const t0 = performance.now();
      const r = await api(stub).append(batch, v.callers.till);
      runs.push(performance.now() - t0);

      expect(r.rejected).toEqual([]);
      expect(r.accepted).toHaveLength(MAX_BATCH_EVENTS);
      expect(await count(stub, "events")).toBe(before + MAX_BATCH_EVENTS);
      expect(await api(stub).dailyReport(v.businessDay)).toMatchObject({ revenueCentimes: 40 * 1500 });
    }
    const median = Math.round([...runs].sort((a, b) => a - b)[Math.floor(RUNS / 2)]);
    console.log(`append ${MAX_BATCH_EVENTS} events: ${median} ms (median of ${RUNS}, local workerd)`);
    console.log(`  runs: ${runs.map((ms) => Math.round(ms)).join(", ")} ms`);
    expect(median).toBeGreaterThan(0);
  });
});
