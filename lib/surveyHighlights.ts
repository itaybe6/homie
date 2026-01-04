import { UserSurveyResponse } from '@/types/database';

export type SurveyHighlight = {
  label: string;
  value: string;
};

export function formatMonthLabel(value?: string | null): string {
  if (!value) return '';
  const [year, month] = value.split('-');
  if (year && month) {
    const yearNum = parseInt(year, 10);
    const monthNum = parseInt(month, 10) - 1;
    if (!Number.isNaN(yearNum) && !Number.isNaN(monthNum)) {
      const date = new Date(yearNum, monthNum, 1);
      if (!Number.isNaN(date.getTime())) {
        try {
          return date.toLocaleDateString('he-IL', { month: 'short', year: 'numeric' });
        } catch {
          return `${month}/${year.slice(-2)}`;
        }
      }
    }
  }
  return value;
}

export function formatCurrencyILS(value?: number | null): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '';
  try {
    return new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: 'ILS',
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `₪${value}`;
  }
}

export function normalizeNeighborhoods(value: unknown): string {
  if (!value) return '';
  if (Array.isArray(value)) return value.filter(Boolean).join(' • ');
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter(Boolean).join(' • ');
    } catch {}
    return value
      .replace(/[{}\[\]"]/g, ' ')
      .split(',')
      .map((segment) => segment.trim())
      .filter(Boolean)
      .join(' • ');
  }
  return '';
}

export function computeSurveyHighlights(survey?: UserSurveyResponse | null): SurveyHighlight[] {
  if (!survey) return [];

  const highlights: SurveyHighlight[] = [];
  const push = (label: string, raw?: string) => {
    if (!raw) return;
    const trimmed = raw.trim();
    if (!trimmed) return;
    highlights.push({ label, value: trimmed });
  };

  push('עיר מועדפת', survey.preferred_city || undefined);
  const neighborhoods = normalizeNeighborhoods((survey as any).preferred_neighborhoods);
  if (neighborhoods) push('שכונות מועדפות', neighborhoods);

  if (typeof survey.price_range === 'number') {
    const formatted = formatCurrencyILS(survey.price_range);
    push('תקציב חודשי', formatted);
  }
  push('כניסה מתוכננת', formatMonthLabel(survey.move_in_month));
  push('וייב יומיומי', (survey as any).lifestyle || survey.home_vibe || undefined);
  if (survey.is_sublet) highlights.push({ label: 'סאבלט', value: 'כן' });

  // Keep it concise for a peek sheet
  return highlights;
}

