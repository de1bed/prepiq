import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ArrowLeft,
  Clock,
  CheckCircle,
  AlertCircle,
  Timer,
  Phone,
  TrendingDown,
  User,
  ChefHat,
  BookOpen,
  Eye,
  ShoppingCart,
  RotateCcw
} from "lucide-react";

interface Order {
  id: number;
  tableNumber: string;
  items: OrderItem[];
  timestamp: Date;
  status: 'open' | 'cooking' | 'ready';
  specialInstructions?: string;
  isRevealed?: boolean;
}

interface OrderItem {
  name: string;
  quantity: number;
  modifiers: string[];
  ingredients: { name: string; amount: number; unit: string }[];
}

const Cook = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [recalledOrders, setRecalledOrders] = useState<Order[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedIngredients, setSelectedIngredients] = useState<string[]>([]);
  const [showIngredientList, setShowIngredientList] = useState(false);
  const [showManagerList, setShowManagerList] = useState(false);
  const [showRecallList, setShowRecallList] = useState(false);
  const [callType, setCallType] = useState<'low' | 'out' | null>(null);

  const ingredients = [
    "Tomatoes", "Onions", "Lettuce", "Chicken", "Salmon", "Pasta", 
    "Cheese", "Olive Oil", "Garlic", "Herbs", "Potatoes", "Peppers",
    "Fries", "Beef", "Pork", "Mushrooms", "Carrots", "Celery"
  ];

  const managers = [
    { name: "Sarah Chen", status: "Available", location: "Front" },
    { name: "Mike Rodriguez", status: "Busy", location: "Back Office" },
    { name: "Lisa Park", status: "Available", location: "Floor" }
  ];

  // Mock orders data
  useEffect(() => {
    const mockOrders: Order[] = [
      {
        id: 1,
        tableNumber: "Table 12",
        timestamp: new Date(Date.now() - 8 * 60000),
        status: 'open',
        isRevealed: false,
        items: [
          {
            name: "Chicken Taquitos",
            quantity: 1,
            modifiers: ["No Pico de Gallo"],
            ingredients: [
              { name: "Chicken Mix", amount: 150, unit: "g" },
              { name: "Tortillas", amount: 2, unit: "pieces" },
              { name: "Cheese", amount: 30, unit: "g" }
            ]
          }
        ],
        specialInstructions: "Customer has shellfish allergy"
      },
      {
        id: 2,
        tableNumber: "Table 7",
        timestamp: new Date(Date.now() - 3 * 60000),
        status: 'cooking',
        isRevealed: true,
        items: [
          {
            name: "Grilled Salmon",
            quantity: 1,
            modifiers: ["Medium rare", "Extra lemon"],
            ingredients: [
              { name: "Salmon Fillet", amount: 200, unit: "g" },
              { name: "Vegetable Medley", amount: 100, unit: "g" },
              { name: "Lemon", amount: 2, unit: "wedges" }
            ]
          }
        ]
      },
      {
        id: 3,
        tableNumber: "Table 15",
        timestamp: new Date(Date.now() - 12 * 60000),
        status: 'ready',
        isRevealed: true,
        items: [
          {
            name: "Fish & Chips",
            quantity: 2,
            modifiers: ["Extra crispy"],
            ingredients: [
              { name: "Fish Fillet", amount: 360, unit: "g" },
              { name: "Fries", amount: 400, unit: "g" }
            ]
          }
        ]
      }
    ];

    setOrders(mockOrders);

    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const getTimeSinceOrder = (timestamp: Date) => {
    const diff = Math.floor((currentTime.getTime() - timestamp.getTime()) / 1000 / 60);
    return diff;
  };

  const getTimeColor = (minutes: number) => {
    if (minutes < 5) return "text-success";
    if (minutes < 10) return "text-warning";
    return "text-destructive";
  };

  const openTicket = (orderId: number) => {
    setOrders(orders => 
      orders.map(order => 
        order.id === orderId ? { ...order, isRevealed: true, status: 'cooking' } : order
      )
    );
  };

  const sellOrder = (orderId: number) => {
    const order = orders.find(o => o.id === orderId);
    if (order) {
      setRecalledOrders(prev => [order, ...prev]);
      setOrders(orders => orders.filter(o => o.id !== orderId));
    }
  };

  const unsellOrder = (orderId: number) => {
    const order = recalledOrders.find(o => o.id === orderId);
    if (order) {
      setOrders(prev => [...prev, { ...order, status: 'ready' }]);
      setRecalledOrders(prev => prev.filter(o => o.id !== orderId));
    }
  };

  const handleIngredientToggle = (ingredient: string) => {
    setSelectedIngredients(prev => 
      prev.includes(ingredient) 
        ? prev.filter(i => i !== ingredient)
        : [...prev, ingredient]
    );
  };

  const submitCall = () => {
    if (callType && selectedIngredients.length > 0) {
      const message = callType === 'low' 
        ? `Low on: ${selectedIngredients.join(', ')}`
        : `Ran out of: ${selectedIngredients.join(', ')}`;
      
      alert(`Call sent: ${message}`);
      setSelectedIngredients([]);
      setShowIngredientList(false);
      setCallType(null);
    }
  };

  const handleManagerCall = (manager: any) => {
    alert(`Calling ${manager.name} (${manager.location})`);
    setShowManagerList(false);
  };

  const getStatusBadge = (status: Order['status']) => {
    switch (status) {
      case 'open':
        return <Badge variant="destructive">New</Badge>;
      case 'cooking':
        return <Badge variant="secondary">Cooking</Badge>;
      case 'ready':
        return <Badge className="bg-success text-white">Ready</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-kitchen-dark text-white">
      {/* Header */}
      <header className="bg-kitchen-surface border-b border-white/10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link to="/dashboard">
                <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-white">Cook Station - Grill</h1>
                <p className="text-white/70">Cook: Marcus Johnson | Live Orders</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-white/70 text-sm">
                {currentTime.toLocaleTimeString()}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {/* Station Stats */}
        <div className="grid md:grid-cols-4 gap-4 mb-6">
          <Card className="bg-kitchen-surface border-white/10">
            <CardContent className="p-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-warning">4</p>
                <p className="text-sm text-white/70">Fries Orders</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-kitchen-surface border-white/10">
            <CardContent className="p-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-white">3</p>
                <p className="text-sm text-white/70">Current Grill</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-kitchen-surface border-white/10">
            <CardContent className="p-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-success">0</p>
                <p className="text-sm text-white/70">Pizza</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-kitchen-surface border-white/10">
            <CardContent className="p-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-destructive">2</p>
                <p className="text-sm text-white/70">Urgent</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid lg:grid-cols-4 gap-6">
          {/* Left Action Buttons */}
          <div className="lg:col-span-1">
            <Card className="bg-kitchen-surface border-white/10">
              <CardHeader>
                <CardTitle className="text-white text-lg">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button 
                  onClick={() => setShowRecallList(!showRecallList)}
                  variant="outline" 
                  className="w-full h-12 text-white border-white/20 hover:bg-white/10"
                >
                  <RotateCcw className="h-5 w-5 mr-2" />
                  Recall ({recalledOrders.length})
                </Button>
              </CardContent>
            </Card>

            {/* Tabs for Station/Recipes/Call */}
            <Card className="mt-4 bg-kitchen-surface border-white/10">
              <Tabs defaultValue="grill" className="w-full">
                <TabsList className="grid w-full grid-cols-3 bg-kitchen-dark">
                  <TabsTrigger value="grill" className="text-white data-[state=active]:bg-warning data-[state=active]:text-black">
                    <ChefHat className="h-4 w-4 mr-1" />
                    Grill
                  </TabsTrigger>
                  <TabsTrigger value="recipes" className="text-white data-[state=active]:bg-warning data-[state=active]:text-black">
                    <BookOpen className="h-4 w-4 mr-1" />
                    Recipes
                  </TabsTrigger>
                  <TabsTrigger value="call" className="text-white data-[state=active]:bg-warning data-[state=active]:text-black">
                    <Phone className="h-4 w-4 mr-1" />
                    Call
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="grill" className="p-4">
                  <p className="text-white/70 text-sm">Station: Grill Active</p>
                  <p className="text-white text-lg font-semibold">Ready to cook!</p>
                </TabsContent>
                
                <TabsContent value="recipes" className="p-4">
                  <div className="space-y-2">
                    <Button variant="ghost" className="w-full justify-start text-white hover:bg-white/10">
                      Chicken Taquitos Recipe
                    </Button>
                    <Button variant="ghost" className="w-full justify-start text-white hover:bg-white/10">
                      Grilled Salmon Recipe
                    </Button>
                    <Button variant="ghost" className="w-full justify-start text-white hover:bg-white/10">
                      Fish & Chips Recipe
                    </Button>
                  </div>
                </TabsContent>
                
                <TabsContent value="call" className="p-4">
                  <div className="space-y-3">
                    <Button 
                      onClick={() => {
                        setCallType('low');
                        setShowIngredientList(true);
                      }}
                      variant="warning" 
                      className="w-full"
                    >
                      <TrendingDown className="h-4 w-4 mr-2" />
                      Low Call
                    </Button>
                    <Button 
                      onClick={() => {
                        setCallType('out');
                        setShowIngredientList(true);
                      }}
                      variant="destructive" 
                      className="w-full"
                    >
                      <AlertCircle className="h-4 w-4 mr-2" />
                      Ran Out Of
                    </Button>
                    <Button 
                      onClick={() => setShowManagerList(true)}
                      variant="outline" 
                      className="w-full text-white border-white/20 hover:bg-white/10"
                    >
                      <User className="h-4 w-4 mr-2" />
                      Call Manager
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            </Card>
          </div>

          {/* Main Ticket Display */}
          <div className="lg:col-span-3">
            <Card className="bg-white text-black">
              <CardHeader>
                <CardTitle className="text-xl font-bold">Live Kitchen Orders</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {orders.map((order) => (
                    <div key={order.id} className={`border-2 rounded-lg p-4 transition-all ${
                      order.isRevealed ? 'border-green-500 bg-green-50' : 'border-gray-300 bg-gray-50'
                    }`}>
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center space-x-4">
                          <h3 className="text-xl font-bold">{order.tableNumber}</h3>
                          {getStatusBadge(order.status)}
                        </div>
                        <div className="flex items-center space-x-2">
                          <Timer className="h-4 w-4" />
                          <span className={`font-medium ${getTimeColor(getTimeSinceOrder(order.timestamp))}`}>
                            {getTimeSinceOrder(order.timestamp)}:00
                          </span>
                        </div>
                      </div>

                      {order.items.map((item, index) => (
                        <div key={index} className="mb-3">
                          <div className="flex justify-between items-center mb-2">
                            <h4 className="font-semibold text-lg">{item.name}</h4>
                            <div className="flex space-x-2">
                              {item.modifiers.map((modifier, modIndex) => (
                                <Badge key={modIndex} variant="secondary" className="bg-orange-100 text-orange-800">
                                  {modifier}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          
                          {order.isRevealed && (
                            <div className="text-sm text-gray-600">
                              <strong>Ingredients:</strong> {item.ingredients.map(ing => 
                                `${ing.amount}${ing.unit} ${ing.name}`
                              ).join(', ')}
                            </div>
                          )}
                        </div>
                      ))}

                      {order.specialInstructions && (
                        <div className="bg-red-100 border border-red-300 rounded p-2 mb-3">
                          <p className="text-red-800 font-medium text-sm">
                            ⚠️ {order.specialInstructions}
                          </p>
                        </div>
                      )}

                      <div className="flex gap-2">
                        {!order.isRevealed && (
                          <Button 
                            onClick={() => openTicket(order.id)}
                            variant="default"
                            className="bg-blue-600 hover:bg-blue-700"
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            Open
                          </Button>
                        )}
                        
                        {order.isRevealed && (
                          <Button 
                            onClick={() => sellOrder(order.id)}
                            variant="default"
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Sell
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Ingredient Selection Modal */}
      {showIngredientList && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="bg-white text-black w-96 max-h-96 overflow-y-auto">
            <CardHeader>
              <CardTitle>
                {callType === 'low' ? 'Select Low Ingredients' : 'Select Out of Stock'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {ingredients.map((ingredient) => (
                  <Button
                    key={ingredient}
                    onClick={() => handleIngredientToggle(ingredient)}
                    variant={selectedIngredients.includes(ingredient) ? "default" : "outline"}
                    className="h-auto py-2 text-sm"
                  >
                    {ingredient}
                  </Button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button onClick={submitCall} className="flex-1" disabled={selectedIngredients.length === 0}>
                  Send Call
                </Button>
                <Button 
                  onClick={() => {
                    setShowIngredientList(false);
                    setSelectedIngredients([]);
                    setCallType(null);
                  }}
                  variant="outline"
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Manager List Modal */}
      {showManagerList && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="bg-white text-black w-80">
            <CardHeader>
              <CardTitle>Call Manager</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {managers.map((manager, index) => (
                  <Button
                    key={index}
                    onClick={() => handleManagerCall(manager)}
                    variant="outline"
                    className="w-full justify-start"
                    disabled={manager.status === 'Busy'}
                  >
                    <div className="flex justify-between w-full">
                      <span>{manager.name}</span>
                      <div className="text-sm">
                        <span className={manager.status === 'Available' ? 'text-green-600' : 'text-red-600'}>
                          {manager.status}
                        </span>
                        <span className="ml-2 text-gray-500">({manager.location})</span>
                      </div>
                    </div>
                  </Button>
                ))}
              </div>
              <Button 
                onClick={() => setShowManagerList(false)}
                variant="outline"
                className="w-full mt-4"
              >
                Cancel
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Recall List Modal */}
      {showRecallList && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="bg-white text-black w-96 max-h-96 overflow-y-auto">
            <CardHeader>
              <CardTitle>Recalled Orders</CardTitle>
            </CardHeader>
            <CardContent>
              {recalledOrders.length === 0 ? (
                <p className="text-gray-500 text-center py-4">No recalled orders</p>
              ) : (
                <div className="space-y-2">
                  {recalledOrders.map((order) => (
                    <div key={order.id} className="flex justify-between items-center p-2 border rounded">
                      <div>
                        <span className="font-medium">{order.tableNumber}</span>
                        <span className="text-sm text-gray-500 ml-2">
                          {order.items.map(item => item.name).join(', ')}
                        </span>
                      </div>
                      <Button
                        onClick={() => unsellOrder(order.id)}
                        size="sm"
                        variant="outline"
                      >
                        Unsell
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <Button 
                onClick={() => setShowRecallList(false)}
                variant="outline"
                className="w-full mt-4"
              >
                Close
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default Cook;