import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  ArrowLeft,
  Printer,
  Scale,
  Package,
  Clock,
  CheckCircle,
  Plus
} from "lucide-react";

interface PrepItem {
  id: number;
  name: string;
  category: string;
  currentStock: number;
  unit: string;
  recipe: { ingredient: string; amount: number; unit: string }[];
}

const Prep = () => {
  const [selectedItem, setSelectedItem] = useState<PrepItem | null>(null);
  const [prepWeight, setPrepWeight] = useState("");
  const [selectedContainer, setSelectedContainer] = useState("");
  const [recentlyPrepped, setRecentlyPrepped] = useState<any[]>([]);

  const prepItems: PrepItem[] = [
    {
      id: 1,
      name: "Pico de Gallo",
      category: "Sauces & Condiments",
      currentStock: 2.5,
      unit: "lbs",
      recipe: [
        { ingredient: "Tomatoes", amount: 100, unit: "g" },
        { ingredient: "Onions", amount: 50, unit: "g" },
        { ingredient: "Cilantro", amount: 25, unit: "g" },
        { ingredient: "Lime Juice", amount: 30, unit: "ml" }
      ]
    },
    {
      id: 2,
      name: "Chicken Mix",
      category: "Proteins",
      currentStock: 1.2,
      unit: "lbs",
      recipe: [
        { ingredient: "Chicken Breast", amount: 200, unit: "g" },
        { ingredient: "Seasonings", amount: 10, unit: "g" },
        { ingredient: "Olive Oil", amount: 15, unit: "ml" }
      ]
    },
    {
      id: 3,
      name: "Caesar Dressing",
      category: "Sauces & Condiments",
      currentStock: 0.8,
      unit: "lbs",
      recipe: [
        { ingredient: "Mayonnaise", amount: 100, unit: "g" },
        { ingredient: "Parmesan", amount: 30, unit: "g" },
        { ingredient: "Garlic", amount: 5, unit: "g" },
        { ingredient: "Anchovies", amount: 10, unit: "g" }
      ]
    },
    {
      id: 4,
      name: "Vegetable Medley",
      category: "Vegetables",
      currentStock: 3.1,
      unit: "lbs",
      recipe: [
        { ingredient: "Bell Peppers", amount: 80, unit: "g" },
        { ingredient: "Zucchini", amount: 60, unit: "g" },
        { ingredient: "Carrots", amount: 40, unit: "g" },
        { ingredient: "Onions", amount: 30, unit: "g" }
      ]
    }
  ];

  const containers = [
    "Third Pan",
    "Sixth Pan",
    "Full Pan",
    "2L Container",
    "1L Container",
    "500ml Container"
  ];

  const handlePrepComplete = () => {
    if (!selectedItem || !prepWeight || !selectedContainer) return;

    const weight = parseFloat(prepWeight);
    const newPrepEntry = {
      id: Date.now(),
      item: selectedItem.name,
      weight: weight,
      container: selectedContainer,
      timestamp: new Date().toLocaleTimeString(),
      rawUsed: selectedItem.recipe.map(r => ({
        ...r,
        totalUsed: (r.amount * weight) / 100 // Calculate based on weight
      }))
    };

    setRecentlyPrepped([newPrepEntry, ...recentlyPrepped.slice(0, 4)]);
    
    // Reset form
    setSelectedItem(null);
    setPrepWeight("");
    setSelectedContainer("");

    alert(`${selectedItem.name} (${weight}g) prepared and labeled!\nInventory updated automatically.`);
  };

  const printLabel = (item: any) => {
    alert(`Printing label for ${item.item}\nWeight: ${item.weight}g\nContainer: ${item.container}\nTime: ${item.timestamp}`);
  };

  return (
    <div className="min-h-screen bg-muted/30">
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
                <p className="text-muted-foreground">Register prepared food and update inventory</p>
              </div>
            </div>
            <Badge variant="outline" className="bg-success text-white">
              Prep View
            </Badge>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Prep Items List */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Package className="h-5 w-5 mr-2" />
                  Available Prep Items
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-4">
                  {prepItems.map((item) => (
                    <div 
                      key={item.id} 
                      className={`p-4 border rounded-lg cursor-pointer transition-all ${
                        selectedItem?.id === item.id ? 'border-primary bg-primary/5' : 'hover:border-primary/50'
                      }`}
                      onClick={() => setSelectedItem(item)}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-semibold">{item.name}</h3>
                        <Badge variant="outline">{item.category}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">
                        Current Stock: {item.currentStock} {item.unit}
                      </p>
                      <div className="text-xs text-muted-foreground">
                        Recipe ingredients: {item.recipe.length} items
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Recipe Details */}
            {selectedItem && (
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle>Recipe: {selectedItem.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    {selectedItem.recipe.map((ingredient, index) => (
                      <div key={index} className="p-3 bg-muted rounded-lg">
                        <div className="font-medium">{ingredient.ingredient}</div>
                        <div className="text-sm text-muted-foreground">
                          {ingredient.amount}{ingredient.unit} per 100g
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Prep Input Panel */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Scale className="h-5 w-5 mr-2" />
                  Scale Integration
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Selected Item */}
                  <div>
                    <label className="text-sm font-medium mb-2 block">Selected Item</label>
                    <div className="p-3 border rounded-lg bg-muted">
                      {selectedItem ? selectedItem.name : "Select an item above"}
                    </div>
                  </div>

                  {/* Container Selection */}
                  <div>
                    <label className="text-sm font-medium mb-2 block">Container Type</label>
                    <Select value={selectedContainer} onValueChange={setSelectedContainer}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose container" />
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

                  {/* Weight Input */}
                  <div>
                    <label className="text-sm font-medium mb-2 block">Weight (grams)</label>
                    <Input
                      type="number"
                      value={prepWeight}
                      onChange={(e) => setPrepWeight(e.target.value)}
                      placeholder="Enter weight..."
                      min="0"
                      step="0.1"
                    />
                  </div>

                  {/* Complete Prep Button */}
                  <Button 
                    onClick={handlePrepComplete}
                    className="w-full"
                    disabled={!selectedItem || !prepWeight || !selectedContainer}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Complete Prep & Label
                  </Button>

                  {/* Mock Scale Reading */}
                  <div className="p-3 border rounded-lg bg-blue-50">
                    <div className="text-sm font-medium text-blue-800">Mock Scale Reading</div>
                    <div className="text-2xl font-bold text-blue-900">
                      {prepWeight || "0.0"}g
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Recently Prepped */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Clock className="h-5 w-5 mr-2" />
                  Recently Prepped
                </CardTitle>
              </CardHeader>
              <CardContent>
                {recentlyPrepped.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">No recent prep items</p>
                ) : (
                  <div className="space-y-3">
                    {recentlyPrepped.map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex-1">
                          <div className="font-medium">{item.item}</div>
                          <div className="text-sm text-muted-foreground">
                            {item.weight}g • {item.container} • {item.timestamp}
                          </div>
                        </div>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => printLabel(item)}
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <Card className="mt-6">
              <CardContent className="p-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Items Prepped Today:</span>
                    <span className="font-medium">23</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Total Weight:</span>
                    <span className="font-medium">15.2 lbs</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Efficiency:</span>
                    <span className="font-medium text-success">94%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Prep;