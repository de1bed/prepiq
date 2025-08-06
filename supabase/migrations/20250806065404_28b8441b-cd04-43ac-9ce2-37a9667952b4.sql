-- Add sample employees (Pedro, Angel, Maria)
INSERT INTO profiles (user_id, restaurant_id, first_name, last_name, employee_number, role, is_active) VALUES
('00000000-0000-0000-0000-000000000001', '24802dac-d026-4ac8-87bd-b3f22d8bd97e', 'Pedro', 'Martinez', '222', 'cook', true),
('00000000-0000-0000-0000-000000000002', '24802dac-d026-4ac8-87bd-b3f22d8bd97e', 'Angel', 'Rodriguez', '333', 'prep', true),
('00000000-0000-0000-0000-000000000003', '24802dac-d026-4ac8-87bd-b3f22d8bd97e', 'Maria', 'Garcia', '111', 'server', true);

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