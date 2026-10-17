// Runs the SQL migration on an in-memory Postgres (PGlite) with a minimal Supabase auth stub,
// then walks the core flows: invite → join, one-handshake-away, intro request with fires, wall RLS, ghost.
// Usage: npm run test:db
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const db = new PGlite({ extensions: { vector } });
const sql = (q, p) => db.query(q, p);

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`);
await db.exec(readFileSync("supabase/migrations/20261016000000_init.sql", "utf8"));
await db.exec(readFileSync("supabase/migrations/20261016000200_invite_flow.sql", "utf8"));
await db.exec(readFileSync("supabase/migrations/20261016000300_profile_wall.sql", "utf8"));
await db.exec(readFileSync("supabase/migrations/20261016000400_connect_feed.sql", "utf8"));
await db.exec(readFileSync("supabase/migrations/20261016000500_city_names.sql", "utf8"));
await db.exec(readFileSync("supabase/migrations/20261016000600_moderation_places.sql", "utf8"));
await db.exec(readFileSync("supabase/migrations/20261016000700_links_needs_push_ghost.sql", "utf8"));
await db.exec(readFileSync("supabase/migrations/20261016000800_events.sql", "utf8"));
await db.exec(readFileSync("supabase/seed.sql", "utf8"));
await db.exec(readFileSync("supabase/seed_cities.sql", "utf8"));
// No broad grants here: the migration's own grants must be enough ("auto-expose tables" off).

const ids = {};
for (const n of ["nik", "kate", "ivan", "anna", "david", "guest"]) ids[n] = crypto.randomUUID();
const as = async (who, role = "authenticated") => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${who ? ids[who] : ""}', false); set role ${role};`);
};
const asAdmin = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);

// Founders seeded directly (the first member has no inviter).
await asAdmin();
const tb = (await sql(`select id from cities where name = 'Tbilisi'`)).rows[0].id;
for (const n of ["nik", "kate", "ivan", "anna", "david"]) {
  await sql(`insert into profiles (id, handle, name, role, city_id, birth_date) values ($1, $2, $2, 'member', $3, '1990-01-01')`, [ids[n], n, tb]);
}
await sql(`select connect_pair($1,$2,'met',null,null)`, [ids.nik, ids.kate]);
await sql(`select connect_pair($1,$2,'met',null,null)`, [ids.nik, ids.ivan]);
await sql(`select connect_pair($1,$2,'met',null,null)`, [ids.kate, ids.anna]);
await sql(`select connect_pair($1,$2,'met',null,null)`, [ids.ivan, ids.anna]);
await sql(`select connect_pair($1,$2,'met',null,null)`, [ids.ivan, ids.david]);
await sql(`select connect_pair($1,$2,'intro',null,null)`, [ids.kate, ids.nik]); // same pair, reversed
assert.equal((await sql(`select count(*)::int c from connections`)).rows[0].c, 5, "a pair is stored once");
console.log("✓ connections: one row per pair");

// 1. One handshake away for nik: anna (via kate, ivan) and david (via ivan)
await as("nik");
let away = (await sql(`select person, mutuals from people_one_handshake_away() order by person`)).rows;
const name = (id) => Object.keys(ids).find((k) => ids[k] === id);
const awayNames = away.map((r) => name(r.person)).sort();
assert.deepEqual(awayNames, ["anna", "david"]);
assert.equal(away.find((r) => r.person === ids.anna).mutuals.length, 2);
console.log("✓ one handshake away:", awayNames.join(", "), "· anna via", away.find((r) => r.person === ids.anna).mutuals.map(name).join(" + "));

// open_to_network off on ivan hides david
await as("ivan");
await sql(`update profiles set open_to_network = false where id = auth.uid()`);
await as("nik");
away = (await sql(`select person, mutuals from people_one_handshake_away()`)).rows;
assert.deepEqual(away.map((r) => name(r.person)), ["anna"]);
assert.deepEqual(away[0].mutuals.map(name), ["kate"]);
console.log("✓ open_to_network = false hides ivan's connections");
await as("ivan");
await sql(`update profiles set open_to_network = true where id = auth.uid()`);

// birth date is not readable by others
await as("kate");
await assert.rejects(sql(`select birth_date from profiles where id = $1`, [ids.nik]), /permission denied/);
console.log("✓ birth_date is private");
// cannot promote yourself or change inviter
await assert.rejects(sql(`update profiles set status = 'banned' where id = auth.uid()`), /permission denied/);
console.log("✓ status is not user-editable");

// 2. Invite flow
await as("nik");
const inv = (await sql(`select * from create_invite('nik/selfie.jpg')`)).rows[0];
assert.equal(inv.status, "live");
await as(null, "anon");
const opened = (await sql(`select * from open_invite($1)`, [inv.code])).rows[0];
assert.equal(opened.status, "scanned");
assert.equal(opened.inviter_name, "nik");
await sql(`select set_guest_step($1, 'about')`, [inv.code]);
await asAdmin();
await sql(`insert into auth.users (id) values ($1)`, [ids.guest]);
await as("guest");
const prof = (await sql(`select * from accept_invite($1, 'guest', 'guest one', 'designer', '# hi', $2, '1995-05-05')`, [inv.code, tb])).rows[0];
assert.equal(prof.invited_by, ids.nik);
await assert.rejects(sql(`select * from accept_invite($1, 'guest2', 'x', 'y', '', null, null)`, [inv.code]), /already a member|no longer valid/);
await as("nik");
const myInv = (await sql(`select status, guest_step from invites where id = $1`, [inv.id])).rows[0];
assert.deepEqual(myInv, { status: "joined", guest_step: "done" });
assert.equal((await sql(`select is_connected($1,$2) c`, [ids.nik, ids.guest])).rows[0].c, true);
await asAdmin();
assert.ok((await sql(`select terms_accepted_at from profiles where id = $1`, [ids.guest])).rows[0].terms_accepted_at, "consent time is stored");
await as("kate");
await assert.rejects(sql(`select terms_accepted_at from profiles where id = $1`, [ids.guest]), /permission denied/);
await as("guest");
const gw = (await sql(`select kind, other_id, selfie_path from wall($1)`, [ids.guest])).rows;
assert.deepEqual(gw, [{ kind: "handshake", other_id: ids.nik, selfie_path: "nik/selfie.jpg" }]);
console.log("✓ invite: create → open (anon) → step → accept → 🤝 connected, code is single-use, consent time stored, joint selfie on the wall");

// expired code
await as("nik");
const inv2 = (await sql(`select * from create_invite(null)`)).rows[0];
await asAdmin();
await sql(`update invites set expires_at = now() - interval '1 second' where id = $1`, [inv2.id]);
await as(null, "anon");
assert.equal((await sql(`select status from open_invite($1)`, [inv2.code])).rows[0].status, "expired");
console.log("✓ invite expires after 5 minutes");

// 3. Intro request with fires
await as("nik");
const req = (await sql(`select * from request_intro($1)`, [ids.anna])).rows[0];
await assert.rejects(sql(`select * from request_intro($1)`, [ids.anna]), /one handshake away|duplicate/);
await as("ivan");
let toBack = (await sql(`select * from requests_to_back()`)).rows;
assert.equal(toBack.length, 1);
assert.equal(toBack[0].backed, false);
await as("kate");
await sql(`select back_request($1)`, [req.id]);
await as("nik");
const out = (await sql(`select * from outgoing_requests()`)).rows;
assert.equal(out.length, 1);
assert.equal(Number(out[0].fires), 1);
assert.equal(out[0].mutuals.length, 2);
assert.equal(String((await sql(`select my_birth_date() d`)).rows[0].d).length > 0, true);
await as("david");
assert.equal((await sql(`select * from requests_to_back()`)).rows.length, 0, "only mutuals see the request");
await as("anna");
let inc = (await sql(`select * from incoming_requests()`)).rows;
assert.equal(inc.length, 1);
assert.equal(Number(inc[0].fires), 1);
assert.equal(inc[0].mutuals.length, 2);
await as("david");
await assert.rejects(sql(`select respond_request($1, true)`, [req.id]), /not your request/);
await as("anna");
await sql(`select respond_request($1, true)`, [req.id]);
assert.equal((await sql(`select kind from connections where user_a = least($1::uuid,$2::uuid) and user_b = greatest($1::uuid,$2::uuid)`, [ids.nik, ids.anna])).rows[0].kind, "intro");
console.log("✓ intro: request → mutuals asked to back it → 🔥 from kate → anna accepts → 🔗 connected; sender sees fires");

// 4. Wall
await as("kate");
await sql(`insert into wall_posts (wall_owner_id, author_id, body) values ($1, auth.uid(), 'great meetup!')`, [ids.nik]);
await as("david");
await assert.rejects(sql(`insert into wall_posts (wall_owner_id, author_id, body) values ($1, auth.uid(), 'hi')`, [ids.nik]), /row-level security/);
await as("david");
const nw = (await sql(`select kind, body, fires from wall($1) where kind = 'post'`, [ids.nik])).rows;
assert.deepEqual(nw, [{ kind: "post", body: "great meetup!", fires: 0 }]);
await sql(`insert into post_fires (post_id, profile_id) select id, auth.uid() from wall_posts where body = 'great meetup!'`);
assert.equal((await sql(`select fires, fired from wall($1) where kind = 'post'`, [ids.nik])).rows[0].fired, true);
await as(null, "anon");
await assert.rejects(sql(`select * from wall($1)`, [ids.nik]), /permission denied/);
console.log("✓ wall: connections can post, strangers cannot; members see posts with 🔥, anonymous visitors don't");

// 5. Ghost
await as("kate");
await sql(`select become_ghost()`);
await as("nik");
const ghost = (await sql(`select name, status from profiles where id = $1`, [ids.kate])).rows[0];
assert.deepEqual(ghost, { name: null, status: "ghost" });
assert.equal((await sql(`select is_connected($1,$2) c`, [ids.nik, ids.kate])).rows[0].c, true);
console.log("✓ ghost: personal data erased, the edge stays");

// 6. A member scans another member's code → instant 🤝, no registration
await as("nik");
const inv3 = (await sql(`select * from create_invite(null)`)).rows[0];
await assert.rejects(sql(`select handshake_with_invite($1)`, [inv3.code]), /your own code/);
await as("david");
assert.equal((await sql(`select is_connected($1,$2) c`, [ids.nik, ids.david])).rows[0].c, false);
assert.equal((await sql(`select handshake_with_invite($1) id`, [inv3.code])).rows[0].id, ids.nik);
assert.equal((await sql(`select is_connected($1,$2) c`, [ids.nik, ids.david])).rows[0].c, true);
await assert.rejects(sql(`select handshake_with_invite($1)`, [inv3.code]), /no longer valid/);
await as(null, "anon");
await assert.rejects(sql(`select handshake_with_invite($1)`, [inv3.code]), /permission denied/);
console.log("✓ member scans a member's code → 🤝 connected, code used up");

// 7. Cancel: only the inviter, only live/scanned codes
await as("nik");
const inv4 = (await sql(`select * from create_invite(null)`)).rows[0];
await as("ivan");
await sql(`select cancel_invite($1)`, [inv4.id]);
await as("nik");
assert.equal((await sql(`select status from invites where id = $1`, [inv4.id])).rows[0].status, "live");
await sql(`select cancel_invite($1)`, [inv4.id]);
assert.equal((await sql(`select status from invites where id = $1`, [inv4.id])).rows[0].status, "cancelled");
console.log("✓ cancel invite: inviter only");

// 8. Feed: events in my circle (kate's posts left with her ghost, so ivan writes one)
await as("ivan");
await sql(`insert into wall_posts (wall_owner_id, author_id, body) values (auth.uid(), auth.uid(), 'shipping today')`);
await as("nik");
const feed = (await sql(`select kind, actor_id, subject_id, body from feed()`)).rows;
const kinds = feed.map((f) => f.kind);
assert.ok(kinds.includes("handshake") && kinds.includes("intro") && kinds.includes("post"));
assert.ok(feed.some((f) => f.kind === "handshake" && [f.actor_id, f.subject_id].includes(ids.david)), "my new handshake with david");
// ivan hides his network: his handshake with david shows only because david is also my connection now
await as(null, "anon");
await assert.rejects(sql(`select * from feed()`), /permission denied/);
console.log("✓ feed: handshakes, intros and wall posts around me; members only");

// 9. Places: the world list, one name in several countries
await asAdmin();
const nCities = (await sql(`select count(*)::int c from cities`)).rows[0].c;
assert.ok(nCities > 8000, "world cities loaded");
assert.equal((await sql(`select count(*)::int c from cities where name = 'Tbilisi'`)).rows[0].c, 1, "known cities are not duplicated");
assert.ok((await sql(`select count(*)::int c from spheres where parent_id is not null`)).rows[0].c > 80);
console.log("✓ places:", nCities, "cities, more spheres");

// 10. Fake handshake: 3 reports hide the selfie, an admin cancels; parties can remove a connection
await as("nik");
const inv5 = (await sql(`select * from create_invite('nik/fake.jpg')`)).rows[0];
await as("anna");
await sql(`select handshake_with_invite($1)`, [inv5.code]); // anna ↔ nik met in person
for (const who of ["ivan", "david", "guest"]) {
  await as(who);
  await sql(`select report_handshake($1)`, [inv5.id]);
}
await as("ivan");
await sql(`select report_handshake($1)`, [inv5.id]); // the same person twice counts once
await as("anna");
const annaWall = (await sql(`select selfie_path from wall($1) where kind = 'handshake' and id = $2`, [ids.anna, inv5.id])).rows[0];
assert.equal(annaWall.selfie_path, null, "selfie hidden after 3 reports");
await assert.rejects(sql(`select * from admin_resolve_handshake($1, true)`, [inv5.id]), /admins only/);
assert.equal((await sql(`select count(*)::int c from admin_flags()`)).rows[0].c, 0, "non-admins see an empty queue");
await asAdmin();
await sql(`insert into admins (profile_id) values ($1)`, [ids.nik]);
await as("nik");
const flags = (await sql(`select * from admin_flags()`)).rows;
assert.equal(flags.length, 1);
assert.equal(Number(flags[0].reports), 3);
await sql(`select admin_resolve_handshake($1, true)`, [inv5.id]);
assert.equal((await sql(`select is_connected($1,$2) c`, [ids.nik, ids.anna])).rows[0].c, true, "anna and nik stay connected through their earlier intro");
assert.equal((await sql(`select count(*)::int c from connections where invite_id = $1`, [inv5.id])).rows[0].c, 0, "the fake handshake is gone");
await as("david");
await sql(`select remove_connection($1)`, [ids.nik]);
assert.equal((await sql(`select is_connected($1,$2) c`, [ids.nik, ids.david])).rows[0].c, false);
console.log("✓ fake handshake: 3 reports hide the selfie → admin cancels; either person can remove a connection");

// 11. City from location, links, needs on the public card, push devices, export, ghost
await as(null, "anon");
assert.equal((await sql(`select name from nearest_city(41.70, 44.80)`)).rows[0].name, "Tbilisi");
assert.equal((await sql(`select name from nearest_city(55.90, 37.45)`)).rows[0].name, "Moscow", "a suburb counts as the big city");
assert.equal((await sql(`select count(*)::int c from nearest_city(0, -140)`)).rows[0].c, 0, "the middle of the ocean is no city");
await as("nik");
await sql(`update profiles set links = '{"telegram": "https://t.me/nik"}' where id = $1`, [ids.nik]);
await sql(`insert into needs_offers (profile_id, kind, body) values ($1, 'need', 'a backend engineer'), ($1, 'can', 'brand design')`, [ids.nik]);
await as(null, "anon");
assert.equal((await sql(`select links->>'telegram' t from profiles where id = $1`, [ids.nik])).rows[0].t, "https://t.me/nik");
assert.deepEqual((await sql(`select needs, cans from needs_count($1)`, [ids.nik])).rows[0], { needs: 1, cans: 1 });
await assert.rejects(sql(`select * from needs_offers`), /permission denied/, "needs stay members-only");
await as("nik");
await sql(`select save_push_subscription('https://push.example/abc', 'key', 'auth')`);
await as("ivan");
assert.equal((await sql(`select count(*)::int c from push_subscriptions`)).rows[0].c, 0, "nobody reads other people's devices");
await sql(`select save_push_subscription('https://push.example/abc', 'key2', 'auth2')`); // ivan signs in on the same phone
await asAdmin();
assert.equal((await sql(`select profile_id from push_subscriptions`)).rows[0].profile_id, ids.ivan);
await as("nik");
const exp = (await sql(`select my_export() e`)).rows[0].e;
assert.equal(exp.profile.handle, "nik");
assert.ok(exp.connections.length > 0 && exp.needs_and_offers.length === 2);
await as("ivan");
const before = (await sql(`select count(*)::int c from connections where $1 in (user_a, user_b)`, [ids.ivan])).rows[0].c;
await sql(`select become_ghost()`);
await asAdmin();
const ghost2 = (await sql(`select name, handle, links, status from profiles where id = $1`, [ids.ivan])).rows[0];
assert.deepEqual(ghost2, { name: null, handle: null, links: {}, status: "ghost" });
assert.equal((await sql(`select count(*)::int c from push_subscriptions`)).rows[0].c, 0);
assert.equal((await sql(`select count(*)::int c from connections where $1 in (user_a, user_b)`, [ids.ivan])).rows[0].c, before, "the ghost keeps its place in the graph");
console.log("✓ nearest city, links, needs count, push devices, export, ghost");

// 12. Events: host → review → going → check-in → a guest joins through the event → connect at the event
await as("nik");
const soon = (await sql(`select to_char((now() at time zone 'Asia/Bangkok') + interval '1 hour', 'YYYY-MM-DD"T"HH24:MI') t`)).rows[0].t;
const ev = (await sql(`select * from save_event(null, $1)`, [JSON.stringify({ title: "(BLANK)SPACE Soft Launch", body_md: "**coffee** and people", starts_local: soon, timezone: "Asia/Bangkok", city_id: tb, venue: "(BLANK)SPACE Coffee", price: "free", registration_url: "https://luma.com/rou7cg8i" })])).rows[0];
assert.match(ev.slug, /^blank-space-soft-launch-[a-z0-9]{4}$/);
assert.equal(ev.review, "pending");
const startsIn = (await sql(`select extract(epoch from starts_at - now())::int s from events where id = $1`, [ev.id])).rows[0].s;
assert.ok(Math.abs(startsIn - 3600) < 90, "local time read in the event's time zone");
await assert.rejects(sql(`select * from save_event(null, $1)`, [JSON.stringify({ title: "bad", starts_local: soon, timezone: "Mars/Olympus" })]), /time zone/);
await assert.rejects(sql(`select * from save_event(null, $1)`, [JSON.stringify({ title: "bad link", starts_local: soon, timezone: "UTC", registration_url: "http://x.y" })]), /https/);
await as(null, "anon");
assert.equal((await sql(`select count(*)::int c from events_public()`)).rows[0].c, 0, "pending events stay off the calendar");
await assert.rejects(sql(`select checkin_code from events`), /permission denied/);
await as("anna"); // nik's connection sees the pending event in the feed
assert.equal((await sql(`select count(*)::int c from feed() where kind = 'event'`)).rows[0].c, 1);
await as("david"); // not connected to nik: nothing until it's approved
assert.equal((await sql(`select count(*)::int c from events`)).rows[0].c, 0);
await assert.rejects(sql(`select review_event($1, true)`, [ev.id]), /admins only/);
await as("nik");
await sql(`select review_event($1, true)`, [ev.id]);
const code = (await sql(`select event_checkin_code($1) c`, [ev.id])).rows[0].c;
await as("david");
assert.equal((await sql(`select event_checkin_code($1) c`, [ev.id])).rows[0].c, null, "only the host reads the check-in code");
await sql(`select set_going($1, true)`, [ev.id]);
assert.deepEqual((await sql(`select kind, fires::int, fired from feed() where kind = 'event'`)).rows, [{ kind: "event", fires: 2, fired: true }]);
await as(null, "anon");
const pub = (await sql(`select title, city, going, here, host_handle from events_public()`)).rows;
assert.deepEqual(pub, [{ title: "(BLANK)SPACE Soft Launch", city: "Tbilisi", going: 2, here: 0, host_handle: "nik" }]);
assert.equal((await sql(`select state from event_by_code($1)`, [code])).rows[0].state, "open");
ids.walkin = crypto.randomUUID();
await asAdmin();
await sql(`insert into auth.users (id) values ($1)`, [ids.walkin]);
await as("walkin"); // signed in with google, not a member: the event QR doesn't let them in
await assert.rejects(sql(`select * from event_check_in($1)`, [code]), /not a member/);
for (const who of ["guest", "anna", "david"]) {
  await as(who);
  assert.equal((await sql(`select slug from event_check_in($1)`, [code])).rows[0].slug, ev.slug);
}
await as("guest");
assert.deepEqual((await sql(`select person from people_from_events() order by person`)).rows.map((r) => name(r.person)).sort(), ["anna", "david"]);
assert.equal((await sql(`select request_event_connect($1, $2) r`, [ids.anna, ev.id])).rows[0].r, "requested");
await assert.rejects(sql(`select request_event_connect($1, $2)`, [ids.nik, ev.id]), /not at this event together/, "nik didn't check in");
await as("anna");
assert.equal((await sql(`select event_id from incoming_requests()`)).rows[0].event_id, ev.id);
assert.equal((await sql(`select request_event_connect($1, $2) r`, [ids.guest, ev.id])).rows[0].r, "connected", "both tapped connect");
assert.deepEqual((await sql(`select kind, event_id from connections where $1 in (user_a, user_b) and $2 in (user_a, user_b)`, [ids.anna, ids.guest])).rows, [{ kind: "met", event_id: ev.id }]);
assert.ok((await sql(`select body from feed() where kind = 'event_met'`)).rows.some((r) => r.body === ev.id));
await as("david");
await sql(`select request_event_connect($1, $2)`, [ids.guest, ev.id]);
await as("guest");
const req12 = (await sql(`select id from incoming_requests() where event_id is not null`)).rows[0].id;
await sql(`select respond_request($1, true)`, [req12]);
assert.equal((await sql(`select kind from connections where $1 in (user_a, user_b) and $2 in (user_a, user_b)`, [ids.david, ids.guest])).rows[0].kind, "met");
assert.equal((await sql(`select count(*)::int c from people_from_events()`)).rows[0].c, 0, "everyone from the event is connected now");
// codes: the host can replace a leaked one; check-in waits for the event's time
await as("nik");
const fresh = (await sql(`select new_checkin_code($1) c`, [ev.id])).rows[0].c;
assert.notEqual(fresh, code);
const later = (await sql(`select * from save_event(null, $1)`, [JSON.stringify({ title: "Next month", starts_local: "2030-01-01T19:00", timezone: "UTC" })])).rows[0];
await sql(`select review_event($1, true)`, [later.id]);
const laterCode = (await sql(`select event_checkin_code($1) c`, [later.id])).rows[0].c;
await as("anna");
await assert.rejects(sql(`select * from event_check_in($1)`, [code]), /code not found/, "the old code stops working");
await assert.rejects(sql(`select * from event_check_in($1)`, [laterCode]), /not open yet/);
await assert.rejects(sql(`select cancel_event($1)`, [later.id]), /not your event/);
const exp2 = (await sql(`select my_export() e`)).rows[0].e;
assert.equal(exp2.events_attended.length, 1);
console.log("✓ events: host → admin approves → going → members check in with the QR (non-members can't) → connect at the event");

// 13. Offers replace i need / i can: needs become orders, cans go; public cards, interest, feed, limit
await asAdmin();
await db.exec(readFileSync("supabase/migrations/20261017000100_offers.sql", "utf8"));
assert.deepEqual((await sql(`select kind, title from offers where profile_id = $1`, [ids.nik])).rows, [{ kind: "order", title: "a backend engineer" }], "i need became an order");
assert.equal((await sql(`select to_regclass('public.needs_offers') t`)).rows[0].t, null, "the old table is gone");
await as(null, "anon");
assert.equal((await sql(`select count(*)::int c from offers where profile_id = $1`, [ids.nik])).rows[0].c, 1, "offers are public");
await assert.rejects(sql(`insert into offers (profile_id, kind, title) values ($1, 'service', 'hack')`, [ids.nik]), /permission denied/);
await as("anna");
const off = (await sql(`insert into offers (profile_id, kind, title, body_md, price, link) values (auth.uid(), 'service', 'Brand identity in two weeks', 'logo, colors, type', 'from $900', 'https://anna.design') returning id`)).rows[0];
await assert.rejects(sql(`insert into offers (profile_id, kind, title) values ($1, 'service', 'as nik')`, [ids.nik]), /row-level security/);
await assert.rejects(sql(`insert into offer_interest (offer_id, profile_id) values ($1, auth.uid())`, [off.id]), /row-level security/, "not in your own offer");
await as("nik");
await sql(`insert into offer_interest (offer_id, profile_id) values ($1, auth.uid())`, [off.id]);
assert.deepEqual((await sql(`select kind, fired from feed() where kind = 'offer' and id = $1`, [off.id])).rows, [{ kind: "offer", fired: true }]);
await as("david");
assert.equal((await sql(`select count(*)::int c from offer_interest`)).rows[0].c, 0, "others don't see who is interested");
await as("anna");
assert.equal((await sql(`select profile_id from offer_interest where offer_id = $1`, [off.id])).rows[0].profile_id, ids.nik, "the author sees who");
assert.equal((await sql(`select interested from offer_counts(auth.uid())`)).rows[0].interested, 1);
for (let i = 0; i < 9; i++) await sql(`insert into offers (profile_id, kind, title) values (auth.uid(), 'product', $1)`, [`thing number ${i}`]);
await assert.rejects(sql(`insert into offers (profile_id, kind, title) values (auth.uid(), 'product', 'eleventh')`), /too many open offers/);
await sql(`update offers set closed_at = now() where title = 'thing number 0'`);
await sql(`insert into offers (profile_id, kind, title) values (auth.uid(), 'product', 'eleventh, after closing one')`);
assert.equal((await sql(`select my_export() e`)).rows[0].e.offers.length, 11);
await sql(`select become_ghost()`);
await asAdmin();
assert.equal((await sql(`select count(*)::int c from offers where profile_id = $1`, [ids.anna])).rows[0].c, 0, "a ghost has no offers");
console.log("✓ offers: needs → orders, public, interest seen by the author only, in the feed, 10 open at most, ghost");

// 14. Admin panel, stage 1: activity, stats, members, member card, ban, hide post, close offer — admins only
await asAdmin();
await db.exec(readFileSync("supabase/migrations/20261017000200_admin.sql", "utf8"));
await as("david");
await sql(`insert into wall_posts (wall_owner_id, author_id, body) values (auth.uid(), auth.uid(), 'shipping today')`);
await sql(`select touch_activity()`);
await sql(`select touch_activity()`); // the same day counts once
await assert.rejects(sql(`select last_seen_at from profiles where id = auth.uid()`), /permission denied/, "members don't see last_seen_at");
await assert.rejects(sql(`select * from activity_days`), /permission denied/);
await assert.rejects(sql(`select * from admin_actions`), /permission denied/);
const adminCalls = [
  [`select admin_badges()`, []],
  [`select admin_stats(null, null)`, []],
  [`select * from admin_timeseries(null, null)`, []],
  [`select * from admin_retention(12)`, []],
  [`select * from admin_members()`, []],
  [`select admin_member($1)`, [ids.nik]],
  [`select admin_set_ban($1, true, 'spam')`, [ids.david]],
  [`select admin_hide_post(gen_random_uuid(), null)`, []],
  [`select admin_close_offer(gen_random_uuid(), null)`, []],
];
for (const [q, p] of adminCalls) await assert.rejects(sql(q, p), /admins only/, `non-admin refused: ${q}`);
await as(null, "anon");
await assert.rejects(sql(`select admin_stats(null, null)`), /permission denied/);
await assert.rejects(sql(`select touch_activity()`), /permission denied/);
await assert.rejects(sql(`select joined_at_event($1)`, [ids.nik]), /permission denied/, "internal helpers are closed");
await as("ivan");
await assert.rejects(sql(`select admin_log_action('x', 'profile', 'y')`), /permission denied/);

await asAdmin();
const truth = (await sql(`select (select count(*)::int from profiles where status = 'ghost') ghosts,
  (select count(*)::int from invites where status = 'joined') joined_codes,
  (select count(*)::int from push_subscriptions) devices`)).rows[0];
await as("nik");
const st = (await sql(`select admin_stats(null, null) s`)).rows[0].s;
assert.equal(st.north_star.accepted, 1, "nik → anna intro accepted");
assert.equal(st.members.ghost, truth.ghosts);
assert.equal(st.funnel.member_handshakes, truth.joined_codes - 1, "used codes minus the one guest joined with");
assert.equal(st.funnel.joined, 1, "guest joined through nik's selfie");
assert.equal(st.activity.dau, 1);
assert.equal(st.network.tree_depth, 2);
assert.equal(st.events.connections, 2);
assert.equal(st.push.devices, truth.devices);
const ts = (await sql(`select metric, sum(value)::int n from admin_timeseries(null, null) group by metric`)).rows;
assert.equal(ts.find((r) => r.metric === "invites_joined").n, 1);
assert.equal(ts.find((r) => r.metric === "active_members").n, 1);
assert.ok((await sql(`select * from admin_retention(12)`)).rows.length > 0);
const all = (await sql(`select * from admin_members()`)).rows;
assert.equal(all.length, 6);
assert.equal(Number(all[0].total), 6);
assert.ok(!("birth_date" in all[0]), "no birth dates in the admin");
assert.deepEqual((await sql(`select handle, join_method, inviter_name from admin_members('gue')`)).rows, [{ handle: "guest", join_method: "selfie", inviter_name: "nik" }]);
assert.equal((await sql(`select count(*)::int c from admin_members(p_join => 'founder')`)).rows[0].c, 5);
assert.equal((await sql(`select count(*)::int c from admin_members('100%_')`)).rows[0].c, 0, "search wildcards are escaped");
const card = (await sql(`select admin_member($1) m`, [ids.guest])).rows[0].m;
assert.equal(card.join.method, "selfie");
assert.equal(card.ancestors[0].id, ids.nik);
assert.ok(card.connections.list.some((c) => c.id === ids.nik));
assert.ok(!("birth_date" in card.profile));
await sql(`select admin_member($1)`, [ids.guest]);
await asAdmin();
assert.equal((await sql(`select count(*)::int c from admin_actions where action = 'view_member' and target_id = $1`, [ids.guest])).rows[0].c, 1, "a view is logged once per 10 minutes");

await as("nik");
await assert.rejects(sql(`select admin_set_ban($1, true, '')`, [ids.david]), /reason required/);
await assert.rejects(sql(`select admin_set_ban($1, true, 'x')`, [ids.nik]), /not yourself/);
await assert.rejects(sql(`select admin_set_ban($1, true, 'x')`, [ids.kate]), /nothing to change/, "a ghost can't be banned");
assert.equal((await sql(`select admin_set_ban($1, true, 'spam in intros') s`, [ids.david])).rows[0].s, "banned");
await as(null, "anon");
assert.equal((await sql(`select count(*)::int c from profiles where id = $1`, [ids.david])).rows[0].c, 0, "a banned card disappears");
await as("nik");
assert.equal((await sql(`select admin_set_ban($1, false, null) s`, [ids.david])).rows[0].s, "active");
const acts = (await sql(`select admin_member($1) m`, [ids.david])).rows[0].m.actions;
assert.deepEqual(acts.map((a) => [a.action, a.reason]), [["unban", null], ["ban", "spam in intros"]]);

const post = (await sql(`select id from wall_posts where body = 'shipping today'`)).rows[0];
await sql(`select admin_hide_post($1, 'off-topic')`, [post.id]);
assert.equal((await sql(`select count(*)::int c from wall($1) where kind = 'post' and id = $2`, [ids.david, post.id])).rows[0].c, 0, "a hidden post leaves the wall");
await assert.rejects(sql(`select admin_hide_post($1, null)`, [post.id]), /post not found/);
const order = (await sql(`select id from offers where profile_id = $1 and closed_at is null`, [ids.nik])).rows[0];
await sql(`select admin_close_offer($1, 'duplicate')`, [order.id]);
assert.ok((await sql(`select closed_at from offers where id = $1`, [order.id])).rows[0].closed_at);
const badges = (await sql(`select * from admin_badges()`)).rows[0];
assert.equal(typeof Number(badges.events), "number");
console.log("✓ admin: activity, stats, members, card (view logged), ban/unban with reason, hide post, close offer; members and anonymous refused");

console.log("\nall schema checks passed");
