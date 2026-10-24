/**
 * Returns the UTC Date corresponding to the start of the local day in `timeZone`.
 * Used by daily post caps and 5:30pm windows.
 */
export function startOfLocalDay(date: Date, timeZone = 'UTC'): Date {
  const tz = timeZone || 'UTC';
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(date).reduce((acc: any, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value;
    return acc;
  }, {});
  // Build local midnight, then shift by the TZ offset to get UTC.
  const localMidnight = new Date(Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day), 0, 0, 0
  ));
  // Find offset by comparing the same instant formatted in tz vs UTC.
  const instantInTz = new Date(localMidnight.toLocaleString('en-US', { timeZone: tz }));
  const instantInUtc = new Date(localMidnight.toLocaleString('en-US', { timeZone: 'UTC' }));
  const offsetMs = instantInTz.getTime() - instantInUtc.getTime();
  return new Date(localMidnight.getTime() + offsetMs);
}

export function getLocalDayKey(date: Date, timeZone = 'UTC'): string {
  const tz = timeZone || 'UTC';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
