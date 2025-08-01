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
  Search,
  Clock,
  CheckCircle,
  Plus,
  Package
} from "lucide-react";

interface PrepItem {
  id: number;
  name: string;
  category: string;
  currentStock: number;
  unit: string;
  recipe: { ingredient: string; amount: number; unit: string }[];
}

interface RecentPrepEntry {
  id: number;
  item: string;
  weight: number;
  container: string;
  timestamp: string;
  labels: number;
  rawUsed: { ingredient: string; amount: number; unit: string; totalUsed: number }[];
}

const Prep = () => {
  const [selectedItem, setSelectedItem] = useState<PrepItem | null>(null);
  const [prepWeight, setPrepWeight] = useState("");
  const [selectedContainer, setSelectedContainer] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLargeBatch, setIsLargeBatch] = useState(false);
  const [batchMultiplier, setBatchMultiplier] = useState("1");
  const [labelCount, setLabelCount] = useState(1);
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [recentlyPrepped, setRecentlyPrepped] = useState<RecentPrepEntry[]>([]);
  const [showSummary, setShowSummary] = useState(false);
  const [lastPrepSummary, setLastPrepSummary] = useState<any>(null);

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
    "Half Pan", 
    "Sixth Pan",
    "Full Pan",
    "Quart Container",
    "2L Container",
    "1L Container",
    "500ml Container"
  ];

  const batchOptions = [
    { label: "¼ Batch", value: "0.25" },
    { label: "½ Batch", value: "0.5" },
    { label: "1× Batch", value: "1" },
    { label: "1.5× Batch", value: "1.5" },
    { label: "2× Batch", value: "2" }
  ];

  const filteredItems = prepItems.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const suggestedItems = searchQuery ? filteredItems : prepItems.slice(0, 4);

  const calculateIngredientUsage = (item: PrepItem, finalWeight: number) => {
    const baseWeight = item.recipe.reduce((total, ingredient) => total + ingredient.amount, 0);
    const ratio = finalWeight / baseWeight;
    
    return item.recipe.map(ingredient => ({
      ...ingredient,
      totalUsed: ingredient.amount * ratio
    }));
  };

  const handlePrepComplete = () => {
    if (!selectedItem || !prepWeight || !selectedContainer) return;

    const weight = parseFloat(prepWeight);
    const multiplier = isLargeBatch ? parseFloat(batchMultiplier) : 1;
    const finalWeight = weight * multiplier;

    const rawUsed = calculateIngredientUsage(selectedItem, finalWeight);
    
    setLastPrepSummary({
      item: selectedItem.name,
      weight: finalWeight,
      container: selectedContainer,
      rawUsed: rawUsed
    });

    setShowLabelModal(true);
  };

  const handlePrintLabels = () => {
    if (!lastPrepSummary) return;

    const newPrepEntry: RecentPrepEntry = {
      id: Date.now(),
      item: lastPrepSummary.item,
      weight: lastPrepSummary.weight,
      container: lastPrepSummary.container,
      timestamp: new Date().toLocaleTimeString(),
      labels: labelCount,
      rawUsed: lastPrepSummary.rawUsed
    };

    setRecentlyPrepped([newPrepEntry, ...recentlyPrepped.slice(0, 4)]);
    
    // Reset form
    setSelectedItem(null);
    setPrepWeight("");
    setSelectedContainer("");
    setIsLargeBatch(false);
    setBatchMultiplier("1");
    setLabelCount(1);
    setShowLabelModal(false);
    setShowSummary(true);

    // Hide summary after 5 seconds
    setTimeout(() => setShowSummary(false), 5000);
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
                <p className="text-muted-foreground">Search and log prepared items, update stock, and print labels</p>
              </div>
            </div>
            <Badge variant="outline" className="bg-success text-white">
              Prep View
            </Badge>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Success Summary */}
        {showSummary && lastPrepSummary && (
          <Card className="mb-6 border-success bg-success/5">
            <CardContent className="p-4">
              <div className="flex items-start space-x-3">
                <CheckCircle className="h-5 w-5 text-success mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-success">
                    ✅ {lastPrepSummary.weight}g of {lastPrepSummary.item} added to Prep Availability. Raw Inventory Adjusted.
                  </h3>
                  <div className="mt-2 text-sm text-muted-foreground">
                    <strong>Raw ingredients used:</strong>
                    <ul className="grid grid-cols-2 gap-1 mt-1">
                      {lastPrepSummary.rawUsed.map((ingredient: any, index: number) => (
                        <li key={index}>
                          {ingredient.ingredient}: -{ingredient.totalUsed.toFixed(1)}{ingredient.unit}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Search and Prep Items */}
          <div className="lg:col-span-2">
            {/* Search Bar */}
            <Card className="mb-6">
              <CardContent className="p-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search product..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Suggested Prep Items */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Package className="h-5 w-5 mr-2" />
                  {searchQuery ? `Search Results (${filteredItems.length})` : 'Suggested Prep Items'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-4">
                  {suggestedItems.map((item) => (
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
                          {ingredient.amount}{ingredient.unit} per batch
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Prep Registration Form */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Scale className="h-5 w-5 mr-2" />
                  Prep Registration
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

                  {/* Large Batch Toggle */}
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="largeBatch"
                      checked={isLargeBatch}
                      onChange={(e) => setIsLargeBatch(e.target.checked)}
                      className="rounded border-border"
                    />
                    <label htmlFor="largeBatch" className="text-sm font-medium">
                      Large Batch?
                    </label>
                  </div>

                  {/* Batch Multiplier */}
                  {isLargeBatch && (
                    <div>
                      <label className="text-sm font-medium mb-2 block">Batch Size</label>
                      <Select value={batchMultiplier} onValueChange={setBatchMultiplier}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select batch size" />
                        </SelectTrigger>
                        <SelectContent>
                          {batchOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

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
                    Print Label and Add to Inventory
                  </Button>

                  {/* Mock Scale Reading */}
                  <div className="p-3 border rounded-lg bg-blue-50">
                    <div className="text-sm font-medium text-blue-800">Mock Scale Reading</div>
                    <div className="text-2xl font-bold text-blue-900">
                      {prepWeight || "0.0"}g
                    </div>
                    {isLargeBatch && (
                      <div className="text-sm text-blue-700">
                        Total: {((parseFloat(prepWeight) || 0) * parseFloat(batchMultiplier)).toFixed(1)}g
                      </div>
                    )}
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
                      <div key={item.id} className="p-3 border rounded-lg">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1">
                            <div className="font-medium">{item.item}</div>
                            <div className="text-sm text-muted-foreground">
                              {item.weight}g • {item.container} • {item.timestamp}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Labels: {item.labels}
                            </div>
                          </div>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => alert(`Reprinting ${item.labels} label(s) for ${item.item}`)}
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Right-Side Stats */}
            <Card className="mt-6">
              <CardContent className="p-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Items Prepped Today:</span>
                    <span className="font-medium">{recentlyPrepped.length + 20}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Total Weight:</span>
                    <span className="font-medium">
                      {(recentlyPrepped.reduce((sum, item) => sum + item.weight, 0) / 1000 + 15.2).toFixed(1)} kg
                    </span>
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

      {/* Label Count Modal */}
      {showLabelModal && lastPrepSummary && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="bg-white w-96">
            <CardHeader>
              <CardTitle>Print Labels</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-2">
                    {lastPrepSummary.item} - {lastPrepSummary.weight}g in {lastPrepSummary.container}
                  </p>
                  <label className="text-sm font-medium mb-2 block">How many labels do you need?</label>
                  <Select value={labelCount.toString()} onValueChange={(value) => setLabelCount(parseInt(value))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 10 }, (_, i) => i + 1).map((num) => (
                        <SelectItem key={num} value={num.toString()}>
                          {num} label{num > 1 ? 's' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handlePrintLabels} className="flex-1">
                    <Printer className="h-4 w-4 mr-2" />
                    Print Labels
                  </Button>
                  <Button 
                    onClick={() => setShowLabelModal(false)}
                    variant="outline"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default Prep;