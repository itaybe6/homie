/**
 * ===================================
 * בדיקות עומס - אימות משתמשים (Authentication)
 * ===================================
 * 
 * מטרה: לבדוק את יכולת המערכת לטפל בהתחברויות משתמשים מרובות במקביל
 * 
 * תרחישים:
 * 1. התחברות משתמשים
 * 2. שליפת פרטי משתמש מחובר
 * 3. רענון טוקן (Refresh Token)
 * 4. התנתקות (Logout)
 * 
 * נקודות מדידה:
 * - זמן התחברות ממוצע
 * - אחוז הצלחה של התחברויות
 * - זמן טעינת פרופיל משתמש
 * - תפוקה (requests/sec)
 * 
 * הרצה:
 * k6 run --env SUPABASE_URL=your-url --env SUPABASE_ANON_KEY=your-key auth.test.js
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
  loginDuration,
  loginAttempts,
  loginFailures,
  loginSuccessRate,
  validateConfig,
} from './config.js';

// ===================================
// תצורת בדיקה
// ===================================

// תרחיש עומס (ניתן להחליף ל-smoke או stress מתוך scenarios.js)
export const options = loadScenario;

// ===================================
// Setup - הרצה פעם אחת בהתחלה
// ===================================

export function setup() {
  console.log('=== התחלת בדיקות אימות משתמשים ===');
  
  // אימות קונפיגורציה
  validateConfig();
  
  console.log('Setup completed successfully');
  return {};
}

// ===================================
// תרחיש בדיקה ראשי
// ===================================

export default function () {
  // בחירת משתמש רנדומלי לבדיקה
  const testUserEmail = getRandomTestUser();
  const testUserPassword = TEST_USER_PASSWORD;
  
  // =============================
  // שלב 1: התחברות
  // =============================
  
  loginAttempts.add(1);
  
  const loginStartTime = new Date();
  const loginResult = login(testUserEmail, testUserPassword);
  const loginEndTime = new Date();
  
  loginDuration.add(loginEndTime - loginStartTime);
  
  if (!loginResult.success) {
    loginFailures.add(1);
    loginSuccessRate.add(false);
    console.error(`התחברות נכשלה עבור ${testUserEmail}`);
    sleep(randomSleep(1, 3));
    return; // עוצרים את התרחיש אם ההתחברות נכשלה
  }
  
  loginSuccessRate.add(true);
  
  const { accessToken, userId } = loginResult;
  
  check(loginResult, {
    'התחברות הצליחה': (r) => r.success === true,
    'קיבלנו access token': (r) => r.accessToken !== null,
    'קיבלנו user ID': (r) => r.userId !== null,
  });
  
  // השהייה קצרה - מדמה זמן קריאה של הודעת הצלחה
  sleep(randomSleep(0.5, 1.5));
  
  // =============================
  // שלב 2: שליפת פרופיל משתמש
  // =============================
  
  const profileRes = http.get(
    API_ENDPOINTS.AUTH_USER,
    { headers: getHeaders(accessToken) }
  );
  
  check(profileRes, {
    'שליפת פרופיל הצליחה': (r) => r.status === 200,
    'זמן תגובה < 500ms': (r) => r.timings.duration < 500,
    'הפרופיל מכיל אימייל': (r) => {
      try {
        return JSON.parse(r.body).email !== undefined;
      } catch {
        return false;
      }
    },
  });
  
  // השהייה - מדמה זמן שהמשתמש צופה בפרופיל שלו
  sleep(randomSleep(1, 3));
  
  // =============================
  // שלב 3: שליפת נתונים נוספים מהפרופיל (מטבלת users האפליקטיבית)
  // =============================
  
  if (userId) {
    const detailedProfileRes = http.get(
      `${API_ENDPOINTS.USERS}?id=eq.${userId}&select=id,email,full_name,city,age,likes,favorites,created_at,updated_at`,
      { headers: getHeaders(accessToken) }
    );
    
    check(detailedProfileRes, {
      'שליפת פרטי פרופיל מלאים הצליחה': (r) => r.status === 200,
      'זמן תגובה < 300ms': (r) => r.timings.duration < 300,
      'יש נתונים בפרופיל': (r) => {
        try {
          const data = JSON.parse(r.body);
          return Array.isArray(data) && data.length > 0;
        } catch {
          return false;
        }
      },
    });
    
    sleep(randomSleep(0.5, 1));
  }
  
  // =============================
  // שלב 4: רענון טוקן (אופציונלי - 20% מהמשתמשים)
  // =============================
  
  if (Math.random() < 0.2 && loginResult.refreshToken) {
    const refreshPayload = JSON.stringify({
      refresh_token: loginResult.refreshToken,
    });
    
    const refreshRes = http.post(
      API_ENDPOINTS.AUTH_REFRESH,
      refreshPayload,
      { headers: getHeaders() }
    );
    
    check(refreshRes, {
      'רענון טוקן הצליח': (r) => r.status === 200,
      'קיבלנו access token חדש': (r) => {
        try {
          return JSON.parse(r.body).access_token !== undefined;
        } catch {
          return false;
        }
      },
    });
    
    sleep(randomSleep(0.5, 1));
  }
  
  // =============================
  // שלב 5: התנתקות (Logout) - 30% מהמשתמשים
  // =============================
  
  if (Math.random() < 0.3) {
    const logoutRes = http.post(
      API_ENDPOINTS.AUTH_LOGOUT,
      null,
      { headers: getHeaders(accessToken) }
    );
    
    check(logoutRes, {
      'התנתקות הצליחה': (r) => r.status === 204 || r.status === 200,
    });
  }
  
  // השהייה סופית לפני תחילת איטרציה חדשה
  sleep(randomSleep(1, 3));
}

// ===================================
// Teardown - הרצה פעם אחת בסוף
// ===================================

export function teardown(data) {
  console.log('=== סיום בדיקות אימות משתמשים ===');
}

// ===================================
// הערות לניתוח תוצאות
// ===================================

/**
 * מה לחפש בתוצאות:
 * 
 * 1. http_req_duration (p95): צריך להיות מתחת ל-500ms
 *    - אם גבוה יותר: בדוק את זמני התגובה של Supabase Auth
 *    - שקול שימוש ב-Connection Pooling
 * 
 * 2. login_success_rate: צריך להיות מעל 99%
 *    - אם נמוך: בדוק אם משתמשי הבדיקה קיימים ופעילים
 *    - בדוק את מגבלות Rate Limiting ב-Supabase
 * 
 * 3. http_req_failed: צריך להיות מתחת ל-1%
 *    - אם גבוה: בדוק לוגים של Supabase
 *    - אולי יש בעיית RLS (Row Level Security)
 * 
 * 4. זיכרון וביצועים:
 *    - עקוב אחרי מטריקות ה-Database ב-Supabase Dashboard
 *    - שים לב לזמני Connection Pool Wait
 * 
 * המלצות לשיפור:
 * 
 * - הוספת Indexes על טבלת users/profiles (id, email)
 * - שימוש ב-Redis לקישינג של Session Tokens
 * - אופטימיזציה של RLS Policies (הם מוסיפים overhead)
 * - שקול להעביר לוגיקת אימות מורכבת ל-Edge Functions
 * - בדוק אם Connection Pooler מופעל (PgBouncer)
 * 
 * דוגמה ל-Index שימושי:
 * CREATE INDEX CONCURRENTLY idx_profiles_user_id ON profiles(id);
 * CREATE INDEX CONCURRENTLY idx_profiles_email ON profiles(email);
 */
