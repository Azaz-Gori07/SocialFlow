/**
 * Fan-out confirmation threshold for account-level publishing targeting.
 * MUST stay in sync with FANOUT_CONFIRM_THRESHOLD in
 * server/src/features/social/targeting.ts (the server enforces it; this
 * constant only decides when the confirmation step appears in the UI).
 * Selections at or above this size require an explicit confirmation.
 */
export const FANOUT_CONFIRM_THRESHOLD = 20;
