-- Reference data: spheres (from Product/Сферы деятельности.md) and starter cities.
-- Runs on `supabase db reset` and once in production via `psql < supabase/seed.sql`.

insert into public.cities (name, country) values
  ('Tbilisi', 'Georgia'),
  ('Batumi', 'Georgia'),
  ('Bangkok', 'Thailand'),
  ('Phuket', 'Thailand'),
  ('Bali', 'Indonesia'),
  ('Dubai', 'UAE'),
  ('Istanbul', 'Türkiye'),
  ('Yerevan', 'Armenia'),
  ('Almaty', 'Kazakhstan'),
  ('Astana', 'Kazakhstan'),
  ('Belgrade', 'Serbia'),
  ('Lisbon', 'Portugal'),
  ('Barcelona', 'Spain'),
  ('Berlin', 'Germany'),
  ('London', 'UK'),
  ('Limassol', 'Cyprus'),
  ('Singapore', 'Singapore'),
  ('Hong Kong', 'China'),
  ('New York', 'USA'),
  ('San Francisco', 'USA')
on conflict (name, country) do nothing;

insert into public.spheres (parent_id, name) values (null, 'Engineering') on conflict do nothing;
insert into public.spheres (parent_id, name)
  select s.id, v.name from public.spheres s, (values ('Frontend'), ('Backend'), ('Full-stack'), ('Mobile'), ('DevOps & Cloud'), ('Data Engineering'), ('QA'), ('Security'), ('Web3'), ('Game Dev'), ('Hardware & IoT')) as v(name)
  where s.name = 'Engineering' and s.parent_id is null
on conflict do nothing;

insert into public.spheres (parent_id, name) values (null, 'AI & Data') on conflict do nothing;
insert into public.spheres (parent_id, name)
  select s.id, v.name from public.spheres s, (values ('ML / AI'), ('Data Science'), ('Analytics')) as v(name)
  where s.name = 'AI & Data' and s.parent_id is null
on conflict do nothing;

insert into public.spheres (parent_id, name) values (null, 'Product') on conflict do nothing;
insert into public.spheres (parent_id, name)
  select s.id, v.name from public.spheres s, (values ('Product Management'), ('Project Management'), ('Business Analysis')) as v(name)
  where s.name = 'Product' and s.parent_id is null
on conflict do nothing;

insert into public.spheres (parent_id, name) values (null, 'Design') on conflict do nothing;
insert into public.spheres (parent_id, name)
  select s.id, v.name from public.spheres s, (values ('Product Design (UI/UX)'), ('Brand & Graphic'), ('Motion & 3D'), ('UX Research')) as v(name)
  where s.name = 'Design' and s.parent_id is null
on conflict do nothing;

insert into public.spheres (parent_id, name) values (null, 'Marketing') on conflict do nothing;
insert into public.spheres (parent_id, name)
  select s.id, v.name from public.spheres s, (values ('Growth & Performance'), ('Content & Copy'), ('SMM'), ('SEO / GEO'), ('PR & Comms'), ('Community')) as v(name)
  where s.name = 'Marketing' and s.parent_id is null
on conflict do nothing;

insert into public.spheres (parent_id, name) values (null, 'Sales & BD') on conflict do nothing;
insert into public.spheres (parent_id, name)
  select s.id, v.name from public.spheres s, (values ('Sales'), ('Business Development'), ('Partnerships')) as v(name)
  where s.name = 'Sales & BD' and s.parent_id is null
on conflict do nothing;

insert into public.spheres (parent_id, name) values (null, 'Business') on conflict do nothing;
insert into public.spheres (parent_id, name)
  select s.id, v.name from public.spheres s, (values ('Founder / CEO'), ('Investor / VC'), ('Operations'), ('Finance'), ('Legal')) as v(name)
  where s.name = 'Business' and s.parent_id is null
on conflict do nothing;

insert into public.spheres (parent_id, name) values (null, 'People') on conflict do nothing;
insert into public.spheres (parent_id, name)
  select s.id, v.name from public.spheres s, (values ('HR & Recruiting'), ('Coaching & Education')) as v(name)
  where s.name = 'People' and s.parent_id is null
on conflict do nothing;
