function parseDateInput(input: string | number | Date): Date | null {
  if (input instanceof Date) {
    const ms = input.getTime();
    return Number.isFinite(ms) ? input : null;
  }

  if (typeof input === 'number') {
    const d = new Date(input);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  const raw = String(input ?? '').trim();
  if (!raw) return null;

  // Supabase/PostgREST can return `timestamp` (without timezone) values like:
  // - "2026-02-23T12:34:56"
  // - "2026-02-23 12:34:56"
  // JS treats these as *local time*, but in many DB setups they're stored as UTC.
  // If there's no timezone suffix (Z / ±HH:MM), force UTC by appending "Z".
  const normalized = raw.includes(' ') && !raw.includes('T') ? raw.replace(' ', 'T') : raw;
  const hasTimezoneSuffix = /([zZ]|[+-]\d{2}:?\d{2})$/.test(normalized);
  const looksLikeIsoNoTz =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?$/.test(normalized) && !hasTimezoneSuffix;

  const d = new Date(looksLikeIsoNoTz ? `${normalized}Z` : normalized);
  return Number.isFinite(d.getTime()) ? d : null;
}

export function formatTimeAgoHe(input: string | number | Date): string {
  const date = parseDateInput(input);
  if (!date) return '';

  const ms = date.getTime();
  const diffMs = Math.max(0, Date.now() - ms);
  const minutes = Math.floor(diffMs / (1000 * 60));
  if (minutes < 1) return 'לפני רגע';
  if (minutes < 60) {
    return minutes === 1 ? 'לפני דקה' : `לפני ${minutes} דקות`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? 'לפני שעה' : `לפני ${hours} שעות`;

  const days = Math.floor(hours / 24);
  if (days < 30) return days === 1 ? 'לפני יום' : `לפני ${days} ימים`;

  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? 'לפני חודש' : `לפני ${months} חודשים`;

  const years = Math.floor(months / 12);
  return years === 1 ? 'לפני שנה' : `לפני ${years} שנים`;
}

export function formatDateTimeHe(input: string | number | Date): string {
  const date = parseDateInput(input);
  if (!date) return '';
  return date.toLocaleString('he-IL');
}

export function formatDateHe(input: string | number | Date): string {
  const date = parseDateInput(input);
  if (!date) return '';
  return date.toLocaleDateString('he-IL');
}

export function toEpochMs(input: string | number | Date): number | null {
  const date = parseDateInput(input);
  if (!date) return null;
  const ms = date.getTime();
  return Number.isFinite(ms) ? ms : null;
}


