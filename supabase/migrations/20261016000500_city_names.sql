-- City names are shown as written: "Tbilisi", "Hong Kong". The lowercase look is an interface trait, not data.
update public.cities set name = initcap(name) where name = lower(name);
