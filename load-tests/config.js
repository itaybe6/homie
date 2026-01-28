/**
 * ===================================
 * תצורת בדיקות עומס - Homie App
 * ===================================
 * 
 * קובץ זה מכיל את כל ההגדרות המשותפות לבדיקות העומס:
 * - פרמטרי חיבור ל-Supabase
 * - סף ביצועים (Thresholds)
 * - משתני סביבה
 * - פונקציות עזר
 */

import { check } from 'k6';
import http from 'k6/http';

// ===================================
// משתני סביבה
// ===================================

export const SUPABASE_URL = __ENV.SUPABASE_URL;
export const SUPABASE_ANON_KEY = __ENV.SUPABASE_ANON_KEY;
export const TEST_USER_PASSWORD = __ENV.TEST_USER_PASSWORD;

// רשימת משתמשי בדיקה - יש להפריד באמצעות פסיק
export const TEST_USER_EMAILS = __ENV.TEST_USER_EMAILS 
  ? __ENV.TEST_USER_EMAILS.split(',').map(email => email.trim())
  : [];

// ===================================
// כתובות API
// ===================================

export const API_ENDPOINTS = {
  // Auth endpoints
  AUTH_SIGNUP: `${SUPABASE_URL}/auth/v1/signup`,
  AUTH_LOGIN: `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
  AUTH_USER: `${SUPABASE_URL}/auth/v1/user`,
  AUTH_REFRESH: `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
  AUTH_LOGOUT: `${SUPABASE_URL}/auth/v1/logout`,
  
  // REST API endpoints
  // NOTE: בפרויקט הזה יש טבלת `users` אפליקטיבית (לא auth.users) שמכילה likes/favorites וכו'
  USERS: `${SUPABASE_URL}/rest/v1/users`,
  PROFILES: `${SUPABASE_URL}/rest/v1/profiles`, // ייתכן שלא קיים בכל סביבה - השארנו לתאימות
  APARTMENTS: `${SUPABASE_URL}/rest/v1/apartments`,
  MATCHES: `${SUPABASE_URL}/rest/v1/matches`,
  APARTMENTS_REQUEST: `${SUPABASE_URL}/rest/v1/apartments_request`,
  PROFILE_GROUP_MEMBERS: `${SUPABASE_URL}/rest/v1/profile_group_members`,
  PROFILE_GROUP_INVITES: `${SUPABASE_URL}/rest/v1/profile_group_invites`,
  SURVEY_RESPONSES: `${SUPABASE_URL}/rest/v1/survey_responses`,
};

// ===================================
// כותרות HTTP (Headers)
// ===================================

/**
 * מחזיר כותרות בסיסיות לבקשות Supabase
 * @param {string} accessToken - (אופציונלי) טוקן גישה למשתמש מחובר
 * @returns {Object} כותרות HTTP
 */
export function getHeaders(accessToken = null) {
  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
  };
  
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }
  
  return headers;
}

/**
 * כותרות מומלצות ל-PostgREST ב-insert/update:
 * - Prefer: return=representation כדי לקבל חזרה את הרשומה (במקום גוף ריק)
 */
export function getWriteHeaders(accessToken = null) {
  return {
    ...getHeaders(accessToken),
    Prefer: 'return=representation',
  };
}

// ===================================
// תרחישי עומס (Load Scenarios)
// ===================================

/**
 * Smoke Test - בדיקה קלה לוודא שהכל עובד
 * 10 משתמשים במקביל למשך 30 שניות
 */
export const smokeTestOptions = {
  stages: [
    { duration: '10s', target: 5 },   // עלייה הדרגתית ל-5 משתמשים
    { duration: '20s', target: 10 },  // עלייה ל-10 משתמשים
    { duration: '10s', target: 0 },   // ירידה חזרה ל-0
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000'],  // 95% מהבקשות מתחת לשנייה
    http_req_failed: ['rate<0.05'],     // פחות מ-5% שגיאות
  },
};

/**
 * Load Test - בדיקת עומס רגילה
 * 200 משתמשים במקביל למשך 5 דקות
 */
export const loadTestOptions = {
  stages: [
    { duration: '1m', target: 50 },   // חימום: עלייה ל-50 משתמשים
    { duration: '2m', target: 100 },  // עלייה ל-100 משתמשים
    { duration: '3m', target: 200 },  // עלייה ל-200 משתמשים (שיא)
    { duration: '2m', target: 200 },  // שמירה על 200 משתמשים
    { duration: '1m', target: 0 },    // ירידה הדרגתית
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],   // 95% מהבקשות מתחת ל-500ms
    http_req_failed: ['rate<0.01'],     // פחות מ-1% שגיאות
    http_reqs: ['rate>100'],            // לפחות 100 בקשות לשנייה
  },
};

/**
 * Stress Test - בדיקת גבולות המערכת
 * עלייה הדרגתית עד 1000 משתמשים
 */
export const stressTestOptions = {
  stages: [
    { duration: '2m', target: 100 },   // חימום
    { duration: '3m', target: 300 },   // עלייה מתונה
    { duration: '3m', target: 600 },   // המשך עלייה
    { duration: '3m', target: 1000 },  // דחיפה לגבול
    { duration: '5m', target: 1000 },  // שמירה על עומס מקסימלי
    { duration: '2m', target: 0 },     // ירידה
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],  // 95% מהבקשות מתחת ל-2 שניות (יותר מתירני)
    http_req_failed: ['rate<0.05'],     // פחות מ-5% שגיאות
  },
};

/**
 * Spike Test - בדיקת עומס פתאומי
 * עלייה חדה למספר רב של משתמשים ואז ירידה
 */
export const spikeTestOptions = {
  stages: [
    { duration: '30s', target: 50 },   // התחלה רגילה
    { duration: '30s', target: 500 },  // קפיצה חדה!
    { duration: '1m', target: 500 },   // שמירה על העומס
    { duration: '30s', target: 50 },   // חזרה לרגיעה
    { duration: '30s', target: 0 },    // סיום
  ],
  thresholds: {
    http_req_duration: ['p(95)<1500'],
    http_req_failed: ['rate<0.1'],     // 10% שגיאות מותר בספייק
  },
};

// ===================================
// פונקציות עזר (Helper Functions)
// ===================================

/**
 * מבצע התחברות למשתמש ומחזיר את פרטי ההתחברות
 * @param {string} email - כתובת אימייל
 * @param {string} password - סיסמה
 * @returns {Object} { success, accessToken, userId, error }
 */
export function login(email, password) {
  const loginPayload = JSON.stringify({
    email: email,
    password: password,
  });
  
  const loginRes = http.post(
    API_ENDPOINTS.AUTH_LOGIN,
    loginPayload,
    { headers: getHeaders() }
  );
  
  const loginSuccess = check(loginRes, {
    'התחברות הצליחה': (r) => r.status === 200,
    'התקבל access token': (r) => {
      try {
        return JSON.parse(r.body).access_token !== undefined;
      } catch {
        return false;
      }
    },
  });
  
  if (!loginSuccess) {
    console.error(`Login failed for ${email}: ${loginRes.status} - ${loginRes.body}`);
    return { 
      success: false, 
      accessToken: null, 
      userId: null,
      error: loginRes.body 
    };
  }
  
  const loginData = JSON.parse(loginRes.body);
  return {
    success: true,
    accessToken: loginData.access_token,
    refreshToken: loginData.refresh_token,
    userId: loginData.user?.id,
    user: loginData.user,
    error: null,
  };
}

/**
 * בוחר משתמש רנדומלי מרשימת המשתמשים
 * @returns {string} כתובת אימייל של משתמש
 */
export function getRandomTestUser() {
  if (TEST_USER_EMAILS.length === 0) {
    throw new Error('TEST_USER_EMAILS לא הוגדר או ריק');
  }
  const randomIndex = Math.floor(Math.random() * TEST_USER_EMAILS.length);
  return TEST_USER_EMAILS[randomIndex];
}

/**
 * פונקציית sleep עם זמן רנדומלי
 * מדמה התנהגות משתמש אמיתי
 * @param {number} min - זמן מינימלי בשניות
 * @param {number} max - זמן מקסימלי בשניות
 */
export function randomSleep(min, max) {
  const sleepTime = Math.random() * (max - min) + min;
  return sleepTime;
}

/**
 * מפרסר שגיאות מ-Supabase
 * @param {Object} response - תגובת HTTP
 * @returns {string} הודעת שגיאה
 */
export function parseError(response) {
  try {
    const body = JSON.parse(response.body);
    return body.error_description || body.message || body.msg || 'Unknown error';
  } catch {
    return response.body || 'Failed to parse error';
  }
}

/**
 * מייצר מזהה ייחודי לבקשה (לצורך מעקב)
 * @returns {string} מזהה ייחודי
 */
export function generateRequestId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * בודק אם תשובת HTTP תקינה
 * @param {Object} response - תגובת HTTP
 * @param {number[]} validStatuses - קודי סטטוס תקינים (ברירת מחדל: 200)
 * @returns {boolean}
 */
export function isValidResponse(response, validStatuses = [200]) {
  return validStatuses.includes(response.status);
}

/**
 * מחלץ JSON מתשובה באופן בטוח
 * @param {Object} response - תגובת HTTP
 * @returns {Object|null}
 */
export function safeJsonParse(response) {
  try {
    return JSON.parse(response.body);
  } catch (e) {
    console.error(`Failed to parse JSON: ${e.message}`);
    return null;
  }
}

// ===================================
// מטריקות מותאמות אישית
// ===================================

import { Trend, Counter, Rate } from 'k6/metrics';

// זמני תגובה מותאמים לכל פעולה
export const loginDuration = new Trend('login_duration', true);
export const apartmentLoadDuration = new Trend('apartment_load_duration', true);
export const searchDuration = new Trend('search_duration', true);
export const connectionDuration = new Trend('connection_duration', true);

// מונים
export const loginAttempts = new Counter('login_attempts');
export const loginFailures = new Counter('login_failures');
export const apartmentViews = new Counter('apartment_views');
export const searchQueries = new Counter('search_queries');
export const connectionRequests = new Counter('connection_requests');

// אחוזי הצלחה
export const loginSuccessRate = new Rate('login_success_rate');
export const apartmentLoadSuccessRate = new Rate('apartment_load_success_rate');

// ===================================
// סיכום קונפיגורציה
// ===================================

export function validateConfig() {
  const errors = [];
  
  if (!SUPABASE_URL) {
    errors.push('SUPABASE_URL לא הוגדר');
  }
  
  if (!SUPABASE_ANON_KEY) {
    errors.push('SUPABASE_ANON_KEY לא הוגדר');
  }
  
  if (!TEST_USER_PASSWORD) {
    errors.push('TEST_USER_PASSWORD לא הוגדר');
  }
  
  if (TEST_USER_EMAILS.length === 0) {
    errors.push('TEST_USER_EMAILS לא הוגדר או ריק');
  }
  
  if (errors.length > 0) {
    console.error('שגיאות קונפיגורציה:');
    errors.forEach(err => console.error(`  - ${err}`));
    throw new Error('קונפיגורציה לא תקינה. בדוק את משתני הסביבה.');
  }
  
  console.log('✓ קונפיגורציה תקינה');
  console.log(`  Supabase URL: ${SUPABASE_URL}`);
  console.log(`  מספר משתמשי בדיקה: ${TEST_USER_EMAILS.length}`);
}
