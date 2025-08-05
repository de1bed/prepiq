-- Create enums
CREATE TYPE public.user_role AS ENUM ('manager', 'server', 'prep', 'cook', 'admin');
CREATE TYPE public.order_status AS ENUM ('pending', 'preparing', 'ready', 'delivered', 'cancelled');
CREATE TYPE public.station_type AS ENUM ('grill', 'fry', 'salads', 'broiler', 'prep');
CREATE TYPE public.clock_status AS ENUM ('clocked_in', 'on_break', 'clocked_out');

-- Create restaurants table
CREATE TABLE public.restaurants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  employee_number TEXT UNIQUE NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  role public.user_role NOT NULL DEFAULT 'server',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create daily sessions table
CREATE TABLE public.daily_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ended_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(restaurant_id, session_date)
);

-- Create recipes table
CREATE TABLE public.recipes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  stations public.station_type[] NOT NULL DEFAULT '{}',
  batch_size DECIMAL NOT NULL DEFAULT 1,
  prep_time_minutes INTEGER,
  cook_time_minutes INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create recipe ingredients table
CREATE TABLE public.recipe_ingredients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  ingredient_name TEXT NOT NULL,
  quantity DECIMAL NOT NULL,
  unit TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create inventory table
CREATE TABLE public.inventory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  ingredient_name TEXT NOT NULL,
  current_quantity DECIMAL NOT NULL DEFAULT 0,
  unit TEXT NOT NULL,
  min_threshold DECIMAL DEFAULT 0,
  last_updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(restaurant_id, ingredient_name)
);

-- Create prep availability table
CREATE TABLE public.prep_availability (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.daily_sessions(id) ON DELETE CASCADE,
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  available_batches DECIMAL NOT NULL DEFAULT 0,
  last_updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(session_id, recipe_id)
);

-- Create orders table
CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.daily_sessions(id) ON DELETE CASCADE,
  order_number INTEGER NOT NULL,
  table_number TEXT,
  server_id UUID REFERENCES public.profiles(id),
  status public.order_status NOT NULL DEFAULT 'pending',
  stations public.station_type[] NOT NULL DEFAULT '{}',
  special_instructions TEXT,
  ordered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create order items table
CREATE TABLE public.order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  modifications TEXT[],
  station_assignments public.station_type[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create clock logs table
CREATE TABLE public.clock_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.daily_sessions(id) ON DELETE CASCADE,
  status public.clock_status NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create prep logs table for tracking when items are prepped
CREATE TABLE public.prep_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.daily_sessions(id) ON DELETE CASCADE,
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  batch_quantity DECIMAL NOT NULL,
  container_info TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prep_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clock_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prep_logs ENABLE ROW LEVEL SECURITY;

-- Create function to get user's restaurant
CREATE OR REPLACE FUNCTION public.get_user_restaurant()
RETURNS UUID AS $$
  SELECT restaurant_id FROM public.profiles WHERE user_id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Create function to get user's role
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS public.user_role AS $$
  SELECT role FROM public.profiles WHERE user_id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- RLS Policies for restaurants
CREATE POLICY "Users can view their restaurant" ON public.restaurants
  FOR SELECT USING (id = public.get_user_restaurant());

CREATE POLICY "Admins can modify restaurants" ON public.restaurants
  FOR ALL USING (public.get_user_role() = 'admin');

-- RLS Policies for profiles
CREATE POLICY "Users can view profiles in their restaurant" ON public.profiles
  FOR SELECT USING (restaurant_id = public.get_user_restaurant());

CREATE POLICY "Managers can modify profiles in their restaurant" ON public.profiles
  FOR ALL USING (restaurant_id = public.get_user_restaurant() AND public.get_user_role() IN ('manager', 'admin'));

-- RLS Policies for daily_sessions
CREATE POLICY "Users can view sessions in their restaurant" ON public.daily_sessions
  FOR SELECT USING (restaurant_id = public.get_user_restaurant());

CREATE POLICY "Managers can modify sessions" ON public.daily_sessions
  FOR ALL USING (restaurant_id = public.get_user_restaurant() AND public.get_user_role() IN ('manager', 'admin'));

-- RLS Policies for recipes
CREATE POLICY "Users can view recipes in their restaurant" ON public.recipes
  FOR SELECT USING (restaurant_id = public.get_user_restaurant());

CREATE POLICY "Managers can modify recipes" ON public.recipes
  FOR ALL USING (restaurant_id = public.get_user_restaurant() AND public.get_user_role() IN ('manager', 'admin'));

-- RLS Policies for recipe_ingredients
CREATE POLICY "Users can view recipe ingredients" ON public.recipe_ingredients
  FOR SELECT USING (
    recipe_id IN (
      SELECT id FROM public.recipes WHERE restaurant_id = public.get_user_restaurant()
    )
  );

CREATE POLICY "Managers can modify recipe ingredients" ON public.recipe_ingredients
  FOR ALL USING (
    recipe_id IN (
      SELECT id FROM public.recipes WHERE restaurant_id = public.get_user_restaurant()
    ) AND public.get_user_role() IN ('manager', 'admin')
  );

-- RLS Policies for inventory
CREATE POLICY "Users can view inventory in their restaurant" ON public.inventory
  FOR SELECT USING (restaurant_id = public.get_user_restaurant());

CREATE POLICY "Staff can modify inventory" ON public.inventory
  FOR ALL USING (restaurant_id = public.get_user_restaurant());

-- RLS Policies for prep_availability
CREATE POLICY "Users can view prep availability in their restaurant" ON public.prep_availability
  FOR SELECT USING (restaurant_id = public.get_user_restaurant());

CREATE POLICY "Staff can modify prep availability" ON public.prep_availability
  FOR ALL USING (restaurant_id = public.get_user_restaurant());

-- RLS Policies for orders
CREATE POLICY "Users can view orders in their restaurant" ON public.orders
  FOR SELECT USING (restaurant_id = public.get_user_restaurant());

CREATE POLICY "Staff can create and modify orders" ON public.orders
  FOR ALL USING (restaurant_id = public.get_user_restaurant());

-- RLS Policies for order_items
CREATE POLICY "Users can view order items" ON public.order_items
  FOR SELECT USING (
    order_id IN (
      SELECT id FROM public.orders WHERE restaurant_id = public.get_user_restaurant()
    )
  );

CREATE POLICY "Staff can modify order items" ON public.order_items
  FOR ALL USING (
    order_id IN (
      SELECT id FROM public.orders WHERE restaurant_id = public.get_user_restaurant()
    )
  );

-- RLS Policies for clock_logs
CREATE POLICY "Users can view clock logs in their restaurant" ON public.clock_logs
  FOR SELECT USING (restaurant_id = public.get_user_restaurant());

CREATE POLICY "Staff can create clock logs" ON public.clock_logs
  FOR INSERT WITH CHECK (restaurant_id = public.get_user_restaurant());

CREATE POLICY "Managers can modify clock logs" ON public.clock_logs
  FOR UPDATE USING (restaurant_id = public.get_user_restaurant() AND public.get_user_role() IN ('manager', 'admin'));

-- RLS Policies for prep_logs
CREATE POLICY "Users can view prep logs in their restaurant" ON public.prep_logs
  FOR SELECT USING (restaurant_id = public.get_user_restaurant());

CREATE POLICY "Staff can create prep logs" ON public.prep_logs
  FOR INSERT WITH CHECK (restaurant_id = public.get_user_restaurant());

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_restaurants_updated_at
  BEFORE UPDATE ON public.restaurants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_recipes_updated_at
  BEFORE UPDATE ON public.recipes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.prep_availability;
ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory;
ALTER PUBLICATION supabase_realtime ADD TABLE public.clock_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.prep_logs;