import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { useActiveSession } from "@/hooks/useActiveSession";
import { useAuth } from "@/hooks/useAuth";
import { useSessionMenu } from "@/hooks/useSessionMenu";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Plus, Minus, Send, AlertCircle } from "lucide-react";

interface OrderLineDraft {
  recipe_id: string;
  name: string;
  price: number;
  quantity: number;
  modifiers: string[];
}

const Servers = () => {
  const { session } = useActiveSession();
  const { profile } = useAuth();
  const { data, isLoading } = useSessionMenu();
  const { toast } = useToast();

  const [currentOrder, setCurrentOrder] = useState<OrderLineDraft[]>([]);
  const [tableNumber, setTableNumber] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");

  const menuItems = useMemo(() => {
    const result: { id: string; name: string; price: number; available: boolean }[] = [];
    if (!data) return result;
    for (const [id, r] of data.recipesById.entries()) {
      const entry = data.entries.find(e => e.recipe_id === id);
      if (!entry) continue; // only items added to session menu
      result.push({
        id,
        name: r.name,
        price: (entry.price_override ?? r.price ?? 0) as number,
        available: entry.is_available,
      });
    }
    return result;
  }, [data]);

  const addToOrder = (item: { id: string; name: string; price: number }) => {
    setCurrentOrder(prev => {
      const existing = prev.find(l => l.recipe_id === item.id);
      if (existing) return prev.map(l => l.recipe_id === item.id ? { ...l, quantity: l.quantity + 1 } : l);
      return [...prev, { recipe_id: item.id, name: item.name, price: item.price, quantity: 1, modifiers: [] }];
    });
  };

  const removeFromOrder = (recipeId: string) => {
    setCurrentOrder(prev => {
      const existing = prev.find(l => l.recipe_id === recipeId);
      if (!existing) return prev;
      if (existing.quantity > 1) return prev.map(l => l.recipe_id === recipeId ? { ...l, quantity: l.quantity - 1 } : l);
      return prev.filter(l => l.recipe_id !== recipeId);
    });
  };

  const getTotalPrice = () => currentOrder.reduce((t, l) => t + l.price * l.quantity, 0).toFixed(2);

  const getNextOrderNumber = async (): Promise<number> => {
    if (!profile?.restaurant_id || !session?.id) return 1;
    const { data: rows, error } = await supabase
      .from("orders")
      .select("order_number")
      .eq("restaurant_id", profile.restaurant_id)
      .eq("session_id", session.id)
      .order("order_number", { ascending: false })
      .limit(1);
    if (error) return 1;
    return (rows?.[0]?.order_number ?? 0) + 1;
  };

  const sendToKitchen = async () => {
    if (!profile?.restaurant_id || !session?.id) {
      toast({ title: "Sin sesión", description: "Inicia una sesión activa.", variant: "destructive" });
      return;
    }
    if (currentOrder.length === 0) return;

    // Derive station assignments from recipes in the session menu
    const getRecipeStations = (id: string) =>
      ((data?.recipesById?.get(id)?.stations as string[] | undefined) ?? []);
    const orderStations = Array.from(
      new Set(currentOrder.flatMap((l) => getRecipeStations(l.recipe_id)))
    );

    try {
      const orderNumber = await getNextOrderNumber();
      const { data: order, error: e1 } = await supabase
        .from("orders")
        .insert({
          restaurant_id: profile.restaurant_id,
          session_id: session.id,
          order_number: orderNumber,
          table_number: tableNumber || null,
          server_id: profile.id,
          status: 'pending',
          stations: orderStations as any,
          special_instructions: specialInstructions || null,
        } as any)
        .select()
        .single();
      if (e1) throw e1;

      const items = currentOrder.map(l => ({
        order_id: order.id,
        recipe_id: l.recipe_id,
        quantity: l.quantity,
        modifications: l.modifiers,
        station_assignments: getRecipeStations(l.recipe_id) as any,
      }));
      const { error: e2 } = await supabase.from("order_items").insert(items as any);
      if (e2) throw e2;

      toast({ title: "Orden enviada" });
      setCurrentOrder([]);
      setTableNumber("");
      setSpecialInstructions("");
      window.dispatchEvent(new CustomEvent('orders_updated'));
    } catch (e: any) {
      console.error(e);
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
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
              {session ? `Sesión: ${session.session_date}` : 'Sin sesión activa'}
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
                {isLoading ? (
                  <div className="text-muted-foreground">Cargando menú...</div>
                ) : (
                  <div className="grid md:grid-cols-2 gap-4">
                    {menuItems.map((item) => (
                      <div key={item.id} className={`p-4 border rounded-lg ${!item.available ? 'opacity-50' : ''}`}>
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="font-semibold">{item.name}</h3>
                          <span className="text-lg font-bold">${item.price.toFixed(2)}</span>
                        </div>
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
                    {menuItems.length === 0 && (
                      <div className="text-muted-foreground">No hay elementos en el menú de esta sesión.</div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Current Order */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle>Current Order</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Table Number */}
                  <div>
                    <label className="text-sm font-medium mb-2 block">Table Number</label>
                    <Input
                      type="text"
                      value={tableNumber}
                      onChange={(e) => setTableNumber(e.target.value)}
                      placeholder="Table 12"
                    />
                  </div>

                  {/* Order Items */}
                  {currentOrder.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No items in order</p>
                  ) : (
                    <div className="space-y-4 max-h-64 overflow-y-auto">
                      {currentOrder.map((item) => (
                        <div key={item.recipe_id} className="border rounded-lg p-3">
                          <div className="flex justify-between items-start mb-2">
                            <h4 className="font-medium">{item.name}</h4>
                            <div className="flex items-center space-x-2">
                              <Button size="icon" variant="outline" className="h-6 w-6"
                                onClick={() => removeFromOrder(item.recipe_id)}>
                                <Minus className="h-3 w-3" />
                              </Button>
                              <span className="w-8 text-center">{item.quantity}</span>
                              <Button size="icon" variant="outline" className="h-6 w-6"
                                onClick={() => addToOrder({ id: item.recipe_id, name: item.name, price: item.price })}>
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
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
                      <Button onClick={sendToKitchen} className="w-full" disabled={!tableNumber.trim() || !session}>
                        <Send className="h-4 w-4 mr-2" />
                        Send to Kitchen
                      </Button>
                    </div>
                  )}
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
