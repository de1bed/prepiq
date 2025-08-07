
import { useState } from "react";
import { Link } from "react-router-dom";
import { AIAssistant } from "@/components/AIAssistant";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ArrowLeft,
  Package,
  ChefHat,
  Users,
  CheckCircle,
  TrendingUp,
  Eye,
  Settings,
  DollarSign,
  Bell,
  Award,
  Thermometer
} from "lucide-react";
import { useRealtime } from "@/hooks/useRealtime";
import { useActiveSession } from "@/hooks/useActiveSession";
import { useInventoryData } from "@/hooks/useInventoryData";
import { usePrepAvailabilityData } from "@/hooks/usePrepAvailabilityData";
import { useRecipesMap } from "@/hooks/useRecipesMap";
import { useEmployeeStatuses } from "@/hooks/useEmployeeStatuses";
import { InventoryAdjustButton } from "@/components/management/InventoryAdjustButton";
import { SessionControl } from "@/components/management/SessionControl";

const Management = () => {
  const [selectedTab, setSelectedTab] = useState("inventory");

  // Subscribe to realtime channel
  useRealtime();

  // Core live data
  const { session } = useActiveSession();
  const inventoryQuery = useInventoryData();
  const { recipesMap } = useRecipesMap();
  const prepQuery = usePrepAvailabilityData(session?.id);
  const staffQuery = useEmployeeStatuses(session?.id);

  // Derived small stats (simple placeholders from live data)
  const todaysAnalytics = {
    revenue: 0, // could be calculated from orders when wired
    orders: 0,  // same as above
    avgOrderValue: 0,
    topDishes: [] as { name: string; sold: number; revenue: number }[],
    wasteLog: [] as { item: string; amount: string; reason: string; cost: number }[],
    efficiency: 87,
    performanceScore: 92
  };

  const getInventoryStatus = (qty: number, min: number | null) => {
    if (qty <= 0) return "critical";
    if (min !== null && qty <= min) return "low";
    return "normal";
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'normal':
        return <Badge variant="secondary">Normal</Badge>;
      case 'low':
        return <Badge className="bg-warning text-warning-foreground">Low</Badge>;
      case 'critical':
        return <Badge variant="destructive">Critical</Badge>;
      case 'sufficient':
        return <Badge className="bg-success text-white">Sufficient</Badge>;
      case 'needed':
        return <Badge variant="destructive">Needed</Badge>;
      case 'clocked_in':
        return <Badge className="bg-success text-white">✅ Clocked In</Badge>;
      case 'on_break':
        return <Badge className="bg-warning text-warning-foreground">☕ On Break</Badge>;
      case 'clocked_out':
        return <Badge variant="destructive">❗️ Off Duty</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
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
                <h1 className="text-2xl font-bold">Management Dashboard</h1>
                <p className="text-muted-foreground">Real-time kitchen operations overview</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <Button variant="outline" size="sm">
                <Bell className="h-4 w-4 mr-2" />
                Alerts
              </Button>
              <Button variant="outline" size="sm">
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {/* Quick Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <DollarSign className="h-6 w-6 mx-auto mb-2 text-success" />
                <p className="text-2xl font-bold text-success">${todaysAnalytics.revenue}</p>
                <p className="text-xs text-muted-foreground">Today's Revenue</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <TrendingUp className="h-6 w-6 mx-auto mb-2 text-primary" />
                <p className="text-2xl font-bold">{todaysAnalytics.orders}</p>
                <p className="text-xs text-muted-foreground">Orders Today</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <Users className="h-6 w-6 mx-auto mb-2 text-primary" />
                <p className="text-2xl font-bold">{staffQuery.data?.filter(s => s.status === 'clocked_in').length ?? 0}</p>
                <p className="text-xs text-muted-foreground">Staff Active</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <Award className="h-6 w-6 mx-auto mb-2 text-success" />
                <p className="text-2xl font-bold">{todaysAnalytics.efficiency}%</p>
                <p className="text-xs text-muted-foreground">Efficiency</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <Thermometer className="h-6 w-6 mx-auto mb-2 text-primary" />
                <p className="text-2xl font-bold">{todaysAnalytics.performanceScore}</p>
                <p className="text-xs text-muted-foreground">Performance</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <Eye className="h-6 w-6 mx-auto mb-2 text-primary" />
                <p className="text-2xl font-bold">{prepQuery.data?.length ?? 0}</p>
                <p className="text-xs text-muted-foreground">Prep Items</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={selectedTab} onValueChange={setSelectedTab}>
          <TabsList className="grid w-full grid-cols-5 md:grid-cols-7">
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
            <TabsTrigger value="prep">Prep Available</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="staff">Staff Status</TabsTrigger>
            <TabsTrigger value="prep-lists">Prep Lists</TabsTrigger>
            <TabsTrigger value="forecast">Forecast</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          {/* Inventory Tab */}
          <TabsContent value="inventory" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Package className="h-5 w-5" />
                  <span>Raw Inventory</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-3">Ingredient</th>
                        <th className="text-left p-3">Quantity</th>
                        <th className="text-left p-3">Status</th>
                        <th className="text-left p-3">Last Update</th>
                        <th className="text-left p-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inventoryQuery.isLoading ? (
                        <tr><td className="p-3 text-muted-foreground" colSpan={5}>Loading...</td></tr>
                      ) : (inventoryQuery.data ?? []).map((item) => {
                        const status = getInventoryStatus(item.current_quantity, item.min_threshold);
                        return (
                          <tr key={item.id} className="border-b hover:bg-muted/50">
                            <td className="p-3 font-medium">{item.ingredient_name}</td>
                            <td className="p-3">{item.current_quantity} {item.unit}</td>
                            <td className="p-3">{getStatusBadge(status)}</td>
                            <td className="p-3 text-muted-foreground">
                              {item.last_updated_at ? new Date(item.last_updated_at).toLocaleString() : "-"}
                            </td>
                            <td className="p-3">
                              <InventoryAdjustButton
                                id={item.id}
                                name={item.ingredient_name}
                                unit={item.unit}
                                current={item.current_quantity}
                                onUpdated={() => inventoryQuery.refetch()}
                              />
                            </td>
                          </tr>
                        );
                      })}
                      {!inventoryQuery.isLoading && (inventoryQuery.data ?? []).length === 0 && (
                        <tr><td className="p-3 text-muted-foreground" colSpan={5}>No inventory yet</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Prep Availability Tab */}
          <TabsContent value="prep" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <ChefHat className="h-5 w-5" />
                  <span>Prep Availability {session ? `(Session ${session.session_date})` : ""}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-3">Item</th>
                        <th className="text-left p-3">Batches</th>
                        <th className="text-left p-3">Coverage</th>
                        <th className="text-left p-3">Last Update</th>
                        <th className="text-left p-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prepQuery.isLoading ? (
                        <tr><td className="p-3 text-muted-foreground" colSpan={5}>Loading...</td></tr>
                      ) : (prepQuery.data ?? []).map((row) => {
                        const recipe = recipesMap.get(row.recipe_id);
                        const coverage = recipe ? `${Math.round(recipe.batch_size * row.available_batches)} portions` : "-";
                        const status = row.available_batches === 0 ? "needed" : row.available_batches === 1 ? "low" : "sufficient";
                        return (
                          <tr key={row.id} className="border-b hover:bg-muted/50">
                            <td className="p-3 font-medium">{recipe?.name ?? row.recipe_id}</td>
                            <td className="p-3">{row.available_batches}×</td>
                            <td className="p-3">{coverage}</td>
                            <td className="p-3 text-muted-foreground">
                              {row.last_updated_at ? new Date(row.last_updated_at).toLocaleString() : "-"}
                            </td>
                            <td className="p-3">{getStatusBadge(status)}</td>
                          </tr>
                        );
                      })}
                      {!prepQuery.isLoading && (prepQuery.data ?? []).length === 0 && (
                        <tr><td className="p-3 text-muted-foreground" colSpan={5}>
                          {session ? "No prep availability yet for this session" : "Start a session to track prep availability"}
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Top Selling Dishes</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground">Connect orders to see live analytics.</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Waste & Rework Log</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground">Hook up waste logs to view details here.</div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Staff Status Tab */}
          <TabsContent value="staff" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Users className="h-5 w-5" />
                  <span>Staff Clock-in/Clock-out Monitoring</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-3">Employee</th>
                        <th className="text-left p-3">Number</th>
                        <th className="text-left p-3">Hours Today</th>
                        <th className="text-left p-3">Status</th>
                        <th className="text-left p-3">Last Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {staffQuery.isLoading ? (
                        <tr><td className="p-3 text-muted-foreground" colSpan={5}>Loading...</td></tr>
                      ) : (staffQuery.data ?? []).map((m) => (
                        <tr key={m.employee_id} className="border-b hover:bg-muted/50">
                          <td className="p-3 font-medium">{m.first_name} {m.last_name}</td>
                          <td className="p-3">#{m.employee_number}</td>
                          <td className="p-3">{m.hours_today}h</td>
                          <td className="p-3">{getStatusBadge(m.status)}</td>
                          <td className="p-3 text-muted-foreground">
                            {m.last_action ? new Date(m.last_action).toLocaleString() : "-"}
                          </td>
                        </tr>
                      ))}
                      {!staffQuery.isLoading && (staffQuery.data ?? []).length === 0 && (
                        <tr><td className="p-3 text-muted-foreground" colSpan={5}>
                          {session ? "No activity yet" : "Start a session to track staff activity"}
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Prep Lists Tab */}
          <TabsContent value="prep-lists" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <CheckCircle className="h-5 w-5" />
                  <span>Daily Prep Lists</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground">
                  Próximamente: gestión de listas de preparación conectada a recetas y prep logs.
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Forecast Tab */}
          <TabsContent value="forecast" className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <TrendingUp className="h-5 w-5" />
                    <span>Demand Forecast</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground">
                    Conecta ventas y reservas para ver predicciones en tiempo real.
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Prep Recommendations</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground">
                    Recomendaciones automáticas basadas en inventario y disponibilidad de prep.
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-6">
            <SessionControl />
            <Card>
              <CardHeader>
                <CardTitle>Restaurant Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="font-medium">Restaurant Name</label>
                  <Input placeholder="Your restaurant name" className="mt-2" />
                </div>
                <div>
                  <label className="font-medium">Location</label>
                  <Input placeholder="Address" className="mt-2" />
                </div>
                <div>
                  <label className="font-medium">Manager Announcements</label>
                  <textarea 
                    className="w-full mt-2 p-3 border rounded-lg"
                    rows={4}
                    placeholder="Share updates with your team..."
                  />
                </div>
                <Button disabled>Save Settings</Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
      
      <AIAssistant context="management" />
    </div>
  );
};

export default Management;
