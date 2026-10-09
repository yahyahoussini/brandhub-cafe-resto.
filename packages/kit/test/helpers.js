// @ts-check
/**
 * Test helpers: build valid event envelopes (docs/03 §4) the way a device does, checked by validateEnvelope and by
 * the writer rule of each type.
 */
import { CLOUD_DEVICE, assertCanWrite, isSequenced, validateEnvelope } from "../src/events.js";
import { newId, uuidv7 } from "../src/ids.js";

/** @typedef {import("../src/events.js").EventEnvelope} EventEnvelope */
/** @typedef {import("../src/events.js").DeviceKind} DeviceKind */

/**
 * A log writer: `emit(device, staff, type, entity, data, at)` gives the next seq per sequenced entity and validates.
 * @param {Record<string, DeviceKind>} kinds device id → kind (dev_cloud may be office or cloud: give `kind` per call)
 */
export function eventLog(kinds) {
  /** @type {EventEnvelope[]} */
  const events = [];
  /** @type {Map<string, number>} */
  const seqs = new Map();
  return {
    events,
    /**
     * @param {{ device: string, staff: string | null, type: string, entity: string, data: Record<string, any>, at: number, kind?: DeviceKind }} e
     */
    emit(e) {
      const seq = isSequenced(e.type) ? (seqs.get(e.entity) ?? 0) + 1 : null;
      if (seq !== null) seqs.set(e.entity, seq);
      const ev = validateEnvelope({ id: uuidv7(e.at), type: e.type, entity: e.entity, seq, device: e.device, staff: e.staff, at: e.at, data: e.data, v: 1 });
      assertCanWrite(ev, e.kind ?? kinds[e.device]);
      events.push(ev);
      return ev;
    },
  };
}

/** Fisher–Yates with a seeded generator, so a failing shuffle can be replayed. */
export function seeded(seed = 1) {
  let x = seed >>> 0 || 1;
  const next = () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 2 ** 32;
  };
  return {
    next,
    /** @param {number} n */
    int: (n) => Math.floor(next() * n),
    /**
     * @template T
     * @param {T[]} a
     */
    shuffle(a) {
      const out = [...a];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}

export { CLOUD_DEVICE, newId };
