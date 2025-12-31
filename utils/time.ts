export function formatTimeAgoHe(input: string | number | Date): string {
  const date = input instanceof Date ? input : new Date(input);
  const ms = date.getTime();
  if (!Number.isFinite(ms)) return '';

  const diffMs = Math.max(0, Date.now() - ms);
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 24) {
    const h = Math.max(1, hours);
    return h === 1 ? 'לפני שעה' : `לפני ${h} שעות`;
  }

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days < 30) {
    const d = Math.max(1, days);
    return d === 1 ? 'לפני יום' : `לפני ${d} ימים`;
  }

  const months = Math.floor(days / 30);
  const m = Math.max(1, months);
  return m === 1 ? 'לפני חודש' : `לפני ${m} חודשים`;
}


