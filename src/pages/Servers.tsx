import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { 
  ArrowLeft,
  Plus,
  Minus,
  Send,
  Users,
  Clock,
  AlertCircle
} from "lucide-react";

interface OrderItem {
  id: number;
  name: string;
  price: number;
  quantity: number;
  modifiers: string[];
  specialInstructions: string;
}

const Servers = () => {
  const [currentOrder, setCurrentOrder] = useState<OrderItem[]>([]);
  const [tableNumber, setTableNumber] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");

  const menuItems = [
    { id: 1, name: "Grilled Salmon", price: 28, category: "Mains", available: true },
    { id: 2, name: "Chicken Caesar Salad", price: 18, category: "Salads", available: true },
    { id: 3, name: "Beef Bourguignon", price: 32, category: "Mains", available: false },
    { id: 4, name: "Vegetarian Pasta", price: 22, category: "Mains", available: true },
    { id: 5, name: "Fish & Chips", price: 24, category: "Mains", available: true },
    { id: 6, name: "Garden Salad", price: 14, category: "Salads", available: true }
  ];

  const modifierOptions = {
    "Grilled Salmon": ["No sauce", "Extra vegetables", "Gluten-free", "Medium rare", "Well done"],
    "Chicken Caesar Salad": ["No croutons", "Dressing on side", "Extra chicken", "No parmesan", "Add avocado"],
    "Vegetarian Pasta": ["Extra vegetables", "No cheese", "Spicy", "Gluten-free pasta"],
    "Fish & Chips": ["No tartar sauce", "Extra crispy", "Mushy peas", "Lemon wedge"],
    "Garden Salad": ["No onions", "Dressing on side", "Add protein", "Extra vegetables"]
  };

  const addToOrder = (item: any) => {
    const existing = currentOrder.find(orderItem => orderItem.id === item.id);
    if (existing) {
      setCurrentOrder(order => 
        order.map(orderItem => 
          orderItem.id === item.id 
            ? { ...orderItem, quantity: orderItem.quantity + 1 }
            : orderItem
        )
      );
    } else {
      setCurrentOrder(order => [...order, {
        ...item,
        quantity: 1,
        modifiers: [],
        specialInstructions: ""
      }]);
    }
  };

  const removeFromOrder = (itemId: number) => {
    setCurrentOrder(order => {
      const existing = order.find(item => item.id === itemId);
      if (existing && existing.quantity > 1) {
        return order.map(item => 
          item.id === itemId 
            ? { ...item, quantity: item.quantity - 1 }
            : item
        );
      }
      return order.filter(item => item.id !== itemId);
    });
  };

  const updateModifiers = (itemId: number, modifier: string, checked: boolean) => {
    setCurrentOrder(order => 
      order.map(item => {
        if (item.id === itemId) {
          const modifiers = checked 
            ? [...item.modifiers, modifier]
            : item.modifiers.filter(m => m !== modifier);
          return { ...item, modifiers };
        }
        return item;
      })
    );
  };

  const sendToKitchen = () => {
    if (currentOrder.length === 0) return;
    
    // Mock sending order to kitchen
    alert(`Order sent to kitchen!\nTable: ${tableNumber}\nItems: ${currentOrder.length}\nTotal: $${getTotalPrice()}`);
    
    // Reset order
    setCurrentOrder([]);
    setTableNumber("");
    setSpecialInstructions("");
  };

  const getTotalPrice = () => {
    return currentOrder.reduce((total, item) => total + (item.price * item.quantity), 0).toFixed(2);
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
                <h1 className="text-2xl font-bold">Servers Station</h1>
                <p className="text-muted-foreground">Take orders and manage customer requests</p>
              </div>
            </div>
            <Badge variant="outline" className="bg-gradient-secondary text-white">
              Server View
            </Badge>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Menu Items */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Menu Items</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-4">
                  {menuItems.map((item) => (
                    <div key={item.id} className={`p-4 border rounded-lg ${!item.available ? 'opacity-50' : ''}`}>
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-semibold">{item.name}</h3>
                        <span className="text-lg font-bold">${item.price}</span>
                      </div>
                      <Badge variant="outline" className="mb-3">{item.category}</Badge>
                      {!item.available ? (
                        <div className="flex items-center text-destructive text-sm">
                          <AlertCircle className="h-4 w-4 mr-1" />
                          86'd (Not Available)
                        </div>
                      ) : (
                        <Button 
                          onClick={() => addToOrder(item)}
                          size="sm"
                          className="w-full"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add to Order
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Current Order */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Users className="h-5 w-5 mr-2" />
                  Current Order
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Table Number */}
                  <div>
                    <label className="text-sm font-medium mb-2 block">Table Number</label>
                    <input
                      type="text"
                      value={tableNumber}
                      onChange={(e) => setTableNumber(e.target.value)}
                      placeholder="Table 12"
                      className="w-full p-2 border rounded-md"
                    />
                  </div>

                  {/* Order Items */}
                  {currentOrder.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No items in order</p>
                  ) : (
                    <div className="space-y-4 max-h-64 overflow-y-auto">
                      {currentOrder.map((item) => (
                        <div key={`${item.id}-${Math.random()}`} className="border rounded-lg p-3">
                          <div className="flex justify-between items-start mb-2">
                            <h4 className="font-medium">{item.name}</h4>
                            <div className="flex items-center space-x-2">
                              <Button 
                                size="icon" 
                                variant="outline" 
                                className="h-6 w-6"
                                onClick={() => removeFromOrder(item.id)}
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                              <span className="w-8 text-center">{item.quantity}</span>
                              <Button 
                                size="icon" 
                                variant="outline" 
                                className="h-6 w-6"
                                onClick={() => addToOrder(item)}
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>

                          {/* Modifiers */}
                          {modifierOptions[item.name as keyof typeof modifierOptions] && (
                            <div className="mb-2">
                              <p className="text-xs font-medium mb-1">Modifiers:</p>
                              <div className="grid grid-cols-1 gap-1 text-xs">
                                {modifierOptions[item.name as keyof typeof modifierOptions].map((modifier) => (
                                  <label key={modifier} className="flex items-center space-x-1">
                                    <Checkbox
                                      checked={item.modifiers.includes(modifier)}
                                      onCheckedChange={(checked) => 
                                        updateModifiers(item.id, modifier, checked as boolean)
                                      }
                                    />
                                    <span>{modifier}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}

                          <p className="text-sm font-medium">${(item.price * item.quantity).toFixed(2)}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Special Instructions */}
                  <div>
                    <label className="text-sm font-medium mb-2 block">Special Instructions</label>
                    <Textarea
                      value={specialInstructions}
                      onChange={(e) => setSpecialInstructions(e.target.value)}
                      placeholder="Allergies, special requests, etc."
                      rows={3}
                    />
                  </div>

                  {/* Order Summary */}
                  {currentOrder.length > 0 && (
                    <div className="border-t pt-4">
                      <div className="flex justify-between items-center mb-4">
                        <span className="font-semibold">Total:</span>
                        <span className="text-xl font-bold">${getTotalPrice()}</span>
                      </div>
                      <Button 
                        onClick={sendToKitchen} 
                        className="w-full"
                        disabled={!tableNumber.trim()}
                      >
                        <Send className="h-4 w-4 mr-2" />
                        Send to Kitchen
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <Card className="mt-6">
              <CardContent className="p-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Orders Today:</span>
                    <span className="font-medium">127</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Your Orders:</span>
                    <span className="font-medium">23</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Avg Order Time:</span>
                    <span className="font-medium">12 min</span>
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

export default Servers;