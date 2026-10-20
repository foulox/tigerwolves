-- #534: Merge the Beginner-Friendly run kind into Easy. Beginner-Friendly was a
-- redundant kind (any such run is also an Easy run; the two already mapped to the
-- same library category). Idempotent: zero rows match on replay.
UPDATE runs SET kind = 'Easy' WHERE kind = 'Beginner-Friendly';
