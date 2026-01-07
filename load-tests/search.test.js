/**
 * ===================================
 * בדיקות עומס - חיפוש דירות עם פילטרים (Search)
 * ===================================
 *
 * מטרה: לבדוק את ביצועי החיפוש/סינון בצד ה-Backend (PostgREST + PostgreSQL).
 *
 * תרחישים ריאליסטיים:
 * 1) התחברות משתמש בדיקה
 * 2) חיפוש דירות לפי עיר + טווח מחיר + מספר שותפים
 * 3) חיפוש חוזר עם וריאציות שונות (מדמה משתמשים שמנסים כמה פילטרים)
 *
 * Endpoints נבדקים:
 * - POST /auth/v1/token?grant_type=password
 * - GET  /rest/v1/apartments?... (PostgREST filters)
 *
 * מה חשוב לבדוק בתוצאות:
 * - p95 < 500ms (יעד)
 * - error rate < 1%
 * - אם יש חריגות: לרוב זה Index חסר או RLS policy כבדה
 */

import { sleep, check } from 'k6';
import http from 'k6/http';
import { load as loadScenario } from './scenarios.js';
import {
  getHeaders,
  login,
  getRandomTestUser,
  randomSleep,
  API_ENDPOINTS,
  TEST_USER_PASSWORD,
  searchDuration,
  searchQueries,
  validateConfig,
  safeJsonParse,
} from './config.js';

export const options = loadScenario;

export function setup() {
  console.log('=== התחלת בדיקות חיפוש דירות ===');
  validateConfig();
  return {};
}

function buildApartmentSearchUrl({ city, minPrice, maxPrice, minRoommates }) {
  const params = [];
  params.push('select=id,title,city,price,roommate_capacity,max_roommates,owner_id');
  params.push('limit=20');
  params.push('order=created_at.desc');

  // עיר: עדיף ilike כדי לתמוך בוריאציות כתיב (וגם בעברית זה עובד בתלויות קולציה)
  if (city) {
    const c = String(city).trim();
    if (c) params.push(`city=ilike.*${encodeURIComponent(c)}*`);
  }

  // טווח מחיר
  if (typeof minPrice === 'number') params.push(`price=gte.${Math.max(0, Math.floor(minPrice))}`);
  if (typeof maxPrice === 'number') params.push(`price=lte.${Math.max(0, Math.floor(maxPrice))}`);

  // מספר שותפים/מקסימום דיירים: בפרויקט יש roommate_capacity ולעיתים max_roommates.
  // כאן אנחנו מסננים רק לפי roommate_capacity כדי לשמור את השאילתה פשוטה.
  if (typeof minRoommates === 'number') params.push(`roommate_capacity=gte.${Math.max(0, Math.floor(minRoommates))}`);

  return `${API_ENDPOINTS.APARTMENTS}?${params.join('&')}`;
}

export default function () {
  const email = getRandomTestUser();
  const pw = TEST_USER_PASSWORD;

  const auth = login(email, pw);
  if (!auth.success) {
    sleep(randomSleep(1, 3));
    return;
  }

  const { accessToken } = auth;
  sleep(randomSleep(0.3, 0.9));

  // וריאציות חיפוש
  const cities = ['תל אביב', 'ירושלים', 'חיפה', 'באר שבע', 'ראשון לציון'];
  const city = cities[Math.floor(Math.random() * cities.length)];

  const minPrice = [1500, 2500, 3500, 4500, 6000][Math.floor(Math.random() * 5)];
  const maxPrice = minPrice + [1500, 2500, 4000][Math.floor(Math.random() * 3)];
  const minRoommates = [1, 2, 3, 4][Math.floor(Math.random() * 4)];

  const url = buildApartmentSearchUrl({ city, minPrice, maxPrice, minRoommates });

  searchQueries.add(1);
  const t0 = Date.now();
  const res = http.get(url, { headers: getHeaders(accessToken) });
  searchDuration.add(Date.now() - t0);

  const ok = check(res, {
    'חיפוש החזיר 200': (r) => r.status === 200,
    'זמן תגובה < 500ms': (r) => r.timings.duration < 500,
    'הגוף הוא מערך JSON': (r) => {
      const data = safeJsonParse(r);
      return Array.isArray(data);
    },
  });

  // בדיקת sanity: אם יש תוצאות, ודא שהשדות הבסיסיים קיימים
  if (ok) {
    const rows = safeJsonParse(res) || [];
    if (rows.length > 0) {
      const first = rows[0] || {};
      check(first, {
        'תוצאה מכילה id': (x) => !!x.id,
        'תוצאה מכילה city': (x) => x.city !== undefined,
        'תוצאה מכילה price': (x) => x.price !== undefined,
      });
    }
  }

  // משתמש משנה פילטרים פעם נוספת (30% מהאיטרציות)
  if (Math.random() < 0.3) {
    sleep(randomSleep(0.8, 1.8));
    const city2 = cities[Math.floor(Math.random() * cities.length)];
    const url2 = buildApartmentSearchUrl({
      city: city2,
      minPrice: minPrice,
      maxPrice: maxPrice,
      minRoommates: Math.max(1, minRoommates - 1),
    });
    searchQueries.add(1);
    const t1 = Date.now();
    const res2 = http.get(url2, { headers: getHeaders(accessToken) });
    searchDuration.add(Date.now() - t1);
    check(res2, {
      'חיפוש שני החזיר 200': (r) => r.status === 200,
      'זמן תגובה < 500ms (חיפוש שני)': (r) => r.timings.duration < 500,
    });
  }

  sleep(randomSleep(1, 3));
}

export function teardown() {
  console.log('=== סיום בדיקות חיפוש דירות ===');
}

