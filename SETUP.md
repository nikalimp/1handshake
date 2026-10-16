# Как запустить 1handshake

Пошаговая настройка для Ника. Порядок важен: Supabase → Google → локальный запуск → Vercel → домен.

## 1. Supabase (база, вход, файлы)
1. supabase.com → New project:
   - **Region: Europe → Frankfurt (eu-central-1)** — данные участников в ЕС. Регион потом не поменять.
   - Security: **Enable Data API** — включено; **Automatically expose new tables** — выключено (миграция сама выдаёт права на нужные таблицы и колонки); **Enable automatic RLS** — включено (страховка для будущих таблиц).
   - Postgres Type: обычный Postgres (не OrioleDB).
2. Сохрани пароль базы в менеджер паролей.
3. SQL Editor → выполни по очереди:
   - `supabase/migrations/20261016000000_init.sql` — схема, правила доступа, функции;
   - `supabase/migrations/20261016000100_storage.sql` — приватные бакеты для селфи и аватаров;
   - `supabase/migrations/20261016000200_invite_flow.sql` — отмена инвайта и мгновенный 🤝, когда QR сканирует участник;
   - `supabase/migrations/20261016000300_profile_wall.sql` — время согласия с условиями и стена профиля;
   - `supabase/migrations/20261016000400_connect_feed.sql` — лента, запросы на знакомство и огоньки поддержки;
   - `supabase/migrations/20261016000500_city_names.sql` — названия городов с заглавной;
   - `supabase/seed.sql` — сферы и города.
4. Project Settings → API: скопируй **Project URL**, **publishable key**, **service_role key** (секретный).

## 2. Вход через Google
1. console.cloud.google.com → новый проект «1handshake».
2. APIs & Services → **OAuth consent screen**: External, название 1handshake, логотип `public/1h-app-icon.svg` (экспортируй в PNG), домен 1handshake.com, ссылки на Privacy policy и Terms (нужны до публикации), scopes: email, profile, openid.
3. Credentials → **Create OAuth client ID** → Web application.
   - Authorized redirect URI: `https://<project>.supabase.co/auth/v1/callback`
4. Supabase → Authentication → Providers → **Google**: вставь Client ID и Client secret.
5. Supabase → Authentication → URL Configuration:
   - Site URL: `https://1handshake.com`
   - Redirect URLs: `http://localhost:3000/**`, `https://1handshake.com/**`, `https://*-<vercel-team>.vercel.app/**`

## 3. Локальный запуск
```bash
cp .env.example .env.local   # вставь URL и ключи из шага 1
npm install
npm run dev
```
Первый участник (ты) появляется без инвайта: войди через Google, затем в Supabase → SQL Editor:
```sql
insert into public.profiles (id, handle, name, role, city_id)
select id, 'nik', 'nik alimpiev', 'brand & product designer', (select id from cities where name = 'Tbilisi')
from auth.users where email = 'твой@gmail.com';
```
Дальше все попадают только через инвайт.

### Проверка инвайта на одном компьютере
1. В `.env.local` должен быть `SUPABASE_SERVICE_ROLE_KEY` — без него гость не увидит совместное селфи.
2. Пока приложение Google в режиме Testing, войти могут только тестовые пользователи: добавь второй Google-аккаунт в Google Cloud → Google Auth Platform → Audience → Test users.
3. На localhost:3000 → connect → **+ invite** → селфи → QR. Под QR есть ссылка `localhost:3000/i/<код>`.
4. Открой эту ссылку в окне инкогнито и войди вторым аккаунтом. В первом окне шаги гостя будут отмечаться сами.

С телефона QR заработает после деплоя на Vercel: камера в браузере и вход через Google требуют https и настоящий адрес.

### AI-визитка
`ANTHROPIC_API_KEY` в `.env.local` — Claude соберёт визитку из рассказа гостя. Без ключа визитка заполняется текстом рассказа как есть, гость правит её сам. Модель меняется переменной `ANTHROPIC_MODEL`.

Голос распознаёт сам браузер (Chrome, Safari). Где распознавания нет, гость просто печатает.

## 4. Vercel (хостинг)
1. Залей код в публичный репозиторий на GitHub.
2. vercel.com → Add New Project → импорт репозитория. Region функций: Frankfurt (fra1), рядом с базой.
3. Environment Variables: те же, что в `.env.local`, но `NEXT_PUBLIC_SITE_URL=https://1handshake.com`.
4. Deploy.

## 5. Домен на reg.ru
1. Vercel → Project → Settings → Domains → добавь `1handshake.com` и `www.1handshake.com`. Vercel покажет нужные записи.
2. reg.ru → Домены → 1handshake.com → **DNS-серверы и управление зоной**:
   - `A` для `@` → IP, который показал Vercel;
   - `CNAME` для `www` → значение от Vercel.
3. Подожди обновления DNS (до нескольких часов), Vercel сам выпустит SSL-сертификат.
Хостинг reg.ru для приложения не нужен — только домен.

## Проверка схемы
`npm run test:db` — прогоняет миграцию на Postgres в памяти и проверяет: связь хранится один раз, «через одно рукопожатие», Open to network, приватность даты рождения, инвайт (создание → скан → регистрация → 🤝), истечение кода, запрос с огоньком 🔥, правила стены, Ghost, мгновенный 🤝 между участниками, отмена инвайта.
