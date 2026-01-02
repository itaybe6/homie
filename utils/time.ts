export function formatTimeAgoHe(input: string | number | Date): string {
  const date = input instanceof Date ? input : new Date(input);
  const ms = date.getTime();
  if (!Number.isFinite(ms)) return '';

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


