-- Add configurable thresholds to inventory
ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS urgent_threshold numeric NULL,
  ADD COLUMN IF NOT EXISTS excess_threshold numeric NULL;

-- Add stations to session_menu so availability/86 maps to kitchen stations
ALTER TABLE public.session_menu
  ADD COLUMN IF NOT EXISTS stations station_type[] NOT NULL DEFAULT '{}'::station_type[];

-- Backfill stations on existing session_menu rows from recipes when empty
UPDATE public.session_menu sm
SET stations = r.stations
FROM public.recipes r
WHERE sm.recipe_id = r.id
  AND (sm.stations IS NULL OR cardinality(sm.stations) = 0);