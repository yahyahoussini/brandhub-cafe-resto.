// @ts-check
/**
 * The sync badge's state (D15): red "Hors ligne depuis N min" after 10 minutes without contact, orange "N en attente"
 * while events wait to be sent, green "Synchronisé" otherwise.
 */

export const OFFLINE_AFTER_MIN = 10;

/** @typedef {{ state: "synced" | "pending" | "offline", pending: number, minutes: number }} SyncState */

/**
 * @param {{ pending: number, lastContactAt: number | null, now: number }} input epoch milliseconds; `lastContactAt`
 *   is null before the first contact
 * @returns {SyncState}
 */
export function syncState({ pending, lastContactAt, now }) {
  if (!Number.isInteger(pending) || pending < 0) throw new RangeError(`pending must be a count, got ${pending}`);
  if (!Number.isFinite(now)) throw new RangeError(`now must be epoch milliseconds, got ${now}`);
  if (lastContactAt !== null && !Number.isFinite(lastContactAt)) {
    throw new RangeError(`lastContactAt must be epoch milliseconds or null, got ${lastContactAt}`);
  }
  const minutes = lastContactAt === null ? Infinity : Math.max(0, Math.floor((now - lastContactAt) / 60000));
  if (minutes >= OFFLINE_AFTER_MIN) return { state: "offline", pending, minutes };
  if (pending > 0) return { state: "pending", pending, minutes };
  return { state: "synced", pending, minutes };
}
