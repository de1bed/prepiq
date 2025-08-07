import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useActiveSession } from "@/hooks/useActiveSession";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Timer } from "lucide-react";

interface KitchenOrderItem {
  recipe_id: string;
  name: string;
  quantity: number;
  modifiers: string[];
}

interface KitchenOrder {
  id: string;
  table_number: string | null;
  ordered_at: string;
  status: string;
  items: KitchenOrderItem[];
}

const Cook = () => {
  const { profile } = useAuth();
  const { session } = useActiveSession();
  const [orders, setOrders] = useState<KitchenOrder[]>([]);

  const load = async () => {
    if (!profile?.restaurant_id || !session?.id) { setOrders([]); return; }
    const { data: orderRows, error: e1 } = await supabase
      .from('orders')
      .select('id, table_number, ordered_at, status')
      .eq('restaurant_id', profile.restaurant_id)
      .eq('session_id', session.id)
      .order('ordered_at', { ascending: true });
    if (e1) return;
    const ids = (orderRows ?? []).map(o => o.id);
    if (ids.length === 0) { setOrders([]); return; }
    const { data: itemRows, error: e2 } = await supabase
      .from('order_items')
      .select('order_id, recipe_id, quantity, modifications')
      .in('order_id', ids);
    if (e2) return;
    const { data: recipes, error: e3 } = await supabase
      .from('recipes')
      .select('id, name')
      .eq('restaurant_id', profile.restaurant_id);
    if (e3) return;
    const recipesById = new Map<string, any>();
    for (const r of recipes ?? []) recipesById.set(r.id, r);

    const grouped: KitchenOrder[] = (orderRows ?? []).map((o) => ({
      id: o.id,
      table_number: o.table_number,
      ordered_at: o.ordered_at,
      status: o.status,
      items: (itemRows ?? [])
        .filter(i => i.order_id === o.id)
        .map(i => ({
          recipe_id: i.recipe_id,
          name: recipesById.get(i.recipe_id)?.name ?? i.recipe_id,
          quantity: i.quantity,
          modifiers: (i.modifications as any[]) || [],
        }))
    }));
    setOrders(grouped);
  };

  useEffect(() => { load(); }, [profile?.restaurant_id, session?.id]);
  useEffect(() => {
    const h = () => load();
    window.addEventListener('orders_updated', h as EventListener);
    return () => window.removeEventListener('orders_updated', h as EventListener);
  }, []);

  const getMinutes = (iso: string) => {
    const ms = Date.now() - new Date(iso).getTime();
    return Math.max(0, Math.floor(ms / 60000));
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending': return <Badge variant="destructive">New</Badge>;
      case 'in_progress': return <Badge variant="secondary">Open</Badge>;
      case 'completed': return <Badge className="bg-success text-white">Ready</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-kitchen-dark text-white overflow-y-auto">
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
                <p className="text-white/70">Live Orders</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Card className="bg-white text-black">
          <CardHeader>
            <CardTitle className="text-xl font-bold">Live Kitchen Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {orders.map((order) => (
                <div key={order.id} className={`border-2 rounded-lg p-4`}>
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center space-x-4">
                      <h3 className="text-xl font-bold text-black">{order.table_number || 'To-Go'}</h3>
                      {getStatusBadge(order.status)}
                    </div>
                    <div className="flex items-center space-x-2">
                      <Timer className="h-4 w-4 text-black" />
                      <span className={`font-medium`}>
                        {getMinutes(order.ordered_at)}:00
                      </span>
                    </div>
                  </div>

                  <div className="animate-fade-in">
                    {order.items.map((item, index) => (
                      <div key={index} className="mb-3">
                        <div className="flex justify-between items-center mb-2">
                          <h4 className="font-semibold text-lg text-black">{item.name} × {item.quantity}</h4>
                          <div className="flex space-x-2">
                            {item.modifiers.map((modifier, modIndex) => (
                              <Badge key={modIndex} variant="secondary" className="bg-orange-100 text-orange-800">
                                {modifier}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {orders.length === 0 && (
                <div className="text-muted-foreground">No hay órdenes todavía.</div>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Cook;
