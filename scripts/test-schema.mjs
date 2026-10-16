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
  create role anon nologin; create role authenticated nologin;
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

console.log("\nall schema checks passed");
