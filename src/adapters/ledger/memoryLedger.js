// Remembers orders in memory, keyed by the order reference we send to Adyen.
// A restart forgets them. That is enough for this exercise.

export function memoryLedger() {
  const byReference = new Map();

  return {
    record(entry) {
      const previous = byReference.get(entry.reference) ?? { events: [] };
      const next = {
        ...previous,
        ...entry,
        events: [...previous.events, ...(entry.events ?? [])],
        updatedAt: new Date().toISOString(),
      };
      byReference.set(entry.reference, next);
      return next;
    },
    list() {
      return [...byReference.values()].sort((a, b) =>
        String(b.updatedAt).localeCompare(String(a.updatedAt)),
      );
    },
    getByReference(reference) {
      return byReference.get(reference) ?? null;
    },
  };
}
