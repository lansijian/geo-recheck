import type { Measurement } from "../types";

const SHOWCASE_RECORD_PREFIX = "geo-recheck:showcase-record:v1:";

export function saveShowcaseSessionRecord(record: Measurement): void {
  sessionStorage.setItem(`${SHOWCASE_RECORD_PREFIX}${record.id}`, JSON.stringify(record));
}

export function loadShowcaseSessionRecord(id: string): Measurement | null {
  const raw = sessionStorage.getItem(`${SHOWCASE_RECORD_PREFIX}${id}`);
  if (!raw) return null;
  try {
    const record = JSON.parse(raw) as Measurement;
    return record.id === id ? record : null;
  } catch {
    sessionStorage.removeItem(`${SHOWCASE_RECORD_PREFIX}${id}`);
    return null;
  }
}
