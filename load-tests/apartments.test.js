/**
 * ===================================
 * בדיקות עומס - דירות (Apartments)
 * ===================================
 * 
 * מטרה: לבדוק את יכולת המערכת לטעון ולהציג דירות למספר רב של משתמשים
 * 
 * תרחישים:
 * 1. טעינת פיד דירות (Apartments Feed)
 * 2. צפייה בדירה בודדת (Single Apartment View)
 * 3. טעינת תמונות דירה
 * 4. הוספת דירה למועדפים (Favorites/Likes)
 * 5. שליפת דירות לפי משתמש
 * 
 * נקודות מדידה:
 * - זמן טעינת פיד דירות
 * - מספר דירות שנטענו
 * - זמן טעינת דירה בודדת
 * - אחוז הצלחה של פעולות
 * 
 * הרצה:
 * k6 run --env SUPABASE_URL=your-url --env SUPABASE_ANON_KEY=your-key apartments.test.js
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
  apartmentLoadDuration,
  apartmentViews,
  apartmentLoadSuccessRate,
  validateConfig,
  safeJsonParse,
} from './config.js';

// ===================================
// תצורת בדיקה
// ===================================

export const options = loadScenario;

// ===================================
// Setup
// ===================================

export function setup() {
  console.log('=== התחלת בדיקות דירות ===');
  validateConfig();
  
  // נסיון לשלוף מספר דירות לדוגמה (בלי אימות)
  // זה יעזור לנו לוודא שיש דאטה
  const apartmentsRes = http.get(
    `${API_ENDPOINTS.APARTMENTS}?select=id&limit=10`,
    { headers: getHeaders() }
  );
  
  if (apartmentsRes.status === 200) {
    const apartments = safeJsonParse(apartmentsRes);
    if (apartments && apartments.length > 0) {
      console.log(`✓ נמצאו ${apartments.length} דירות בדאטהבייס`);
      return { apartmentIds: apartments.map(a => a.id) };
    }
  }
  
  console.warn('⚠ לא נמצאו דירות. חלק מהבדיקות עלולות להיכשל.');
  return { apartmentIds: [] };
}

// ===================================
// תרחיש בדיקה ראשי
// ===================================

export default function (data) {
  const testUserEmail = getRandomTestUser();
  const testUserPassword = TEST_USER_PASSWORD;
  
  // =============================
  // שלב 1: התחברות
  // =============================
  
  const loginResult = login(testUserEmail, testUserPassword);
  
  if (!loginResult.success) {
    console.error(`התחברות נכשלה עבור ${testUserEmail}`);
    sleep(randomSleep(1, 3));
    return;
  }
  
  const { accessToken, userId } = loginResult;
  sleep(randomSleep(0.3, 0.8));
  
  // =============================
  // שלב 2: טעינת פיד דירות (Apartments Feed)
  // =============================
  
  apartmentViews.add(1);
  const feedStartTime = new Date();
  
  // שליפת דירות עם שדות דומים למסכים באפליקציה (Map/Home)
  // Endpoint נבדק: GET /rest/v1/apartments?select=...
  const feedRes = http.get(
    `${API_ENDPOINTS.APARTMENTS}?select=id,title,address,city,price,image_urls,partner_ids,roommate_capacity,max_roommates,owner_id,pets_allowed,is_furnished,wheelchair_accessible,has_safe_room,has_elevator,kosher_kitchen,has_air_conditioning,has_solar_heater,is_renovated,balcony_count&limit=20&order=created_at.desc`,
    { headers: getHeaders(accessToken) }
  );
  
  const feedEndTime = new Date();
  apartmentLoadDuration.add(feedEndTime - feedStartTime);
  
  const feedSuccess = check(feedRes, {
    'טעינת פיד הצליחה': (r) => r.status === 200,
    'זמן תגובה < 500ms': (r) => r.timings.duration < 500,
    'הפיד מכיל דירות': (r) => {
      const apartments = safeJsonParse(r);
      return apartments && apartments.length > 0;
    },
    'כל דירה מכילה נתונים בסיסיים': (r) => {
      const apartments = safeJsonParse(r);
      if (!apartments || apartments.length === 0) return false;
      
      // בודקים שלפחות הדירה הראשונה מכילה נתונים חשובים
      const firstApartment = apartments[0];
      return firstApartment.id && 
             firstApartment.owner_id !== undefined &&
             firstApartment.city !== undefined;
    },
  });
  
  apartmentLoadSuccessRate.add(feedSuccess);
  
  let apartments = [];
  if (feedSuccess) {
    apartments = safeJsonParse(feedRes) || [];
  }
  
  // משתמש גולש בפיד - השהייה
  sleep(randomSleep(2, 5));
  
  // =============================
  // שלב 3: צפייה בדירה בודדת
  // =============================
  
  if (apartments.length > 0 || (data.apartmentIds && data.apartmentIds.length > 0)) {
    // בוחרים דירה רנדומלית
    let apartmentId;
    if (apartments.length > 0) {
      const randomApartment = apartments[Math.floor(Math.random() * apartments.length)];
      apartmentId = randomApartment.id;
    } else {
      apartmentId = data.apartmentIds[Math.floor(Math.random() * data.apartmentIds.length)];
    }
    
    // שליפת פרטי דירה מלאים
    const apartmentRes = http.get(
      `${API_ENDPOINTS.APARTMENTS}?id=eq.${apartmentId}&select=*`,
      { headers: getHeaders(accessToken) }
    );
    
    check(apartmentRes, {
      'שליפת דירה הצליחה': (r) => r.status === 200,
      'זמן תגובה < 300ms': (r) => r.timings.duration < 300,
      'הדירה מכילה נתונים': (r) => {
        const apt = safeJsonParse(r);
        return apt && apt.length > 0;
      },
    });
    
    // משתמש קורא את פרטי הדירה
    sleep(randomSleep(3, 8));
    
    // =============================
    // שלב 4: הוספת דירה למועדפים (50% מהמשתמשים)
    // =============================
    
    if (Math.random() < 0.5) {
      // בפרויקט הזה לייקים נשמרים בעמודה users.likes (מערך של apartment ids)
      // Endpoints נבדקים:
      // - GET /rest/v1/users?id=eq.<me>&select=likes
      // - PATCH /rest/v1/users?id=eq.<me> { likes: [...] }

      const currentLikesRes = http.get(
        `${API_ENDPOINTS.USERS}?id=eq.${userId}&select=likes`,
        { headers: getHeaders(accessToken) }
      );

      const likesOk = check(currentLikesRes, {
        'שליפת likes הצליחה': (r) => r.status === 200,
        'זמן תגובה < 250ms': (r) => r.timings.duration < 250,
      });

      if (likesOk) {
        let currentLikes = [];
        try {
          const rows = JSON.parse(currentLikesRes.body);
          currentLikes = Array.isArray(rows) && rows[0] && Array.isArray(rows[0].likes) ? rows[0].likes : [];
        } catch {
          currentLikes = [];
        }

        const alreadyLiked = currentLikes.includes(apartmentId);
        const nextLikes = alreadyLiked ? currentLikes : Array.from(new Set([...currentLikes, apartmentId]));

        const updateLikesRes = http.patch(
          `${API_ENDPOINTS.USERS}?id=eq.${userId}`,
          JSON.stringify({ likes: nextLikes, updated_at: new Date().toISOString() }),
          { headers: getWriteHeaders(accessToken) }
        );

        check(updateLikesRes, {
          'עדכון likes הצליח': (r) => r.status === 200 || r.status === 204,
          'זמן תגובה < 300ms': (r) => r.timings.duration < 300,
        });
      }
      
      sleep(randomSleep(0.5, 1));
    }
  }
  
  // =============================
  // שלב 5: שליפת דירות של המשתמש (30% מהמשתמשים)
  // =============================
  
  if (Math.random() < 0.3) {
    const myApartmentsRes = http.get(
      `${API_ENDPOINTS.APARTMENTS}?user_id=eq.${userId}&select=*`,
      { headers: getHeaders(accessToken) }
    );
    
    check(myApartmentsRes, {
      'שליפת דירות המשתמש הצליחה': (r) => r.status === 200,
      'זמן תגובה < 400ms': (r) => r.timings.duration < 400,
    });
    
    sleep(randomSleep(2, 4));
  }
  
  // =============================
  // שלב 6: סינון דירות לפי עיר (20% מהמשתמשים)
  // =============================
  
  if (Math.random() < 0.2) {
    const cities = ['תל אביב', 'ירושלים', 'חיפה', 'באר שבע', 'ראשון לציון'];
    const randomCity = cities[Math.floor(Math.random() * cities.length)];
    
    const cityFilterRes = http.get(
      `${API_ENDPOINTS.APARTMENTS}?city=eq.${encodeURIComponent(randomCity)}&select=*&limit=10`,
      { headers: getHeaders(accessToken) }
    );
    
    check(cityFilterRes, {
      'סינון לפי עיר הצליח': (r) => r.status === 200,
      'זמן תגובה < 600ms': (r) => r.timings.duration < 600,
    });
    
    sleep(randomSleep(1, 3));
  }
  
  // =============================
  // שלב 7: שליפת דירות מועדפות (Favorites) - 25% מהמשתמשים
  // =============================
  
  if (Math.random() < 0.25) {
    // שליפת likes מהמשתמש ואז טעינת הדירות לפי id in (...)
    const likesRes = http.get(
      `${API_ENDPOINTS.USERS}?id=eq.${userId}&select=likes`,
      { headers: getHeaders(accessToken) }
    );

    let likeIds = [];
    try {
      const rows = JSON.parse(likesRes.body);
      likeIds = Array.isArray(rows) && rows[0] && Array.isArray(rows[0].likes) ? rows[0].likes : [];
    } catch {
      likeIds = [];
    }

    check(likesRes, {
      'שליפת likes למועדפים הצליחה': (r) => r.status === 200,
      'זמן תגובה < 300ms': (r) => r.timings.duration < 300,
    });

    if (Array.isArray(likeIds) && likeIds.length > 0) {
      const ids = likeIds.slice(0, 20).map((id) => `"${String(id).replace(/"/g, '')}"`).join(',');
      const likedAptsRes = http.get(
        `${API_ENDPOINTS.APARTMENTS}?id=in.(${ids})&select=id,title,city,price,image_urls&limit=20`,
        { headers: getHeaders(accessToken) }
      );

      check(likedAptsRes, {
        'שליפת דירות שאהבתי הצליחה': (r) => r.status === 200,
        'זמן תגובה < 700ms': (r) => r.timings.duration < 700,
      });
    }
    
    sleep(randomSleep(2, 4));
  }
  
  // השהייה סופית
  sleep(randomSleep(1, 2));
}

// ===================================
// Teardown
// ===================================

export function teardown(data) {
  console.log('=== סיום בדיקות דירות ===');
}

// ===================================
// הערות לניתוח תוצאות
// ===================================

/**
 * מה לחפש בתוצאות:
 * 
 * 1. apartment_load_duration (p95): צריך להיות מתחת ל-500ms
 *    - אם גבוה: בדוק Indexes על טבלת apartments
 *    - שקול Pagination יעילה יותר
 * 
 * 2. apartment_load_success_rate: צריך להיות מעל 99%
 *    - אם נמוך: בדוק RLS Policies
 *    - וודא שאין בעיות בשליפת Foreign Keys (profiles)
 * 
 * 3. שאילתות מורכבות (עם JOIN ל-profiles):
 *    - בדוק את הביצועים של JOIN
 *    - שקול שימוש ב-Materialized Views לדירות פופולריות
 * 
 * המלצות לשיפור ביצועים:
 * 
 * 1. Indexes חשובים:
 *    CREATE INDEX CONCURRENTLY idx_apartments_created_at ON apartments(created_at DESC);
 *    CREATE INDEX CONCURRENTLY idx_apartments_user_id ON apartments(user_id);
 *    CREATE INDEX CONCURRENTLY idx_apartments_city ON apartments(city);
 *    CREATE INDEX CONCURRENTLY idx_apartments_price ON apartments(price);
 *    -- אם likes נשמרים כ-array בתוך users.likes, אין join table.
 *    -- אם בעתיד תעברו ל-join table, זה index חשוב:
 *    -- CREATE INDEX CONCURRENTLY idx_apartment_likes_user_apartment ON apartment_likes(user_id, apartment_id);
 * 
 * 2. אופטימיזציה של SELECT:
 *    - במקום select=*, בחר רק את השדות הנדרשים
 *    - לדוגמה: select=id,title,price,city,image_url,user_id,profiles(full_name,avatar_url)
 * 
 * 3. Pagination:
 *    - השתמש ב-limit וב-offset
 *    - או עדיף: Cursor-based pagination (לפי created_at או id)
 * 
 * 4. Caching:
 *    - שקול קישינג של דירות פופולריות ב-Redis
 *    - Cache-Control headers לתמונות
 * 
 * 5. RLS Optimization:
 *    - RLS Policies יכולים להיות איטיים
 *    - וודא שה-Policies משתמשים ב-Indexes
 *    - לדוגמה:
 *      CREATE POLICY "apartments_select" ON apartments
 *      FOR SELECT USING (
 *        is_active = true AND
 *        (is_public = true OR user_id = auth.uid())
 *      );
 * 
 * 6. Foreign Key Joins:
 *    - JOIN ל-profiles יכול להיות יקר
 *    - שקול denormalization של שדות כמו full_name ב-apartments
 *    - או שימוש ב-View שמקשר את הטבלאות
 * 
 * 7. Image Loading:
 *    - ודא שתמונות נטענות מ-CDN (Supabase Storage)
 *    - השתמש ב-Thumbnails לפיד ובתמונות מלאות לדף הדירה
 * 
 * 8. Monitoring:
 *    - עקוב אחרי Query Performance ב-Supabase Dashboard
 *    - שים לב ל-Slow Queries (מעל 100ms)
 *    - בדוק Index Usage Stats
 */
