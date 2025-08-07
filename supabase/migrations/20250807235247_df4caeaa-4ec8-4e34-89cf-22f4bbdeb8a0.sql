-- 1) Add price to recipes for server menu pricing
ALTER TABLE public.recipes
ADD COLUMN IF NOT EXISTS price numeric NOT NULL DEFAULT 0;

-- 2) Create session_menu table to control per-session availability
CREATE TABLE IF NOT EXISTS public.session_menu (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  session_id uuid NOT NULL,
  recipe_id uuid NOT NULL,
  price_override numeric NULL,
  is_available boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.session_menu ENABLE ROW LEVEL SECURITY;

-- Policies: staff in the same restaurant can view and modify
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'session_menu' AND policyname = 'Users can view session menu in their restaurant'
  ) THEN
    CREATE POLICY "Users can view session menu in their restaurant"
      ON public.session_menu FOR SELECT
      USING (restaurant_id = public.get_user_restaurant());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'session_menu' AND policyname = 'Staff can modify session menu'
  ) THEN
    CREATE POLICY "Staff can modify session menu"
      ON public.session_menu FOR ALL
      USING (restaurant_id = public.get_user_restaurant())
      WITH CHECK (restaurant_id = public.get_user_restaurant());
  END IF;
END $$;

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_session_menu_updated_at'
  ) THEN
    CREATE TRIGGER trg_session_menu_updated_at
      BEFORE UPDATE ON public.session_menu
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_session_menu_restaurant_session ON public.session_menu (restaurant_id, session_id);
CREATE INDEX IF NOT EXISTS idx_session_menu_recipe ON public.session_menu (recipe_id);

-- 3) Create prep_tasks table to manage prep lists
CREATE TABLE IF NOT EXISTS public.prep_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  session_id uuid NOT NULL,
  recipe_id uuid NOT NULL,
  quantity_batches numeric NOT NULL DEFAULT 1,
  notes text NULL,
  status text NOT NULL DEFAULT 'pending', -- pending | in_progress | done | canceled
  created_by uuid NOT NULL, -- profile id
  assigned_to uuid NULL, -- profile id
  started_at timestamptz NULL,
  completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.prep_tasks ENABLE ROW LEVEL SECURITY;

-- Policies: view and modify within restaurant
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'prep_tasks' AND policyname = 'Users can view prep tasks in their restaurant'
  ) THEN
    CREATE POLICY "Users can view prep tasks in their restaurant"
      ON public.prep_tasks FOR SELECT
      USING (restaurant_id = public.get_user_restaurant());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'prep_tasks' AND policyname = 'Staff can modify prep tasks'
  ) THEN
    CREATE POLICY "Staff can modify prep tasks"
      ON public.prep_tasks FOR ALL
      USING (restaurant_id = public.get_user_restaurant())
      WITH CHECK (restaurant_id = public.get_user_restaurant());
  END IF;
END $$;

-- Trigger for updated_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_prep_tasks_updated_at'
  ) THEN
    CREATE TRIGGER trg_prep_tasks_updated_at
      BEFORE UPDATE ON public.prep_tasks
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_prep_tasks_restaurant_session ON public.prep_tasks (restaurant_id, session_id);
CREATE INDEX IF NOT EXISTS idx_prep_tasks_recipe ON public.prep_tasks (recipe_id);

