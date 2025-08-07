import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Plus, Trash2, Edit, ChefHat, Eye } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { RecipeViewer } from './RecipeViewer';

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
  is_active: boolean;
  price: number;
  recipe_ingredients: {
    ingredient_name: string;
    quantity: number;
    unit: string;
  }[];
}

interface Ingredient {
  ingredient_name: string;
  quantity: number;
  unit: string;
}

const STATIONS = [
  { value: 'grill', label: 'Grill' },
  { value: 'fry', label: 'Fryer' },
  { value: 'salads', label: 'Salads' },
  { value: 'broiler', label: 'Broiler' },
  { value: 'prep', label: 'Prep' }
];

const CATEGORIES = [
  'Appetizer', 'Main Dish', 'Side', 'Dessert', 'Beverage', 'Sauce', 'Prep'
];

const RECIPE_TYPES = [
  { value: 'prep', label: 'Prep Item' },
  { value: 'line_cook', label: 'Line Cook' }
];

export function RecipeManager({ canEdit = false }: { canEdit?: boolean }) {
  const { profile } = useAuth();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [viewingRecipe, setViewingRecipe] = useState<Recipe | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  
// Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: '',
    recipe_type: 'line_cook' as 'prep' | 'line_cook',
    stations: [] as ('grill' | 'fry' | 'salads' | 'broiler' | 'prep')[],
    batch_size: 1,
    prep_time_minutes: 0,
    cook_time_minutes: 0,
    price: 0,
  });
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);

  useEffect(() => {
    if (profile?.restaurant_id) {
      fetchRecipes();
    }
  }, [profile?.restaurant_id]);

  const fetchRecipes = async () => {
    if (!profile?.restaurant_id) return;

    try {
      const { data, error } = await supabase
        .from('recipes')
        .select(`
          *,
          recipe_ingredients(ingredient_name, quantity, unit)
        `)
        .eq('restaurant_id', profile.restaurant_id)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setRecipes(data || []);
    } catch (error) {
      console.error('Error fetching recipes:', error);
    }
  };

  const handleSaveRecipe = async () => {
    if (!profile?.restaurant_id || !formData.name || ingredients.length === 0) {
      toast({
        title: "Error",
        description: "Complete all required fields",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      let recipeId = selectedRecipe?.id;

      if (selectedRecipe) {
        // Update existing recipe
        const { error: updateError } = await supabase
          .from('recipes')
          .update({
            name: formData.name,
            description: formData.description,
            category: formData.category,
            recipe_type: formData.recipe_type,
            stations: formData.stations as any,
            batch_size: formData.batch_size,
            prep_time_minutes: formData.prep_time_minutes,
            cook_time_minutes: formData.cook_time_minutes,
            price: formData.price,
          })
          .eq('id', selectedRecipe.id);

        if (updateError) throw updateError;

        // Delete existing ingredients
        const { error: deleteError } = await supabase
          .from('recipe_ingredients')
          .delete()
          .eq('recipe_id', selectedRecipe.id);

        if (deleteError) throw deleteError;
      } else {
        // Create new recipe
        const { data: newRecipe, error: createError } = await supabase
          .from('recipes')
          .insert({
            restaurant_id: profile.restaurant_id,
            name: formData.name,
            description: formData.description,
            category: formData.category,
            recipe_type: formData.recipe_type,
            stations: formData.stations as any,
            batch_size: formData.batch_size,
            prep_time_minutes: formData.prep_time_minutes,
            cook_time_minutes: formData.cook_time_minutes,
            price: formData.price,
          })
          .select()
          .single();

        if (createError) throw createError;
        recipeId = newRecipe.id;
      }

      // Insert new ingredients
      const { error: ingredientsError } = await supabase
        .from('recipe_ingredients')
        .insert(
          ingredients.map(ing => ({
            recipe_id: recipeId,
            ingredient_name: ing.ingredient_name,
            quantity: ing.quantity,
            unit: ing.unit
          }))
        );

      if (ingredientsError) throw ingredientsError;

      toast({
        title: "Success",
        description: selectedRecipe ? "Recipe updated" : "Recipe created"
      });

      setIsDialogOpen(false);
      resetForm();
      fetchRecipes();
    } catch (error) {
      console.error('Error saving recipe:', error);
      toast({
        title: "Error",
        description: "Error saving recipe",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEditRecipe = (recipe: Recipe) => {
    setSelectedRecipe(recipe);
    setFormData({
      name: recipe.name,
      description: recipe.description || '',
      category: recipe.category,
      recipe_type: recipe.recipe_type as 'prep' | 'line_cook',
      stations: recipe.stations as any,
      batch_size: recipe.batch_size,
      prep_time_minutes: recipe.prep_time_minutes || 0,
      cook_time_minutes: recipe.cook_time_minutes || 0,
      price: recipe.price || 0,
    });
    setIngredients(recipe.recipe_ingredients || []);
    setIsDialogOpen(true);
  };

  const handleDeleteRecipe = async (recipeId: string) => {
    if (!confirm('Are you sure you want to delete this recipe?')) return;

    try {
      const { error } = await supabase
        .from('recipes')
        .update({ is_active: false })
        .eq('id', recipeId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Recipe deleted"
      });

      fetchRecipes();
    } catch (error) {
      console.error('Error deleting recipe:', error);
      toast({
        title: "Error",
        description: "Error deleting recipe",
        variant: "destructive"
      });
    }
  };

  const addIngredient = () => {
    setIngredients([...ingredients, { ingredient_name: '', quantity: 0, unit: '' }]);
  };

  const updateIngredient = (index: number, field: keyof Ingredient, value: string | number) => {
    const updated = [...ingredients];
    updated[index] = { ...updated[index], [field]: value };
    setIngredients(updated);
  };

  const removeIngredient = (index: number) => {
    setIngredients(ingredients.filter((_, i) => i !== index));
  };

  const resetForm = () => {
    setSelectedRecipe(null);
    setFormData({
      name: '',
      description: '',
      category: '',
      recipe_type: 'line_cook',
      stations: [],
      batch_size: 1,
      prep_time_minutes: 0,
      cook_time_minutes: 0,
      price: 0,
    });
    setIngredients([]);
  };

  const handleViewRecipe = (recipe: Recipe) => {
    setViewingRecipe(recipe);
    setIsViewerOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <ChefHat className="h-6 w-6" />
          Recipes
        </h2>
        {canEdit && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus className="mr-2 h-4 w-4" />
                New Recipe
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {selectedRecipe ? 'Edit Recipe' : 'New Recipe'}
                </DialogTitle>
              </DialogHeader>
              
              <div className="space-y-6">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="name">Name *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="category">Category</Label>
                    <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map(cat => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="recipe_type">Recipe Type</Label>
                    <Select value={formData.recipe_type} onValueChange={(value: 'prep' | 'line_cook') => setFormData({ ...formData, recipe_type: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {RECIPE_TYPES.map(type => (
                          <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>

                <div>
                  <Label>Stations</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {STATIONS.map(station => (
                      <div key={station.value} className="flex items-center space-x-2">
                        <Checkbox
                          id={station.value}
                          checked={formData.stations.includes(station.value as any)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setFormData({ ...formData, stations: [...formData.stations, station.value as any] });
                            } else {
                              setFormData({ ...formData, stations: formData.stations.filter(s => s !== station.value) });
                            }
                          }}
                        />
                        <Label htmlFor={station.value}>{station.label}</Label>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="batch_size">Batch Size</Label>
                    <Input
                      id="batch_size"
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={formData.batch_size}
                      onChange={(e) => setFormData({ ...formData, batch_size: parseFloat(e.target.value) || 1 })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="prep_time">Prep Time (min)</Label>
                    <Input
                      id="prep_time"
                      type="number"
                      min="0"
                      value={formData.prep_time_minutes}
                      onChange={(e) => setFormData({ ...formData, prep_time_minutes: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="cook_time">Cook Time (min)</Label>
                    <Input
                      id="cook_time"
                      type="number"
                      min="0"
                      value={formData.cook_time_minutes}
                      onChange={(e) => setFormData({ ...formData, cook_time_minutes: parseInt(e.target.value) || 0 })}
                    />
                  </div>

                  <div>
                    <Label htmlFor="price">Price</Label>
                    <Input
                      id="price"
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-4">
                    <Label>Ingredients *</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addIngredient}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Ingredient
                    </Button>
                  </div>
                  
                  <div className="space-y-3">
                    {ingredients.map((ingredient, index) => (
                      <div key={index} className="grid grid-cols-4 gap-2 items-end">
                        <Input
                          placeholder="Ingredient"
                          value={ingredient.ingredient_name}
                          onChange={(e) => updateIngredient(index, 'ingredient_name', e.target.value)}
                        />
                        <Input
                          placeholder="Quantity"
                          type="number"
                          min="0"
                          step="0.1"
                          value={ingredient.quantity}
                          onChange={(e) => updateIngredient(index, 'quantity', parseFloat(e.target.value) || 0)}
                        />
                        <Input
                          placeholder="Unit (oz, lbs, cups)"
                          value={ingredient.unit}
                          onChange={(e) => updateIngredient(index, 'unit', e.target.value)}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removeIngredient(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSaveRecipe} disabled={loading}>
                    {loading ? 'Saving...' : 'Save'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {recipes.map((recipe) => (
          <Card key={recipe.id}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-lg">{recipe.name}</CardTitle>
                  <Badge variant="secondary" className="mt-1">
                    {recipe.category}
                  </Badge>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleViewRecipe(recipe)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  {canEdit && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditRecipe(recipe)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteRecipe(recipe.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {recipe.description && (
                <p className="text-sm text-muted-foreground">{recipe.description}</p>
              )}
              
              <div>
                <p className="text-sm font-medium">Stations:</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {recipe.stations.map((station) => (
                    <Badge key={station} variant="outline" className="text-xs">
                      {STATIONS.find(s => s.value === station)?.label || station}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="font-medium">Batch:</span> {recipe.batch_size}
                </div>
                <div>
                  <span className="font-medium">Prep:</span> {recipe.prep_time_minutes}min
                </div>
              </div>

              <div>
                <p className="text-sm font-medium mb-2">Ingredients:</p>
                <div className="space-y-1">
                  {recipe.recipe_ingredients?.map((ing, idx) => (
                    <div key={idx} className="text-xs flex justify-between">
                      <span>{ing.ingredient_name}</span>
                      <span>{ing.quantity} {ing.unit}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recipe Viewer Modal */}
      <RecipeViewer
        recipe={viewingRecipe}
        isOpen={isViewerOpen}
        onClose={() => setIsViewerOpen(false)}
        onViewRecipe={handleViewRecipe}
      />
    </div>
  );
}