import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft,
  Clock,
  CheckCircle,
  AlertCircle,
  Utensils,
  Timer
} from "lucide-react";

interface Order {
  id: number;
  tableNumber: string;
  items: OrderItem[];
  timestamp: Date;
  status: 'open' | 'cooking' | 'ready';
  specialInstructions?: string;
}

interface OrderItem {
  name: string;
  quantity: number;
  modifiers: string[];
  ingredients: { name: string; amount: number; unit: string }[];
}

const Cook = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Mock orders data
  useEffect(() => {
    const mockOrders: Order[] = [
      {
        id: 1,
        tableNumber: "Table 12",
        timestamp: new Date(Date.now() - 8 * 60000), // 8 minutes ago
        status: 'open',
        items: [
          {
            name: "Grilled Salmon",
            quantity: 1,
            modifiers: ["No sauce"],
            ingredients: [
              { name: "Salmon Fillet", amount: 200, unit: "g" },
              { name: "Vegetable Medley", amount: 100, unit: "g" },
              { name: "Lemon", amount: 1, unit: "wedge" }
            ]
          },
          {
            name: "Chicken Caesar Salad",
            quantity: 1,
            modifiers: ["Dressing on side", "Extra chicken"],
            ingredients: [
              { name: "Chicken Mix", amount: 150, unit: "g" },
              { name: "Caesar Dressing", amount: 50, unit: "ml" },
              { name: "Lettuce", amount: 80, unit: "g" },
              { name: "Croutons", amount: 30, unit: "g" }
            ]
          }
        ],
        specialInstructions: "Customer has shellfish allergy"
      },
      {
        id: 2,
        tableNumber: "Table 7",
        timestamp: new Date(Date.now() - 3 * 60000), // 3 minutes ago
        status: 'cooking',
        items: [
          {
            name: "Vegetarian Pasta",
            quantity: 2,
            modifiers: ["Extra vegetables", "No cheese"],
            ingredients: [
              { name: "Pasta", amount: 200, unit: "g" },
              { name: "Vegetable Medley", amount: 150, unit: "g" },
              { name: "Olive Oil", amount: 20, unit: "ml" }
            ]
          }
        ]
      },
      {
        id: 3,
        tableNumber: "Table 5",
        timestamp: new Date(Date.now() - 15 * 60000), // 15 minutes ago
        status: 'ready',
        items: [
          {
            name: "Fish & Chips",
            quantity: 1,
            modifiers: ["Extra crispy", "Mushy peas"],
            ingredients: [
              { name: "Fish Fillet", amount: 180, unit: "g" },
              { name: "Chips", amount: 200, unit: "g" },
              { name: "Mushy Peas", amount: 100, unit: "g" }
            ]
          }
        ]
      }
    ];

    setOrders(mockOrders);

    // Update current time every second
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

  const updateOrderStatus = (orderId: number, newStatus: Order['status']) => {
    setOrders(orders => 
      orders.map(order => 
        order.id === orderId ? { ...order, status: newStatus } : order
      )
    );
  };

  const markAsServed = (orderId: number) => {
    setOrders(orders => orders.filter(order => order.id !== orderId));
  };

  const getStatusBadge = (status: Order['status']) => {
    switch (status) {
      case 'open':
        return <Badge variant="destructive">New Order</Badge>;
      case 'cooking':
        return <Badge variant="secondary">Cooking</Badge>;
      case 'ready':
        return <Badge className="bg-success">Ready</Badge>;
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
                <h1 className="text-2xl font-bold text-white">Cook Station</h1>
                <p className="text-white/70">Live kitchen orders and preparation</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <Badge variant="outline" className="bg-warning text-black border-warning">
                Cook View
              </Badge>
              <div className="text-white/70 text-sm">
                {currentTime.toLocaleTimeString()}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Active Orders Count */}
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <Card className="bg-kitchen-surface border-white/10">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/70 text-sm">Open Orders</p>
                  <p className="text-2xl font-bold text-white">
                    {orders.filter(o => o.status === 'open').length}
                  </p>
                </div>
                <AlertCircle className="h-8 w-8 text-destructive" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-kitchen-surface border-white/10">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/70 text-sm">Cooking</p>
                  <p className="text-2xl font-bold text-white">
                    {orders.filter(o => o.status === 'cooking').length}
                  </p>
                </div>
                <Timer className="h-8 w-8 text-warning" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-kitchen-surface border-white/10">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/70 text-sm">Ready to Serve</p>
                  <p className="text-2xl font-bold text-white">
                    {orders.filter(o => o.status === 'ready').length}
                  </p>
                </div>
                <CheckCircle className="h-8 w-8 text-success" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Order Tickets */}
        <div className="grid lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {orders.map((order) => (
            <Card key={order.id} className="bg-kitchen-surface border-white/10">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-white text-lg">{order.tableNumber}</CardTitle>
                    <div className="flex items-center space-x-2 mt-1">
                      <Clock className="h-4 w-4 text-white/50" />
                      <span className={`text-sm font-medium ${getTimeColor(getTimeSinceOrder(order.timestamp))}`}>
                        {getTimeSinceOrder(order.timestamp)} min ago
                      </span>
                    </div>
                  </div>
                  {getStatusBadge(order.status)}
                </div>
              </CardHeader>

              <CardContent>
                {/* Order Items */}
                <div className="space-y-4 mb-4">
                  {order.items.map((item, index) => (
                    <div key={index} className="border border-white/10 rounded-lg p-3">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-semibold text-white">{item.name}</h4>
                        <Badge variant="outline" className="text-white/70 border-white/20">
                          x{item.quantity}
                        </Badge>
                      </div>

                      {/* Modifiers */}
                      {item.modifiers.length > 0 && (
                        <div className="mb-3">
                          <p className="text-xs font-medium text-warning mb-1">MODIFIERS:</p>
                          <div className="flex flex-wrap gap-1">
                            {item.modifiers.map((modifier, modIndex) => (
                              <Badge key={modIndex} variant="secondary" className="text-xs bg-warning/20 text-warning">
                                {modifier}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Required Ingredients */}
                      <div>
                        <p className="text-xs font-medium text-white/70 mb-2">INGREDIENTS NEEDED:</p>
                        <div className="grid grid-cols-2 gap-1 text-xs">
                          {item.ingredients.map((ingredient, ingIndex) => (
                            <div key={ingIndex} className="text-white/80">
                              {ingredient.amount}{ingredient.unit} {ingredient.name}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Special Instructions */}
                {order.specialInstructions && (
                  <div className="bg-destructive/20 border border-destructive/30 rounded-lg p-3 mb-4">
                    <div className="flex items-start space-x-2">
                      <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
                      <div>
                        <p className="text-xs font-medium text-destructive mb-1">SPECIAL INSTRUCTIONS:</p>
                        <p className="text-sm text-white">{order.specialInstructions}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-2">
                  {order.status === 'open' && (
                    <Button 
                      onClick={() => updateOrderStatus(order.id, 'cooking')}
                      variant="warning"
                      className="flex-1"
                    >
                      Start Cooking
                    </Button>
                  )}
                  
                  {order.status === 'cooking' && (
                    <Button 
                      onClick={() => updateOrderStatus(order.id, 'ready')}
                      variant="success"
                      className="flex-1"
                    >
                      Mark Ready
                    </Button>
                  )}
                  
                  {order.status === 'ready' && (
                    <Button 
                      onClick={() => markAsServed(order.id)}
                      variant="default"
                      className="flex-1"
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Mark as Served
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* No Orders Message */}
        {orders.length === 0 && (
          <Card className="bg-kitchen-surface border-white/10">
            <CardContent className="p-12 text-center">
              <Utensils className="h-12 w-12 text-white/50 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">No Active Orders</h3>
              <p className="text-white/70">All caught up! New orders will appear here automatically.</p>
            </CardContent>
          </Card>
        )}

        {/* Kitchen Performance */}
        <Card className="mt-8 bg-kitchen-surface border-white/10">
          <CardHeader>
            <CardTitle className="text-white">Kitchen Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-success">12 min</p>
                <p className="text-sm text-white/70">Avg Order Time</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-white">127</p>
                <p className="text-sm text-white/70">Orders Today</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-success">98%</p>
                <p className="text-sm text-white/70">Accuracy Rate</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-warning">3</p>
                <p className="text-sm text-white/70">Queue Length</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Cook;