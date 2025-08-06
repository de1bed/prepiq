import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSession } from "@/hooks/useSession";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { AIAssistant } from "@/components/AIAssistant";
import { 
  ArrowLeft,
  Printer,
  Scale,
  Search,
  Clock,
  CheckCircle,
  Package,
  TrendingUp,
  Weight
} from "lucide-react";

interface Recipe {
  id: string;
  name: string;
  category: string;
  description?: string;
  batch_size: number;
  ingredients: Array<{
    ingredient_name: string;
    quantity: number;
    unit: string;
  }>;
}

interface PrepAvailability {
  id: string;
  recipe_id: string;
  available_batches: number;
  recipe: Recipe;
}

interface PrepLogEntry {
  id: string;
  recipe: Recipe;
  batch_quantity: number;
  container_info?: string;
  created_at: string;
}

const Prep = () => {
  const { profile, user } = useAuth();
  const { currentSession } = useSession();
  const { toast } = useToast();
  
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [prepAvailability, setPrepAvailability] = useState<PrepAvailability[]>([]);
  const [recentPrepLogs, setRecentPrepLogs] = useState<PrepLogEntry[]>([]);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [selectedContainer, setSelectedContainer] = useState("");
  const [customBatchSize, setCustomBatchSize] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [useCustomBatch, setUseCustomBatch] = useState(false);
  const [labelCount, setLabelCount] = useState(1);
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [loading, setLoading] = useState(false);

  const containers = ["Third Pan", "Half Pan", "Full Pan", "Quart Container", "Sixth Pan"];

  useEffect(() => {
    if (profile?.restaurant_id) {
      fetchRecipes();
      fetchPrepAvailability();
      fetchRecentPrepLogs();
    }
  }, [profile?.restaurant_id, currentSession]);

  const fetchRecipes = async () => {
    if (!profile?.restaurant_id) return;

    try {
      const { data, error } = await supabase
        .from('recipes')
        .select(`
          *,
          recipe_ingredients (
            ingredient_name,
            quantity,
            unit
          )
        `)
        .eq('restaurant_id', profile.restaurant_id)
        .eq('is_active', true);

      if (error) throw error;

      const formattedRecipes = data?.map(recipe => ({
        ...recipe,
        ingredients: recipe.recipe_ingredients || []
      })) || [];

      setRecipes(formattedRecipes);
    } catch (error) {
      console.error('Error fetching recipes:', error);
      toast({
        title: "Error",
        description: "Failed to load recipes",
        variant: "destructive"
      });
    }
  };

  const fetchPrepAvailability = async () => {
    if (!profile?.restaurant_id || !currentSession) return;

    try {
      const { data, error } = await supabase
        .from('prep_availability')
        .select(`
          *,
          recipes (
            *,
            recipe_ingredients (
              ingredient_name,
              quantity,
              unit
            )
          )
        `)
        .eq('restaurant_id', profile.restaurant_id)
        .eq('session_id', currentSession.id);

      if (error) throw error;

      const formattedData = data?.map(item => ({
        ...item,
        recipe: {
          ...item.recipes,
          ingredients: item.recipes?.recipe_ingredients || []
        }
      })) || [];

      setPrepAvailability(formattedData);
    } catch (error) {
      console.error('Error fetching prep availability:', error);
    }
  };

  const fetchRecentPrepLogs = async () => {
    if (!profile?.restaurant_id || !currentSession) return;

    try {
      const { data, error } = await supabase
        .from('prep_logs')
        .select(`
          *,
          recipes (
            *,
            recipe_ingredients (
              ingredient_name,
              quantity,
              unit
            )
          )
        `)
        .eq('restaurant_id', profile.restaurant_id)
        .eq('session_id', currentSession.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      const formattedData = data?.map(log => ({
        ...log,
        recipe: {
          ...log.recipes,
          ingredients: log.recipes?.recipe_ingredients || []
        }
      })) || [];

      setRecentPrepLogs(formattedData);
    } catch (error) {
      console.error('Error fetching prep logs:', error);
    }
  };

  const handlePrepComplete = async () => {
    if (!selectedRecipe || !selectedContainer || !user?.id || !currentSession) return;

    const batchQuantity = useCustomBatch ? 
      parseFloat(customBatchSize) || 1 : 
      selectedRecipe.batch_size;

    try {
      setLoading(true);

      // Create prep log
      const { error: logError } = await supabase
        .from('prep_logs')
        .insert({
          restaurant_id: profile.restaurant_id,
          session_id: currentSession.id,
          employee_id: user.id,
          recipe_id: selectedRecipe.id,
          batch_quantity: batchQuantity,
          container_info: selectedContainer
        });

      if (logError) throw logError;

      // Update or create prep availability
      const { data: existingAvailability } = await supabase
        .from('prep_availability')
        .select('*')
        .eq('restaurant_id', profile.restaurant_id)
        .eq('session_id', currentSession.id)
        .eq('recipe_id', selectedRecipe.id)
        .single();

      if (existingAvailability) {
        await supabase
          .from('prep_availability')
          .update({
            available_batches: existingAvailability.available_batches + batchQuantity,
            last_updated_at: new Date().toISOString()
          })
          .eq('id', existingAvailability.id);
      } else {
        await supabase
          .from('prep_availability')
          .insert({
            restaurant_id: profile.restaurant_id,
            session_id: currentSession.id,
            recipe_id: selectedRecipe.id,
            available_batches: batchQuantity
          });
      }

      // Update inventory (subtract ingredients used)
      for (const ingredient of selectedRecipe.ingredients) {
        const totalUsed = ingredient.quantity * batchQuantity;
        
        // Get current inventory first
        const { data: currentInventory } = await supabase
          .from('inventory')
          .select('current_quantity')
          .eq('restaurant_id', profile.restaurant_id)
          .eq('ingredient_name', ingredient.ingredient_name)
          .single();

        if (currentInventory) {
          const newQuantity = Math.max(0, currentInventory.current_quantity - totalUsed);
          
          await supabase
            .from('inventory')
            .update({
              current_quantity: newQuantity,
              last_updated_at: new Date().toISOString()
            })
            .eq('restaurant_id', profile.restaurant_id)
            .eq('ingredient_name', ingredient.ingredient_name);
        }
      }

      setShowLabelModal(true);

    } catch (error) {
      console.error('Error completing prep:', error);
      toast({
        title: "Error",
        description: "Failed to complete prep operation",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const confirmPrint = async () => {
    toast({
      title: "Success",
      description: `${labelCount} label${labelCount > 1 ? 's' : ''} printed successfully!`
    });

    // Reset form
    setSelectedRecipe(null);
    setSelectedContainer("");
    setCustomBatchSize("");
    setUseCustomBatch(false);
    setLabelCount(1);
    setShowLabelModal(false);

    // Refresh data
    fetchPrepAvailability();
    fetchRecentPrepLogs();
  };

  const filteredRecipes = recipes.filter(recipe =>
    recipe.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    recipe.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const suggestedRecipes = searchQuery.length === 0 ? 
    recipes.slice(0, 6) : 
    filteredRecipes.slice(0, 6);

  const getCurrentStock = (recipeId: string) => {
    const availability = prepAvailability.find(p => p.recipe_id === recipeId);
    return availability?.available_batches || 0;
  };

  const todaysStats = {
    itemsPrepped: recentPrepLogs.length,
    totalBatches: recentPrepLogs.reduce((sum, log) => sum + log.batch_quantity, 0),
    efficiency: Math.min(95, 75 + recentPrepLogs.length * 2)
  };

  return (
    <div className="min-h-screen bg-background overflow-y-auto">
      {/* Header */}
      <header className="bg-white border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link to="/dashboard">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold">Prep Station</h1>
                <p className="text-muted-foreground">
                  Register prepared items and update inventory
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-4 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-3 space-y-6">
            {/* Search Bar */}
            <Card>
              <CardContent className="p-6">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search recipes..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 h-12 text-lg"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Recipe Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Package className="h-5 w-5" />
                  <span>Available Recipes</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-3 gap-4">
                  {suggestedRecipes.map((recipe) => (
                    <div
                      key={recipe.id}
                      onClick={() => setSelectedRecipe(recipe)}
                      className={`border rounded-lg p-4 cursor-pointer transition-all hover:border-primary ${
                        selectedRecipe?.id === recipe.id ? 'border-primary bg-primary/5' : 'border-border'
                      }`}
                    >
                      <h3 className="font-semibold text-lg">{recipe.name}</h3>
                      <p className="text-sm text-muted-foreground">{recipe.category}</p>
                      <p className="text-xs text-muted-foreground mt-1">{recipe.description}</p>
                      <div className="flex items-center justify-between mt-2">
                        <Badge variant="secondary">
                          {getCurrentStock(recipe.id)} batches available
                        </Badge>
                        {selectedRecipe?.id === recipe.id && (
                          <CheckCircle className="h-5 w-5 text-primary" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Prep Registration Form */}
            {selectedRecipe && (
              <Card className="border-primary">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Scale className="h-5 w-5" />
                    <span>Prep: {selectedRecipe.name}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Container Selector */}
                  <div>
                    <Label htmlFor="container" className="text-base font-medium">
                      Container Type
                    </Label>
                    <Select value={selectedContainer} onValueChange={setSelectedContainer}>
                      <SelectTrigger className="h-12 mt-2">
                        <SelectValue placeholder="Select container type" />
                      </SelectTrigger>
                      <SelectContent>
                        {containers.map((container) => (
                          <SelectItem key={container} value={container}>
                            {container}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Custom Batch Toggle */}
                  <div className="flex items-center space-x-3">
                    <Switch
                      id="custom-batch"
                      checked={useCustomBatch}
                      onCheckedChange={setUseCustomBatch}
                    />
                    <Label htmlFor="custom-batch" className="text-base font-medium">
                      Custom Batch Size
                    </Label>
                  </div>

                  {/* Batch Size Input */}
                  {useCustomBatch ? (
                    <div>
                      <Label htmlFor="batch-size" className="text-base font-medium">
                        Custom Batch Size
                      </Label>
                      <div className="relative mt-2">
                        <Weight className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="batch-size"
                          type="number"
                          step="0.1"
                          placeholder={`Standard: ${selectedRecipe.batch_size}`}
                          value={customBatchSize}
                          onChange={(e) => setCustomBatchSize(e.target.value)}
                          className="pl-10 h-12"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="bg-muted p-4 rounded-lg">
                      <p className="text-sm">
                        <strong>Standard batch size:</strong> {selectedRecipe.batch_size} servings
                      </p>
                    </div>
                  )}

                  {/* Ingredients Used */}
                  <div>
                    <Label className="text-base font-medium">Ingredients to be used:</Label>
                    <div className="mt-2 space-y-2">
                      {selectedRecipe.ingredients.map((ingredient, index) => {
                        const multiplier = useCustomBatch ? 
                          (parseFloat(customBatchSize) || 1) : 
                          selectedRecipe.batch_size;
                        const totalAmount = ingredient.quantity * multiplier;
                        
                        return (
                          <div key={index} className="flex justify-between text-sm p-2 bg-muted rounded">
                            <span>{ingredient.ingredient_name}</span>
                            <span>{totalAmount} {ingredient.unit}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Submit Button */}
                  <Button
                    onClick={handlePrepComplete}
                    disabled={!selectedContainer || loading}
                    className="w-full h-12 text-lg"
                    size="lg"
                  >
                    <Printer className="h-5 w-5 mr-2" />
                    {loading ? "Processing..." : "Complete Prep & Print Label"}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Recent Prep Logs */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Clock className="h-5 w-5" />
                  <span>Recent Prep Activity</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {recentPrepLogs.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    No prep activity yet today
                  </p>
                ) : (
                  <div className="space-y-3">
                    {recentPrepLogs.map((log) => (
                      <div key={log.id} className="flex justify-between items-center p-3 bg-muted rounded">
                        <div>
                          <p className="font-medium">{log.recipe.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {log.batch_quantity} batches • {log.container_info}
                          </p>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {new Date(log.created_at).toLocaleTimeString()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar Stats */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <TrendingUp className="h-5 w-5" />
                  <span>Today's Stats</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center">
                  <p className="text-3xl font-bold text-primary">{todaysStats.itemsPrepped}</p>
                  <p className="text-sm text-muted-foreground">Items Prepped</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-secondary">{todaysStats.totalBatches}</p>
                  <p className="text-sm text-muted-foreground">Total Batches</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-success">{todaysStats.efficiency}%</p>
                  <p className="text-sm text-muted-foreground">Efficiency</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Label Count Modal */}
      {showLabelModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-96">
            <CardHeader>
              <CardTitle>Print Labels</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label className="text-base font-medium">How many labels?</Label>
                  <div className="grid grid-cols-5 gap-2 mt-2">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                      <Button
                        key={num}
                        type="button"
                        variant={labelCount === num ? "default" : "outline"}
                        onClick={() => setLabelCount(num)}
                        className="h-10"
                      >
                        {num}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={confirmPrint} className="flex-1">
                    <Printer className="h-4 w-4 mr-2" />
                    Print {labelCount} Label{labelCount > 1 ? 's' : ''}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowLabelModal(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      
      <AIAssistant context="prep" />
    </div>
  );
};

export default Prep;