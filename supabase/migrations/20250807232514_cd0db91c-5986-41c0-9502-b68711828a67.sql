
-- 1) Enforce one daily session per restaurant per date, and fix INSERT RLS

-- Create a unique index so only one session per restaurant per day exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' AND indexname = 'uniq_daily_sessions_restaurant_date'
  ) THEN
    CREATE UNIQUE INDEX uniq_daily_sessions_restaurant_date
      ON public.daily_sessions (restaurant_id, session_date);
  END IF;
END$$;

-- Allow managers/admins to create sessions (fixes current RLS insert failure)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'daily_sessions' AND policyname = 'Managers can create sessions'
  ) THEN
    CREATE POLICY "Managers can create sessions"
    ON public.daily_sessions
    FOR INSERT
    WITH CHECK (
      restaurant_id = public.get_user_restaurant()
      AND public.get_user_role() IN ('manager','admin')
    );
  END IF;
END$$;

-- 2) Ensure realtime works reliably on all live-updated tables

-- Make sure updates include full row data
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.order_items REPLICA IDENTITY FULL;
ALTER TABLE public.inventory REPLICA IDENTITY FULL;
ALTER TABLE public.prep_availability REPLICA IDENTITY FULL;
ALTER TABLE public.clock_logs REPLICA IDENTITY FULL;
ALTER TABLE public.daily_sessions REPLICA IDENTITY FULL;
ALTER TABLE public.recipes REPLICA IDENTITY FULL;
ALTER TABLE public.recipe_ingredients REPLICA IDENTITY FULL;
ALTER TABLE public.recipe_dependencies REPLICA IDENTITY FULL;

-- Add tables to realtime publication (safe to re-run; duplicates are ignored)
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory;
ALTER PUBLICATION supabase_realtime ADD TABLE public.prep_availability;
ALTER PUBLICATION supabase_realtime ADD TABLE public.clock_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.recipes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.recipe_ingredients;
ALTER PUBLICATION supabase_realtime ADD TABLE public.recipe_dependencies;

-- 3) Provisioning helper: create a restaurant + manager profile for current user if missing

CREATE OR REPLACE FUNCTION public.provision_current_user(
  _restaurant_name text DEFAULT 'My Restaurant',
  _first_name text DEFAULT 'Manager',
  _last_name text DEFAULT 'User'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r_id uuid;
  emp_num text;
BEGIN
  -- If user already has a profile, return that restaurant_id
  SELECT restaurant_id INTO r_id
  FROM public.profiles
  WHERE user_id = auth.uid();

  IF r_id IS NOT NULL THEN
    RETURN r_id;
  END IF;

  -- Create restaurant
  INSERT INTO public.restaurants (name)
  VALUES (COALESCE(_restaurant_name, 'My Restaurant'))
  RETURNING id INTO r_id;

  -- Generate a 3-digit employee number
  emp_num := lpad((floor(random() * 900)::int + 100)::text, 3, '0');

  -- Create manager profile for current user
  INSERT INTO public.profiles (user_id, restaurant_id, first_name, last_name, employee_number, role, is_active)
  VALUES (auth.uid(), r_id, COALESCE(_first_name, 'Manager'), COALESCE(_last_name, 'User'), emp_num, 'manager', true);

  RETURN r_id;
END;
$$;

-- Allow authenticated users to run it
GRANT EXECUTE ON FUNCTION public.provision_current_user(text, text, text) TO authenticated;
