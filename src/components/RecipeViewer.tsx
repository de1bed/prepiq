import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { ChefHat, Clock, Users } from 'lucide-react';

interface Recipe {
  id: string;
  name: string;
  description: string;
  category: string;
  recipe_type: string;
  stations: string[];
  batch_size: number;
  prep_time_minutes: number;
  cook_time_minutes: number;
  recipe_ingredients: {
    ingredient_name: string;
    quantity: number;
    unit: string;
  }[];
}

interface RecipeDependency {
  child_recipe_id: string;
  quantity_needed: number;
  unit: string;
  child_recipe: Recipe;
}

interface RecipeViewerProps {
  recipe: Recipe | null;
  isOpen: boolean;
  onClose: () => void;
  onViewRecipe: (recipe: Recipe) => void;
}

const STATIONS = [
  { value: 'grill', label: 'Grill' },
  { value: 'fry', label: 'Fryer' },
  { value: 'salads', label: 'Salads' },
  { value: 'broiler', label: 'Broiler' },
  { value: 'prep', label: 'Prep' }
];

export function RecipeViewer({ recipe, isOpen, onClose, onViewRecipe }: RecipeViewerProps) {
  const { profile } = useAuth();
  const [dependencies, setDependencies] = useState<RecipeDependency[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (recipe && isOpen) {
      fetchDependencies();
    }
  }, [recipe, isOpen]);

  const fetchDependencies = async () => {
    if (!recipe || !profile?.restaurant_id) return;

    setLoading(true);
    try {
      // First get the dependencies
      const { data: deps, error: depsError } = await supabase
        .from('recipe_dependencies')
        .select('child_recipe_id, quantity_needed, unit')
        .eq('parent_recipe_id', recipe.id);

      if (depsError) throw depsError;

      // Then get the child recipes
      if (deps && deps.length > 0) {
        const childRecipeIds = deps.map(dep => dep.child_recipe_id);
        const { data: childRecipes, error: recipesError } = await supabase
          .from('recipes')
          .select(`
            id,
            name,
            description,
            category,
            recipe_type,
            stations,
            batch_size,
            prep_time_minutes,
            cook_time_minutes,
            recipe_ingredients(ingredient_name, quantity, unit)
          `)
          .in('id', childRecipeIds);

        if (recipesError) throw recipesError;

        // Combine the data
        const combinedDeps = deps.map(dep => {
          const childRecipe = childRecipes?.find(r => r.id === dep.child_recipe_id);
          return {
            ...dep,
            child_recipe: childRecipe
          };
        }).filter(dep => dep.child_recipe) as RecipeDependency[];

        setDependencies(combinedDeps);
      } else {
        setDependencies([]);
      }
    } catch (error) {
      console.error('Error fetching recipe dependencies:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubRecipeClick = (subRecipe: Recipe) => {
    onViewRecipe(subRecipe);
  };

  if (!recipe) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ChefHat className="h-5 w-5" />
            {recipe.name}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Recipe Info */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{recipe.category}</Badge>
                <Badge variant={recipe.recipe_type === 'prep' ? 'default' : 'outline'}>
                  {recipe.recipe_type === 'prep' ? 'Prep Item' : 'Line Cook'}
                </Badge>
              </div>
              {recipe.description && (
                <p className="text-sm text-muted-foreground">{recipe.description}</p>
              )}
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                <span className="text-sm">Batch Size: {recipe.batch_size}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span className="text-sm">
                  Prep: {recipe.prep_time_minutes}min | Cook: {recipe.cook_time_minutes}min
                </span>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Stations:</p>
              <div className="flex flex-wrap gap-1">
                {recipe.stations.map((station) => (
                  <Badge key={station} variant="outline" className="text-xs">
                    {STATIONS.find(s => s.value === station)?.label || station}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          {/* Sub-recipes (Dependencies) */}
          {dependencies.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3">Recipe Components:</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {dependencies.map((dep) => (
                  <div
                    key={dep.child_recipe_id}
                    className="p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => handleSubRecipeClick(dep.child_recipe)}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-blue-600 hover:text-blue-800">
                          {dep.child_recipe.name}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {dep.quantity_needed} {dep.unit}
                        </p>
                        <Badge variant="outline" className="text-xs mt-1">
                          {dep.child_recipe.recipe_type === 'prep' ? 'Prep Item' : 'Line Cook'}
                        </Badge>
                      </div>
                      <Button variant="ghost" size="sm">
                        View Recipe →
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Raw Ingredients */}
          <div>
            <h3 className="text-lg font-semibold mb-3">
              {dependencies.length > 0 ? 'Additional Ingredients:' : 'Ingredients:'}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {recipe.recipe_ingredients?.map((ing, idx) => (
                <div key={idx} className="flex justify-between items-center p-2 bg-muted/30 rounded">
                  <span className="font-medium">{ing.ingredient_name}</span>
                  <span className="text-sm text-muted-foreground">
                    {ing.quantity} {ing.unit}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}