# 1handshake

A members-only club for people in tech. You get in only by meeting a member in person — a joint selfie turns into a 5-minute QR invite. Everyone you need is one handshake away.

**Open code, closed data.** The code is public; members' data is not.

## Stack

- Next.js (App Router) · TypeScript · Tailwind CSS with the 1handshake design tokens (`design/tokens.json` → `npm run tokens`)
- Supabase: Postgres (the people graph), Auth (Google), Storage (selfies, avatars), Realtime (invite waiting screen)
- Vercel for hosting

## Develop

```bash
cp .env.example .env.local   # fill in Supabase URL and keys
npm install
npm run dev                  # http://localhost:3000
npm run test:db              # runs the schema and core flows on an in-memory Postgres
```

Database: `supabase/migrations/*.sql` and `supabase/seed.sql`. Setup guide (Russian): `SETUP.md`.

## License

[AGPL-3.0](LICENSE). Open code, closed data: anyone can read and run the code; if you run a modified version as a service, you share your changes too. Member data never leaves the club.
