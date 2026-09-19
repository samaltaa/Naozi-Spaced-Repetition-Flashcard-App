import { TZDate } from "@date-fns/tz";

// Day boundaries

export function startOfUserDay(now: Date, timezone: string, rolloverHour: number): Date {
  const local = new TZDate(now.getTime(), timezone);
  const start = new TZDate(local.getFullYear(), local.getMonth(), local.getDate(), rolloverHour, 0, 0, timezone);
  if (local.getHours() < rolloverHour) start.setDate(start.getDate() - 1);
  return new Date(start.getTime());
}

export function dueAfterDays(now: Date, days: number, timezone: string, rolloverHour: number): Date {
  const start = new TZDate(startOfUserDay(now, timezone, rolloverHour).getTime(), timezone);
  start.setDate(start.getDate() + days);
  return new Date(start.getTime());
}