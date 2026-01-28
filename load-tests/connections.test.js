/**
 * ===================================
 * בדיקות עומס - חיבורים בין משתמשים (Connections / Matches)
 * ===================================
 *
 * מטרה: לבדוק עומס על תהליכי בקשת חיבור (match request) ושליפת רשימות חיבורים.
 *
 * בפרויקט הזה נראה שהפיצ'ר ממומש באמצעות טבלת `matches`:
 * - sender_id
 * - receiver_id
 * - receiver_group_id (אופציונלי)
 * - sender_group_id (אופציונלי)
 * - status: PENDING/APPROVED/REJECTED/CANCELLED/NOT_RELEVANT
 *
 * תרחיש:
 * 1) התחברות
 * 2) בחירת משתמש יעד רנדומלי
 * 3) יצירת בקשת חיבור (insert to matches)
 * 4) שליפת sent/received matches
 *
 * Endpoints נבדקים:
 * - POST /auth/v1/token?grant_type=password
 * - GET  /rest/v1/users?select=id&...
 * - POST /rest/v1/matches
 * - GET  /rest/v1/matches?sender_id=eq...
 * - GET  /rest/v1/matches?receiver_id=eq...
 */

import { sleep, check } from 'k6';
import http from 'k6/http';
import { load as loadScenario } from './scenarios.js';
import {
  getHeaders,
  getWriteHeaders,
  login,
  getRandomTestUser,
  randomSleep,
  API_ENDPOINTS,
  TEST_USER_PASSWORD,
  connectionDuration,
  connectionRequests,
  validateConfig,
  safeJsonParse,
} from './config.js';

export const options = loadScenario;

export function setup() {
  console.log('=== התחלת בדיקות חיבורים ===');
  validateConfig();
  return {};
}

function pickRandomUserId(excludeUserId, accessToken) {
  // שולפים אצווה קטנה ומגרילים ממנה
  const res = http.get(
    `${API_ENDPOINTS.USERS}?select=id&limit=50`,
    { headers: getHeaders(accessToken) }
  );

  const ok = check(res, {
    'שליפת משתמשים לחיבור הצליחה': (r) => r.status === 200,
    'זמן תגובה < 500ms (users)': (r) => r.timings.duration < 500,
  });

  if (!ok) return null;
  const rows = safeJsonParse(res) || [];
  const ids = (Array.isArray(rows) ? rows : [])
    .map((r) => r && r.id)
    .filter((id) => !!id && String(id) !== String(excludeUserId));

  if (!ids.length) return null;
  return ids[Math.floor(Math.random() * ids.length)];
}

export default function () {
  const email = getRandomTestUser();
  const pw = TEST_USER_PASSWORD;

  const auth = login(email, pw);
  if (!auth.success) {
    sleep(randomSleep(1, 3));
    return;
  }

  const { accessToken, userId } = auth;
  if (!userId) {
    sleep(randomSleep(1, 2));
    return;
  }

  sleep(randomSleep(0.3, 0.9));

  // =============================
  // שלב 1: בחירת יעד לבקשת חיבור
  // =============================
  const targetUserId = pickRandomUserId(userId, accessToken);
  if (!targetUserId) {
    // אם אין יעד (למשל RLS מונע select), עדיין נריץ שליפות matches כדי למדוד ביצועים
    console.warn('לא הצלחתי לבחור משתמש יעד (ייתכן RLS). מדלג על insert.');
  }

  // =============================
  // שלב 2: יצירת בקשת חיבור (insert)
  // =============================
  if (targetUserId && Math.random() < 0.6) {
    // 60% מהאיטרציות שולחות בקשה חדשה
    connectionRequests.add(1);
    const payload = JSON.stringify({
      sender_id: userId,
      receiver_id: targetUserId,
      status: 'PENDING',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const t0 = Date.now();
    const createRes = http.post(API_ENDPOINTS.MATCHES, payload, {
      headers: getWriteHeaders(accessToken),
    });
    connectionDuration.add(Date.now() - t0);

    check(createRes, {
      'יצירת match החזירה 201/200': (r) => r.status === 201 || r.status === 200,
      'זמן תגובה < 500ms (insert match)': (r) => r.timings.duration < 500,
    });
  }

  sleep(randomSleep(0.5, 1.5));

  // =============================
  // שלב 3: שליפת בקשות חיבור שנשלחו
  // =============================
  const t1 = Date.now();
  const sentRes = http.get(
    `${API_ENDPOINTS.MATCHES}?sender_id=eq.${userId}&select=id,sender_id,receiver_id,status,created_at&order=created_at.desc&limit=20`,
    { headers: getHeaders(accessToken) }
  );
  connectionDuration.add(Date.now() - t1);

  check(sentRes, {
    'שליפת sent matches הצליחה': (r) => r.status === 200,
    'זמן תגובה < 500ms (sent)': (r) => r.timings.duration < 500,
  });

  sleep(randomSleep(0.3, 1.0));

  // =============================
  // שלב 4: שליפת בקשות חיבור שהתקבלו
  // =============================
  const t2 = Date.now();
  const recvRes = http.get(
    `${API_ENDPOINTS.MATCHES}?receiver_id=eq.${userId}&select=id,sender_id,receiver_id,status,created_at&order=created_at.desc&limit=20`,
    { headers: getHeaders(accessToken) }
  );
  connectionDuration.add(Date.now() - t2);

  check(recvRes, {
    'שליפת received matches הצליחה': (r) => r.status === 200,
    'זמן תגובה < 500ms (received)': (r) => r.timings.duration < 500,
  });

  sleep(randomSleep(1, 3));
}

export function teardown() {
  console.log('=== סיום בדיקות חיבורים ===');
}

