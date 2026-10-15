-- =====================================================================
-- Rob Watt Films forum — remove the TEST DATA from seed-test-data.sql
-- Run before launch. Deleting the two test members also deletes their
-- profiles, topics and replies (and any replies other people made on
-- their test topics).
-- =====================================================================

delete from auth.users
where id in ('a11ce000-0000-4000-a000-000000000001', 'b0b0b000-0000-4000-a000-000000000002');
