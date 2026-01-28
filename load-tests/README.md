## Homie — Load Testing (k6 + Supabase)

המטרה: **בדיקות עומס ל-Backend בלבד** (Supabase Auth + PostgREST + PostgreSQL). אין UI, אין React Native.

### מבנה

- `load-tests/config.js`: תצורה משותפת + helpers + metrics
- `load-tests/scenarios.js`: Smoke / Load / Stress + thresholds
- `load-tests/auth.test.js`: התחברות + שליפת משתמש + refresh/logout
- `load-tests/apartments.test.js`: פיד דירות + דירה בודדת + likes (דרך `users.likes`)
- `load-tests/search.test.js`: חיפוש דירות לפי עיר/מחיר/שותפים (PostgREST filters)
- `load-tests/connections.test.js`: בקשת חיבור + שליפת sent/received דרך `matches`
- `load-tests/env.example`: קובץ דוגמה למשתני סביבה (לא `.env` כדי לא להיחסם)

### משתני סביבה (חובה)

- **`SUPABASE_URL`**: לדוגמה `https://xxxx.supabase.co`
- **`SUPABASE_ANON_KEY`**: anon key
- **`TEST_USER_EMAILS`**: רשימת אימיילים מופרדת בפסיקים
- **`TEST_USER_PASSWORD`**: סיסמה משותפת למשתמשי הבדיקה

### התקנה

הסקריפטים דורשים `k6` מותקן מקומית.

- Windows (מומלץ): התקנה דרך `choco install k6` (אם יש Chocolatey)
- חלופה: התקנה לפי התיעוד הרשמי של k6

### הרצה (דוגמאות CLI)

#### אופציה 1 — `--env` בכל הרצה (Cross-platform)

```bash
k6 run --env SUPABASE_URL="https://xxxx.supabase.co" --env SUPABASE_ANON_KEY="..." --env TEST_USER_EMAILS="u1@x.com,u2@x.com" --env TEST_USER_PASSWORD="..." load-tests/auth.test.js
```

#### אופציה 2 — PowerShell (Windows)

```powershell
$env:SUPABASE_URL="https://xxxx.supabase.co"
$env:SUPABASE_ANON_KEY="..."
$env:TEST_USER_EMAILS="u1@x.com,u2@x.com,u3@x.com"
$env:TEST_USER_PASSWORD="..."

k6 run .\load-tests\auth.test.js
k6 run .\load-tests\apartments.test.js
k6 run .\load-tests\search.test.js
k6 run .\load-tests\connections.test.js
```

### בחירת תרחיש עומס (Smoke/Load/Stress)

כל קובץ `*.test.js` משתמש כרגע ב-`load` מתוך `load-tests/scenarios.js`.

כדי להריץ Stress/Smoke פשוט משנים שורה אחת בקובץ הבדיקה:

- `import { load as loadScenario } from './scenarios.js'` → להחליף ל-`smoke` או `stress`

### ולידציה (Thresholds)

מוגדרים ב-`load-tests/scenarios.js`:

- **p95 < 500ms**: `http_req_duration`
- **שגיאות < 1%**: `http_req_failed`

### מה לעשות כשיש צוואר בקבוק (Checklist)

- **RLS Policies**
  - RLS כבד = latency גבוה. ודאו שה-`USING (...)` / `WITH CHECK (...)` נשען על עמודות עם Index.
  - הימנעו מפונקציות יקרות בתוך policy (subqueries לא ממוספרות, `auth.jwt()` parsing חוזר, וכו').
  - אם אפשר: העבירו לוגיקה מורכבת ל-Edge Function / RPC עם SECURITY DEFINER (בזהירות).

- **Indexes (PostgreSQL)**
  - חיפוש דירות: `apartments(city)`, `apartments(price)`, `apartments(created_at)`, `apartments(roommate_capacity)`
  - חיבורים: `matches(sender_id, created_at)`, `matches(receiver_id, created_at)`, וגם `matches(status)`
  - בקשות דירה: `apartments_request(recipient_id, created_at)` + `apartments_request(sender_id, created_at)`
  - טבלת משתמשים: `users(id)` (PK), ושדות חיפוש אם יש: `users(full_name)` (ל-ilike מומלץ trigram index אם זה כבד)

- **אופטימיזציית שאילתות**
  - אל תשתמשו ב-`select=*` אם אין צורך; בחרו רק שדות נדרשים.
  - העדיפו pagination (limit + offset או cursor) במקום טעינה מלאה.

- **Supabase Connection Pooling**
  - ודאו PgBouncer/Pooler פעיל אם יש עומס גבוה (במיוחד ב-Stress).

- **תצפית (Observability)**
  - עקבו ב-Supabase Dashboard אחרי: CPU/IO, Connections, Slow Queries, Index usage.
  - אם p95 קופץ רק ב-load גבוה: לרוב זה contention על connections או query plan לא יציב.

### הערות חשובות לפרויקט Homie (לפי הקוד)

- **Likes של דירות** נשמרים בעמודה `users.likes` (array). בדיקת `apartments.test.js` מתאימה לזה.
- **חיבורים** מבוצעים דרך טבלת `matches` (sender/receiver + status).

