-- Replace run_recurring_scheduler with a version that doesn't require
-- a stashed service key. produce-video is deployed verify_jwt=false so
-- pg_net can call it without an Authorization header.
CREATE OR REPLACE FUNCTION run_recurring_scheduler()
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  rec RECORD;
  count INTEGER := 0;
  project_url TEXT := 'https://unhorjseqvqmeoaqajnc.supabase.co';
BEGIN
  FOR rec IN SELECT * FROM due_schedule_slots() LOOP
    BEGIN
      INSERT INTO scheduler_fires (avatar_id, schedule_kind, slot_time)
      VALUES (rec.avatar_id, rec.schedule_kind, rec.slot_time);
    EXCEPTION WHEN unique_violation THEN
      CONTINUE;
    END;

    PERFORM net.http_post(
      url := project_url || '/functions/v1/produce-video',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'avatar_id', rec.avatar_id,
        'voice',     'auto',
        'auto_post', false
      )
    );
    count := count + 1;
  END LOOP;
  RETURN count;
END;
$$;
