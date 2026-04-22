export const ADMIN_UIDS: ReadonlySet<string> = new Set([
  "PPnxvAX9yIbqGTWtUPWUmYXvKBm2",
  "kU8Jm1Ubh1b4ikC9DQjY3ga0g4J2",
  "QPOaRxnLdBZCmO9RENmhzdfmuzz1",
  "94QSjmXHwEhrTHudkoimyJAsiJ43",
]);

export function isAdmin(uid: string | undefined | null): boolean {
  return uid != null && ADMIN_UIDS.has(uid);
}
