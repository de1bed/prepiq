-- Add sample employees (Pedro, Angel, Maria)
INSERT INTO profiles (user_id, restaurant_id, first_name, last_name, employee_number, role, is_active) VALUES
('00000000-0000-0000-0000-000000000001', 'mock-restaurant-id', 'Pedro', 'Martinez', '222', 'cook', true),
('00000000-0000-0000-0000-000000000002', 'mock-restaurant-id', 'Angel', 'Rodriguez', '333', 'prep', true),
('00000000-0000-0000-0000-000000000003', 'mock-restaurant-id', 'Maria', 'Garcia', '111', 'server', true);

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
('mock-restaurant-id', 'Pico de Gallo', 'Fresh tomato, onion, and cilantro salsa', 'Sauce', 'prep', '{"prep"}', 2, 15, 0),
('mock-restaurant-id', 'Chicken Mix', 'Seasoned pulled chicken for tacos', 'Protein', 'prep', '{"prep"}', 3, 45, 30),
('mock-restaurant-id', 'Spicy Avocado', 'Creamy spiced avocado spread', 'Sauce', 'prep', '{"prep"}', 1.5, 10, 0),
('mock-restaurant-id', 'Taquitos', 'Crispy chicken taquitos with fresh toppings', 'Main Dish', 'line_cook', '{"fry", "prep"}', 4, 5, 8);

-- Get recipe IDs for dependencies
DO $$
DECLARE
    taquitos_id uuid;
    pico_id uuid;
    chicken_id uuid;
    avocado_id uuid;
BEGIN
    SELECT id INTO taquitos_id FROM recipes WHERE name = 'Taquitos' AND restaurant_id = 'mock-restaurant-id';
    SELECT id INTO pico_id FROM recipes WHERE name = 'Pico de Gallo' AND restaurant_id = 'mock-restaurant-id';
    SELECT id INTO chicken_id FROM recipes WHERE name = 'Chicken Mix' AND restaurant_id = 'mock-restaurant-id';
    SELECT id INTO avocado_id FROM recipes WHERE name = 'Spicy Avocado' AND restaurant_id = 'mock-restaurant-id';

    -- Add recipe dependencies for Taquitos
    INSERT INTO recipe_dependencies (parent_recipe_id, child_recipe_id, quantity_needed, unit) VALUES
    (taquitos_id, chicken_id, 2, 'oz'),
    (taquitos_id, pico_id, 1, 'oz'),
    (taquitos_id, avocado_id, 0.5, 'oz');
END $$;

-- Insert recipe ingredients for prep items
DO $$
DECLARE
    pico_id uuid;
    chicken_id uuid;
    avocado_id uuid;
    taquitos_id uuid;
BEGIN
    SELECT id INTO pico_id FROM recipes WHERE name = 'Pico de Gallo' AND restaurant_id = 'mock-restaurant-id';
    SELECT id INTO chicken_id FROM recipes WHERE name = 'Chicken Mix' AND restaurant_id = 'mock-restaurant-id';
    SELECT id INTO avocado_id FROM recipes WHERE name = 'Spicy Avocado' AND restaurant_id = 'mock-restaurant-id';
    SELECT id INTO taquitos_id FROM recipes WHERE name = 'Taquitos' AND restaurant_id = 'mock-restaurant-id';

    -- Pico de Gallo ingredients
    INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity, unit) VALUES
    (pico_id, 'Tomatoes', 4, 'whole'),
    (pico_id, 'White Onion', 0.5, 'whole'),
    (pico_id, 'Cilantro', 0.5, 'bunch'),
    (pico_id, 'Lime Juice', 2, 'tbsp'),
    (pico_id, 'Salt', 1, 'tsp');

    -- Chicken Mix ingredients
    INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity, unit) VALUES
    (chicken_id, 'Chicken Breast', 2, 'lbs'),
    (chicken_id, 'Garlic Powder', 1, 'tsp'),
    (chicken_id, 'Cumin', 1, 'tsp'),
    (chicken_id, 'Paprika', 1, 'tsp'),
    (chicken_id, 'Salt', 1, 'tsp'),
    (chicken_id, 'Black Pepper', 0.5, 'tsp');

    -- Spicy Avocado ingredients
    INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity, unit) VALUES
    (avocado_id, 'Avocados', 3, 'whole'),
    (avocado_id, 'Lime Juice', 1, 'tbsp'),
    (avocado_id, 'Jalapeño', 0.5, 'whole'),
    (avocado_id, 'Salt', 0.5, 'tsp'),
    (avocado_id, 'Garlic Powder', 0.25, 'tsp');

    -- Taquitos assembly ingredients (non-clickable items)
    INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity, unit) VALUES
    (taquitos_id, 'Corn Tortillas', 8, 'pieces'),
    (taquitos_id, 'Vegetable Oil', 2, 'cups');
END $$;

-- Insert initial inventory
INSERT INTO inventory (restaurant_id, ingredient_name, current_quantity, unit, min_threshold) VALUES
('mock-restaurant-id', 'Tomatoes', 25, 'lbs', 5),
('mock-restaurant-id', 'White Onion', 15, 'lbs', 3),
('mock-restaurant-id', 'Cilantro', 8, 'bunches', 2),
('mock-restaurant-id', 'Lime Juice', 6, 'bottles', 1),
('mock-restaurant-id', 'Salt', 5, 'lbs', 1),
('mock-restaurant-id', 'Chicken Breast', 20, 'lbs', 5),
('mock-restaurant-id', 'Garlic Powder', 3, 'lbs', 0.5),
('mock-restaurant-id', 'Cumin', 2, 'lbs', 0.5),
('mock-restaurant-id', 'Paprika', 2, 'lbs', 0.5),
('mock-restaurant-id', 'Black Pepper', 1, 'lbs', 0.25),
('mock-restaurant-id', 'Avocados', 30, 'whole', 10),
('mock-restaurant-id', 'Jalapeño', 5, 'lbs', 1),
('mock-restaurant-id', 'Corn Tortillas', 200, 'pieces', 50),
('mock-restaurant-id', 'Vegetable Oil', 8, 'gallons', 2);

-- Create active session for today
INSERT INTO daily_sessions (restaurant_id, session_date, is_active) VALUES
('mock-restaurant-id', CURRENT_DATE, true)
ON CONFLICT (restaurant_id, session_date) DO NOTHING;

-- Insert initial prep availability
DO $$
DECLARE
    session_id uuid;
    pico_id uuid;
    chicken_id uuid;
    avocado_id uuid;
BEGIN
    SELECT id INTO session_id FROM daily_sessions WHERE restaurant_id = 'mock-restaurant-id' AND session_date = CURRENT_DATE;
    SELECT id INTO pico_id FROM recipes WHERE name = 'Pico de Gallo' AND restaurant_id = 'mock-restaurant-id';
    SELECT id INTO chicken_id FROM recipes WHERE name = 'Chicken Mix' AND restaurant_id = 'mock-restaurant-id';
    SELECT id INTO avocado_id FROM recipes WHERE name = 'Spicy Avocado' AND restaurant_id = 'mock-restaurant-id';

    INSERT INTO prep_availability (restaurant_id, session_id, recipe_id, available_batches) VALUES
    ('mock-restaurant-id', session_id, pico_id, 2),
    ('mock-restaurant-id', session_id, chicken_id, 1),
    ('mock-restaurant-id', session_id, avocado_id, 3);
END $$;