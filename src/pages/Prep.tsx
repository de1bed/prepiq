import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { 
  ArrowLeft,
  Printer,
  Scale,
  Search,
  Clock,
  CheckCircle,
  Plus,
  Package,
  TrendingUp,
  Weight
} from "lucide-react";

// Import generated images
import picoDeGalloImg from "@/assets/pico-de-gallo.jpg";
import chickenMixImg from "@/assets/chicken-mix.jpg";
import caesarDressingImg from "@/assets/caesar-dressing.jpg";
import vegetableMedleyImg from "@/assets/vegetable-medley.jpg";

interface PrepItem {
  id: number;
  name: string;
  category: string;
  currentStock: number;
  unit: string;
  image: string;
  recipe: { ingredient: string; amount: number; unit: string }[];
}

interface RecentPrepEntry {
  id: number;
  item: string;
  weight: number;
  container: string;
  timestamp: string;
  labels: number;
  batchSize?: string;
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
      image: picoDeGalloImg,
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
      image: chickenMixImg,
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
      image: caesarDressingImg,
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
      image: vegetableMedleyImg,
      recipe: [
        { ingredient: "Bell Peppers", amount: 80, unit: "g" },
        { ingredient: "Zucchini", amount: 60, unit: "g" },
        { ingredient: "Carrots", amount: 40, unit: "g" },
        { ingredient: "Onions", amount: 30, unit: "g" }
      ]
    }
  ];

  const containers = ["Third Pan", "Half Pan", "Full Pan", "Quart Container", "Sixth Pan"];
  const batchMultipliers = ["¼×", "½×", "1×", "1.5×", "2×"];

  const filteredItems = prepItems.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const suggestedItems = searchQuery.length === 0 
    ? prepItems.slice(0, 3) 
    : filteredItems.slice(0, 3);

  const handlePrepComplete = () => {
    if (!selectedItem || !selectedContainer) return;

    const multiplier = parseFloat(batchMultiplier.replace('×', ''));
    const calculatedWeight = isLargeBatch 
      ? multiplier * 454 // Base weight for 1× batch in grams
      : parseFloat(prepWeight) || 454;

    const rawUsed = selectedItem.recipe.map(ingredient => ({
      ...ingredient,
      totalUsed: ingredient.amount * multiplier
    }));

    const summary = {
      item: selectedItem.name,
      weight: calculatedWeight,
      container: selectedContainer,
      batchSize: isLargeBatch ? batchMultiplier : undefined,
      rawUsed
    };

    setLastPrepSummary(summary);
    setShowLabelModal(true);
  };

  const confirmPrint = () => {
    if (!lastPrepSummary) return;

    const newEntry: RecentPrepEntry = {
      id: recentlyPrepped.length + 1,
      item: lastPrepSummary.item,
      weight: lastPrepSummary.weight,
      container: lastPrepSummary.container,
      timestamp: new Date().toLocaleTimeString(),
      labels: labelCount,
      batchSize: lastPrepSummary.batchSize,
      rawUsed: lastPrepSummary.rawUsed
    };

    setRecentlyPrepped([newEntry, ...recentlyPrepped]);
    setShowSummary(true);
    setShowLabelModal(false);
    
    // Reset form
    setSelectedItem(null);
    setPrepWeight("");
    setSelectedContainer("");
    setIsLargeBatch(false);
    setBatchMultiplier("1");
    setLabelCount(1);
  };

  const todaysStats = {
    itemsPrepped: recentlyPrepped.length,
    totalWeight: recentlyPrepped.reduce((sum, entry) => sum + entry.weight, 0),
    efficiency: Math.min(95, 75 + recentlyPrepped.length * 2) // Mock efficiency calculation
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
                <p className="text-muted-foreground">Search and log prepared items, update stock, and print labels.</p>
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
                    placeholder="Search product..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 h-12 text-lg"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Suggested Items */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Package className="h-5 w-5" />
                  <span>Suggested Prep Items</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-3 gap-4">
                  {suggestedItems.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => setSelectedItem(item)}
                      className={`border rounded-lg p-4 cursor-pointer transition-all hover:border-primary ${
                        selectedItem?.id === item.id ? 'border-primary bg-primary/5' : 'border-border'
                      }`}
                    >
                      <img 
                        src={item.image} 
                        alt={item.name}
                        className="w-full h-32 object-cover rounded-md mb-3"
                      />
                      <h3 className="font-semibold text-lg">{item.name}</h3>
                      <p className="text-sm text-muted-foreground">{item.category}</p>
                      <div className="flex items-center justify-between mt-2">
                        <Badge variant="secondary">{item.currentStock} {item.unit}</Badge>
                        {selectedItem?.id === item.id && (
                          <CheckCircle className="h-5 w-5 text-primary" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Prep Registration Form */}
            {selectedItem && (
              <Card className="border-primary">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Scale className="h-5 w-5" />
                    <span>Register: {selectedItem.name}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Container Selector */}
                  <div>
                    <Label htmlFor="container" className="text-base font-medium">Container Type</Label>
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

                  {/* Large Batch Toggle */}
                  <div className="flex items-center space-x-3">
                    <Switch
                      id="large-batch"
                      checked={isLargeBatch}
                      onCheckedChange={setIsLargeBatch}
                    />
                    <Label htmlFor="large-batch" className="text-base font-medium">Large Batch?</Label>
                  </div>

                  {/* Batch Multiplier or Weight Input */}
                  {isLargeBatch ? (
                    <div>
                      <Label className="text-base font-medium">Batch Size</Label>
                      <div className="grid grid-cols-5 gap-2 mt-2">
                        {batchMultipliers.map((mult) => (
                          <Button
                            key={mult}
                            type="button"
                            variant={batchMultiplier === mult ? "default" : "outline"}
                            onClick={() => setBatchMultiplier(mult)}
                            className="h-12"
                          >
                            {mult}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <Label htmlFor="weight" className="text-base font-medium">Weight (grams) - Optional</Label>
                      <div className="relative mt-2">
                        <Weight className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="weight"
                          type="number"
                          placeholder="Enter weight or use scale"
                          value={prepWeight}
                          onChange={(e) => setPrepWeight(e.target.value)}
                          className="pl-10 h-12"
                        />
                      </div>
                    </div>
                  )}

                  {/* Submit Button */}
                  <Button
                    onClick={handlePrepComplete}
                    disabled={!selectedContainer}
                    className="w-full h-12 text-lg"
                    size="lg"
                  >
                    <Printer className="h-5 w-5 mr-2" />
                    Print Label and Add to Inventory
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Recently Prepped */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Clock className="h-5 w-5" />
                  <span>Recently Prepped</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {recentlyPrepped.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No items prepped yet today</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2">Product</th>
                          <th className="text-left p-2">Container</th>
                          <th className="text-left p-2">Amount</th>
                          <th className="text-left p-2">Time</th>
                          <th className="text-left p-2">Labels</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentlyPrepped.map((entry) => (
                          <tr key={entry.id} className="border-b hover:bg-muted/50">
                            <td className="p-2 font-medium">{entry.item}</td>
                            <td className="p-2">{entry.container}</td>
                            <td className="p-2">
                              {entry.batchSize ? entry.batchSize : `${entry.weight}g`}
                            </td>
                            <td className="p-2 text-muted-foreground">{entry.timestamp}</td>
                            <td className="p-2">
                              <Badge variant="secondary">{entry.labels}</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
                  <p className="text-3xl font-bold text-secondary">{(todaysStats.totalWeight / 1000).toFixed(1)}kg</p>
                  <p className="text-sm text-muted-foreground">Total Weight</p>
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
                  <Label className="text-base font-medium">How many labels do you need?</Label>
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
                    onClick={() => {
                      setShowLabelModal(false);
                      setLabelCount(1);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Success Summary Modal */}
      {showSummary && lastPrepSummary && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-96">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <CheckCircle className="h-5 w-5 text-success" />
                <span>Prep Completed</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <p className="text-center text-lg">
                  ✅ {lastPrepSummary.batchSize || `${lastPrepSummary.weight}g`} of {lastPrepSummary.item} added to Prep Availability. Raw Inventory Adjusted.
                </p>
                
                <div className="bg-muted rounded-lg p-3">
                  <h4 className="font-medium mb-2">Raw Ingredients Used:</h4>
                  <ul className="space-y-1 text-sm">
                    {lastPrepSummary.rawUsed.map((ingredient: any, index: number) => (
                      <li key={index} className="flex justify-between">
                        <span>{ingredient.ingredient}:</span>
                        <span className="text-destructive">-{ingredient.totalUsed}{ingredient.unit}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <Button
                  onClick={() => {
                    setShowSummary(false);
                    setLastPrepSummary(null);
                  }}
                  className="w-full"
                >
                  Continue
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default Prep;