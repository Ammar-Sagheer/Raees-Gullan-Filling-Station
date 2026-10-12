-- =============================================================================
-- 045_treasury_opening_entries.sql
--
-- Intentionally empty in the master. In the app this was first built for, 045
-- loaded that pump's own opening safe sheet; a new pump starts with an empty
-- safe and enters its opening cash under Treasury on day one. Kept as a file so
-- the migration numbers stay the same everywhere.
-- =============================================================================
select 1;
