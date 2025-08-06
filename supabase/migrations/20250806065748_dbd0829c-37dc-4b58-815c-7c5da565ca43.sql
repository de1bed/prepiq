-- Add recipe ingredients for all recipes
DO $$
DECLARE
    pico_id uuid;
    chicken_id uuid;
    avocado_id uuid;
    taquitos_id uuid;
BEGIN
    SELECT id INTO pico_id FROM recipes WHERE name = 'Pico de Gallo' AND restaurant_id = '24802dac-d026-4ac8-87bd-b3f22d8bd97e';
    SELECT id INTO chicken_id FROM recipes WHERE name = 'Chicken Mix' AND restaurant_id = '24802dac-d026-4ac8-87bd-b3f22d8bd97e';
    SELECT id INTO avocado_id FROM recipes WHERE name = 'Spicy Avocado' AND restaurant_id = '24802dac-d026-4ac8-87bd-b3f22d8bd97e';
    SELECT id INTO taquitos_id FROM recipes WHERE name = 'Taquitos' AND restaurant_id = '24802dac-d026-4ac8-87bd-b3f22d8bd97e';

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

    -- Add recipe dependencies for Taquitos
    INSERT INTO recipe_dependencies (parent_recipe_id, child_recipe_id, quantity_needed, unit) VALUES
    (taquitos_id, chicken_id, 2, 'oz'),
    (taquitos_id, pico_id, 1, 'oz'),
    (taquitos_id, avocado_id, 0.5, 'oz');

    -- Insert initial prep availability
    INSERT INTO prep_availability (restaurant_id, session_id, recipe_id, available_batches) VALUES
    ('24802dac-d026-4ac8-87bd-b3f22d8bd97e', (SELECT id FROM daily_sessions WHERE restaurant_id = '24802dac-d026-4ac8-87bd-b3f22d8bd97e' AND session_date = CURRENT_DATE), pico_id, 2),
    ('24802dac-d026-4ac8-87bd-b3f22d8bd97e', (SELECT id FROM daily_sessions WHERE restaurant_id = '24802dac-d026-4ac8-87bd-b3f22d8bd97e' AND session_date = CURRENT_DATE), chicken_id, 1),
    ('24802dac-d026-4ac8-87bd-b3f22d8bd97e', (SELECT id FROM daily_sessions WHERE restaurant_id = '24802dac-d026-4ac8-87bd-b3f22d8bd97e' AND session_date = CURRENT_DATE), avocado_id, 3);
END $$;