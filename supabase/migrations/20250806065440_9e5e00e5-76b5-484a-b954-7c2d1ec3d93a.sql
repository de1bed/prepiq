-- Add recipe type field to distinguish prep vs line cook
ALTER TABLE recipes ADD COLUMN recipe_type text NOT NULL DEFAULT 'line_cook' CHECK (recipe_type IN ('prep', 'line_cook'));

-- Create table for recipe dependencies (sub-recipes)
CREATE TABLE recipe_dependencies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_recipe_id uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  child_recipe_id uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  quantity_needed numeric NOT NULL DEFAULT 1,
  unit text NOT NULL DEFAULT 'batch',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(parent_recipe_id, child_recipe_id)
);

-- Enable RLS for recipe_dependencies
ALTER TABLE recipe_dependencies ENABLE ROW LEVEL SECURITY;

-- Create policies for recipe_dependencies
CREATE POLICY "Users can view recipe dependencies" 
ON recipe_dependencies 
FOR SELECT 
USING (parent_recipe_id IN (SELECT id FROM recipes WHERE restaurant_id = get_user_restaurant()));

CREATE POLICY "Managers can modify recipe dependencies" 
ON recipe_dependencies 
FOR ALL 
USING (parent_recipe_id IN (SELECT id FROM recipes WHERE restaurant_id = get_user_restaurant() AND get_user_role() = ANY (ARRAY['manager'::user_role, 'admin'::user_role])));

-- Insert initial prep recipes
INSERT INTO recipes (restaurant_id, name, description, category, recipe_type, stations, batch_size, prep_time_minutes, cook_time_minutes) VALUES
('24802dac-d026-4ac8-87bd-b3f22d8bd97e', 'Pico de Gallo', 'Fresh tomato, onion, and cilantro salsa', 'Sauce', 'prep', '{"prep"}', 2, 15, 0),
('24802dac-d026-4ac8-87bd-b3f22d8bd97e', 'Chicken Mix', 'Seasoned pulled chicken for tacos', 'Protein', 'prep', '{"prep"}', 3, 45, 30),
('24802dac-d026-4ac8-87bd-b3f22d8bd97e', 'Spicy Avocado', 'Creamy spiced avocado spread', 'Sauce', 'prep', '{"prep"}', 1.5, 10, 0),
('24802dac-d026-4ac8-87bd-b3f22d8bd97e', 'Taquitos', 'Crispy chicken taquitos with fresh toppings', 'Main Dish', 'line_cook', '{"fry", "prep"}', 4, 5, 8);

-- Insert initial inventory
INSERT INTO inventory (restaurant_id, ingredient_name, current_quantity, unit, min_threshold) VALUES
('24802dac-d026-4ac8-87bd-b3f22d8bd97e', 'Tomatoes', 25, 'lbs', 5),
('24802dac-d026-4ac8-87bd-b3f22d8bd97e', 'White Onion', 15, 'lbs', 3),
('24802dac-d026-4ac8-87bd-b3f22d8bd97e', 'Cilantro', 8, 'bunches', 2),
('24802dac-d026-4ac8-87bd-b3f22d8bd97e', 'Lime Juice', 6, 'bottles', 1),
('24802dac-d026-4ac8-87bd-b3f22d8bd97e', 'Salt', 5, 'lbs', 1),
('24802dac-d026-4ac8-87bd-b3f22d8bd97e', 'Chicken Breast', 20, 'lbs', 5),
('24802dac-d026-4ac8-87bd-b3f22d8bd97e', 'Garlic Powder', 3, 'lbs', 0.5),
('24802dac-d026-4ac8-87bd-b3f22d8bd97e', 'Cumin', 2, 'lbs', 0.5),
('24802dac-d026-4ac8-87bd-b3f22d8bd97e', 'Paprika', 2, 'lbs', 0.5),
('24802dac-d026-4ac8-87bd-b3f22d8bd97e', 'Black Pepper', 1, 'lbs', 0.25),
('24802dac-d026-4ac8-87bd-b3f22d8bd97e', 'Avocados', 30, 'whole', 10),
('24802dac-d026-4ac8-87bd-b3f22d8bd97e', 'Jalapeño', 5, 'lbs', 1),
('24802dac-d026-4ac8-87bd-b3f22d8bd97e', 'Corn Tortillas', 200, 'pieces', 50),
('24802dac-d026-4ac8-87bd-b3f22d8bd97e', 'Vegetable Oil', 8, 'gallons', 2);

-- Create active session for today
INSERT INTO daily_sessions (restaurant_id, session_date, is_active) VALUES
('24802dac-d026-4ac8-87bd-b3f22d8bd97e', CURRENT_DATE, true)
ON CONFLICT (restaurant_id, session_date) DO NOTHING;