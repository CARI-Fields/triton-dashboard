const RFC3339_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-](\d{2}):(\d{2}))$/;
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDateOnly(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = value.match(DATE_ONLY_PATTERN);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  if (year < 100) return false;
  const calendarDate = new Date(0);
  calendarDate.setUTCFullYear(year, month - 1, day);
  calendarDate.setUTCHours(0, 0, 0, 0);
  return calendarDate.getUTCFullYear() === year
    && calendarDate.getUTCMonth() === month - 1
    && calendarDate.getUTCDate() === day;
}

export function isRfc3339Timestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = value.match(RFC3339_PATTERN);
  if (!match) return false;
  const [
    year,
    month,
    day,
    hour,
    minute,
    second,
    offsetHour = 0,
    offsetMinute = 0,
  ] = match.slice(1).map(Number);
  if (
    hour > 23
    || minute > 59
    || second > 59
    || offsetHour > 15
    || offsetMinute > 59
  ) {
    return false;
  }
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  return calendarDate.getUTCFullYear() === year
    && calendarDate.getUTCMonth() === month - 1
    && calendarDate.getUTCDate() === day
    && Number.isFinite(Date.parse(value));
}
