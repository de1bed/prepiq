-- Add missing WITH CHECK policies and allow profile bootstrap

-- 1) Allow authenticated users to create their own profile so RLS helper functions work
CREATE POLICY "Users can create their own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- 2) Sessions: allow managers/admins to create daily sessions
CREATE POLICY "Managers can create sessions"
ON public.daily_sessions
FOR INSERT
TO authenticated
WITH CHECK (
  restaurant_id = get_user_restaurant() AND
  get_user_role() = ANY (ARRAY['manager'::user_role, 'admin'::user_role])
);

-- 3) Recipes: allow managers/admins to insert and update
CREATE POLICY "Managers can insert recipes"
ON public.recipes
FOR INSERT
TO authenticated
WITH CHECK (
  restaurant_id = get_user_restaurant() AND
  get_user_role() = ANY (ARRAY['manager'::user_role, 'admin'::user_role])
);

CREATE POLICY "Managers can update recipes with check"
ON public.recipes
FOR UPDATE
TO authenticated
USING (
  restaurant_id = get_user_restaurant() AND
  get_user_role() = ANY (ARRAY['manager'::user_role, 'admin'::user_role])
)
WITH CHECK (
  restaurant_id = get_user_restaurant() AND
  get_user_role() = ANY (ARRAY['manager'::user_role, 'admin'::user_role])
);

-- 4) Recipe ingredients: allow managers/admins to insert
CREATE POLICY "Managers can insert recipe ingredients"
ON public.recipe_ingredients
FOR INSERT
TO authenticated
WITH CHECK (
  (recipe_id IN (SELECT r.id FROM public.recipes r WHERE r.restaurant_id = get_user_restaurant())) AND
  get_user_role() = ANY (ARRAY['manager'::user_role, 'admin'::user_role])
);

-- 5) Orders: allow staff to insert orders in their restaurant
CREATE POLICY "Staff can insert orders"
ON public.orders
FOR INSERT
TO authenticated
WITH CHECK (restaurant_id = get_user_restaurant());

-- 6) Order items: allow staff to insert items for orders in their restaurant
CREATE POLICY "Staff can insert order items"
ON public.order_items
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_id AND o.restaurant_id = get_user_restaurant()
  )
);
