/**
 * ===================================
 * תרחישי עומס (Scenarios)
 * ===================================
 *
 * המטרה כאן היא שיהיה מקור אמת אחד להגדרות עומס.
 * כל קובץ בדיקה יכול לבחור: smoke / load / stress.
 *
 * הערה: הדרישות אומרות:
 * - Smoke: 10 משתמשים, 30 שניות
 * - Load: 200 משתמשים, 5 דקות
 * - Stress: עלייה הדרגתית עד 1000 משתמשים
 *
 * Thresholds (ולידציה גלובלית):
 * - p95 < 500ms
 * - error rate < 1%
 *
 * אם Stress נכשל ב-thresholds (כצפוי), זה עדיין מידע חשוב.
 */

export const thresholds = {
  http_req_duration: ['p(95)<500'],
  http_req_failed: ['rate<0.01'],
};

export const smoke = {
  vus: 10,
  duration: '30s',
  thresholds,
};

export const load = {
  stages: [
    { duration: '1m', target: 50 },
    { duration: '1m', target: 200 },
    { duration: '2m', target: 200 },
    { duration: '1m', target: 0 },
  ],
  thresholds,
};

export const stress = {
  stages: [
    { duration: '2m', target: 100 },
    { duration: '2m', target: 300 },
    { duration: '2m', target: 600 },
    { duration: '2m', target: 1000 },
    { duration: '2m', target: 1000 },
    { duration: '2m', target: 0 },
  ],
  thresholds,
};

