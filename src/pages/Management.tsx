import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { 
  ArrowLeft,
  Package,
  ChefHat,
  BarChart3,
  Users,
  Clock,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  Eye,
  Settings,
  DollarSign,
  Calendar,
  MapPin,
  Bell,
  Award,
  Timer,
  Utensils,
  Scale,
  Thermometer
} from "lucide-react";

interface InventoryItem {
  id: number;
  name: string;
  quantity: number;
  unit: string;
  lastUpdate: string;
  status: 'normal' | 'low' | 'critical' | 'expired';
  expiryDate?: string;
}

interface PrepAvailabilityItem {
  id: number;
  name: string;
  batches: number;
  estimatedCoverage: string;
  lastPrepTime: string;
  status: 'sufficient' | 'low' | 'needed';
}

interface StaffMember {
  id: number;
  name: string;
  status: 'clocked-in' | 'nearing-overtime' | 'missed-break' | 'no-clock-in';
  location: string;
  shiftStart: string;
  hoursToday: number;
  overtime: boolean;
}

interface PrepTask {
  id: number;
  station: string;
  task: string;
  status: 'pending' | 'completed' | 'didnt-call';
  assignedTo?: string;
  estimatedTime: string;
  priority: 'high' | 'medium' | 'low';
}

const Management = () => {
  const [selectedTab, setSelectedTab] = useState("inventory");

  // Mock data
  const inventoryItems: InventoryItem[] = [
    { id: 1, name: "Tomatoes", quantity: 15, unit: "lbs", lastUpdate: "2 hours ago", status: "normal" },
    { id: 2, name: "Chicken Breast", quantity: 8, unit: "lbs", lastUpdate: "1 hour ago", status: "low" },
    { id: 3, name: "Lettuce", quantity: 25, unit: "heads", lastUpdate: "3 hours ago", status: "normal" },
    { id: 4, name: "Salmon Fillet", quantity: 2, unit: "lbs", lastUpdate: "30 min ago", status: "critical", expiryDate: "Today" },
    { id: 5, name: "Olive Oil", quantity: 4, unit: "bottles", lastUpdate: "1 day ago", status: "normal" },
  ];

  const prepAvailability: PrepAvailabilityItem[] = [
    { id: 1, name: "Pico de Gallo", batches: 2, estimatedCoverage: "40 tacos", lastPrepTime: "2 hours ago", status: "sufficient" },
    { id: 2, name: "Chicken Mix", batches: 1, estimatedCoverage: "15 portions", lastPrepTime: "4 hours ago", status: "low" },
    { id: 3, name: "Caesar Dressing", batches: 3, estimatedCoverage: "60 salads", lastPrepTime: "1 hour ago", status: "sufficient" },
    { id: 4, name: "Vegetable Medley", batches: 0, estimatedCoverage: "0 portions", lastPrepTime: "Never", status: "needed" },
  ];

  const staff: StaffMember[] = [
    { id: 1, name: "Pedro Martinez", status: "clocked-in", location: "Grill Station", shiftStart: "6:00 AM", hoursToday: 6.5, overtime: false },
    { id: 2, name: "Juan Rodriguez", status: "nearing-overtime", location: "Prep Kitchen", shiftStart: "5:00 AM", hoursToday: 7.5, overtime: false },
    { id: 3, name: "Ana Garcia", status: "missed-break", location: "Salad Station", shiftStart: "7:00 AM", hoursToday: 5.5, overtime: false },
    { id: 4, name: "Julio Hernandez", status: "no-clock-in", location: "Fry Station", shiftStart: "8:00 AM", hoursToday: 0, overtime: false },
  ];

  const prepTasks: PrepTask[] = [
    { id: 1, station: "Salads", task: "Pico de Gallo", status: "completed", assignedTo: "Ana", estimatedTime: "30 min", priority: "medium" },
    { id: 2, station: "Salads", task: "Cut Lettuce", status: "pending", assignedTo: "Ana", estimatedTime: "20 min", priority: "high" },
    { id: 3, station: "Sauces", task: "Caesar Dressing", status: "completed", assignedTo: "Pedro", estimatedTime: "45 min", priority: "medium" },
    { id: 4, station: "Mixes", task: "Chicken Mix", status: "didnt-call", assignedTo: "Juan", estimatedTime: "1 hour", priority: "high" },
    { id: 5, station: "Vegetables", task: "Vegetable Medley", status: "pending", assignedTo: "Juan", estimatedTime: "40 min", priority: "high" },
  ];

  const todaysAnalytics = {
    revenue: 4250,
    orders: 186,
    avgOrderValue: 22.85,
    topDishes: [
      { name: "Fish & Chips", sold: 28, revenue: 560 },
      { name: "Chicken Taquitos", sold: 24, revenue: 360 },
      { name: "Grilled Salmon", sold: 19, revenue: 475 },
    ],
    wasteLog: [
      { item: "Lettuce", amount: "2 heads", reason: "Expired", cost: 8 },
      { item: "Tomatoes", amount: "1 lb", reason: "Overripe", cost: 4 },
    ],
    efficiency: 87,
    performanceScore: 92
  };

  const stationStatus = [
    { station: "Grill", tickets: 4, status: "normal", color: "text-primary" },
    { station: "Fry", tickets: 1, status: "normal", color: "text-success" },
    { station: "Salad", tickets: 2, status: "normal", color: "text-primary" },
    { station: "Broiler", tickets: 6, status: "backed-up", color: "text-destructive" },
    { station: "Saute", tickets: 3, status: "normal", color: "text-primary" },
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'normal':
        return <Badge variant="secondary">Normal</Badge>;
      case 'low':
        return <Badge className="bg-warning text-warning-foreground">Low</Badge>;
      case 'critical':
        return <Badge variant="destructive">Critical</Badge>;
      case 'expired':
        return <Badge variant="destructive">Expired</Badge>;
      case 'sufficient':
        return <Badge className="bg-success text-white">Sufficient</Badge>;
      case 'needed':
        return <Badge variant="destructive">Needed</Badge>;
      case 'clocked-in':
        return <Badge className="bg-success text-white">✅ Clocked In</Badge>;
      case 'nearing-overtime':
        return <Badge className="bg-warning text-warning-foreground">⚠️ Near OT</Badge>;
      case 'missed-break':
        return <Badge variant="destructive">❌ Missed Break</Badge>;
      case 'no-clock-in':
        return <Badge variant="destructive">❗️ No Clock-In</Badge>;
      case 'completed':
        return <Badge className="bg-success text-white">✅ Done</Badge>;
      case 'pending':
        return <Badge className="bg-warning text-warning-foreground">⏳ Pending</Badge>;
      case 'didnt-call':
        return <Badge variant="destructive">❌ Didn't Call</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-destructive';
      case 'medium': return 'text-warning';
      case 'low': return 'text-success';
      default: return 'text-muted-foreground';
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
                Alerts (3)
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
                <Utensils className="h-6 w-6 mx-auto mb-2 text-primary" />
                <p className="text-2xl font-bold">{todaysAnalytics.orders}</p>
                <p className="text-xs text-muted-foreground">Orders Today</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <TrendingUp className="h-6 w-6 mx-auto mb-2 text-primary" />
                <p className="text-2xl font-bold">${todaysAnalytics.avgOrderValue}</p>
                <p className="text-xs text-muted-foreground">Avg Order</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <Users className="h-6 w-6 mx-auto mb-2 text-primary" />
                <p className="text-2xl font-bold">{staff.filter(s => s.status === 'clocked-in').length}</p>
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
        </div>

        {/* Station Status Panel */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <ChefHat className="h-5 w-5" />
              <span>Live Station Status</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-5 gap-4">
              {stationStatus.map((station, index) => (
                <div key={index} className="text-center">
                  <div className={`text-2xl font-bold ${station.color}`}>{station.tickets}</div>
                  <div className="text-sm font-medium">{station.station}</div>
                  {station.status === 'backed-up' && (
                    <div className="text-xs text-destructive font-medium">🚨 Backed Up</div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Tabs value={selectedTab} onValueChange={setSelectedTab}>
          <TabsList className="grid w-full grid-cols-7">
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
                      {inventoryItems.map((item) => (
                        <tr key={item.id} className="border-b hover:bg-muted/50">
                          <td className="p-3 font-medium">{item.name}</td>
                          <td className="p-3">{item.quantity} {item.unit}</td>
                          <td className="p-3">{getStatusBadge(item.status)}</td>
                          <td className="p-3 text-muted-foreground">{item.lastUpdate}</td>
                          <td className="p-3">
                            <Button variant="outline" size="sm">
                              <Settings className="h-4 w-4 mr-1" />
                              Adjust
                            </Button>
                          </td>
                        </tr>
                      ))}
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
                  <Scale className="h-5 w-5" />
                  <span>Prep Availability</span>
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
                        <th className="text-left p-3">Last Prep</th>
                        <th className="text-left p-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prepAvailability.map((item) => (
                        <tr key={item.id} className="border-b hover:bg-muted/50">
                          <td className="p-3 font-medium">{item.name}</td>
                          <td className="p-3">{item.batches}×</td>
                          <td className="p-3">{item.estimatedCoverage}</td>
                          <td className="p-3 text-muted-foreground">{item.lastPrepTime}</td>
                          <td className="p-3">{getStatusBadge(item.status)}</td>
                        </tr>
                      ))}
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
                  <div className="space-y-4">
                    {todaysAnalytics.topDishes.map((dish, index) => (
                      <div key={index} className="flex justify-between items-center">
                        <div>
                          <p className="font-medium">{dish.name}</p>
                          <p className="text-sm text-muted-foreground">{dish.sold} sold</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-success">${dish.revenue}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Waste & Rework Log</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {todaysAnalytics.wasteLog.map((waste, index) => (
                      <div key={index} className="flex justify-between items-center">
                        <div>
                          <p className="font-medium text-destructive">{waste.item}</p>
                          <p className="text-sm text-muted-foreground">{waste.amount} - {waste.reason}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-destructive">-${waste.cost}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="pt-4 border-t">
                    <div className="flex justify-between">
                      <span className="font-medium">Total Waste Cost:</span>
                      <span className="font-bold text-destructive">
                        -${todaysAnalytics.wasteLog.reduce((sum, w) => sum + w.cost, 0)}
                      </span>
                    </div>
                  </div>
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
                        <th className="text-left p-3">Location</th>
                        <th className="text-left p-3">Shift Start</th>
                        <th className="text-left p-3">Hours Today</th>
                        <th className="text-left p-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {staff.map((member) => (
                        <tr key={member.id} className="border-b hover:bg-muted/50">
                          <td className="p-3 font-medium">{member.name}</td>
                          <td className="p-3">{member.location}</td>
                          <td className="p-3">{member.shiftStart}</td>
                          <td className="p-3">{member.hoursToday}h</td>
                          <td className="p-3">{getStatusBadge(member.status)}</td>
                        </tr>
                      ))}
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
                <div className="space-y-6">
                  {['Salads', 'Sauces', 'Mixes', 'Vegetables'].map((station) => (
                    <div key={station} className="border rounded-lg p-4">
                      <h3 className="font-semibold text-lg mb-3">{station} Station</h3>
                      <div className="space-y-2">
                        {prepTasks
                          .filter(task => task.station === station)
                          .map((task) => (
                            <div key={task.id} className="flex items-center justify-between p-2 border rounded">
                              <div className="flex items-center space-x-3">
                                <div className={`w-2 h-2 rounded-full ${getPriorityColor(task.priority)}`} />
                                <span className="font-medium">{task.task}</span>
                                <span className="text-sm text-muted-foreground">({task.estimatedTime})</span>
                                {task.assignedTo && (
                                  <Badge variant="outline" className="text-xs">
                                    {task.assignedTo}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center space-x-2">
                                {getStatusBadge(task.status)}
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
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
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span>Expected Orders Today:</span>
                      <span className="font-bold">220-250</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Peak Hours:</span>
                      <span className="font-bold">12:00 PM - 2:00 PM</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Weather Impact:</span>
                      <span className="font-bold text-success">+15% (Sunny)</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Reservations:</span>
                      <span className="font-bold">48 tables</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Prep Recommendations</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-2 bg-warning/10 rounded">
                      <span className="font-medium">Chicken Mix</span>
                      <Badge className="bg-warning text-warning-foreground">Need +1× batch</Badge>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-destructive/10 rounded">
                      <span className="font-medium">Vegetable Medley</span>
                      <Badge variant="destructive">Need +2× batches</Badge>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-success/10 rounded">
                      <span className="font-medium">Pico de Gallo</span>
                      <Badge className="bg-success text-white">Sufficient</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Restaurant Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="font-medium">Restaurant Name</label>
                  <Input defaultValue="The Garden Bistro" className="mt-2" />
                </div>
                <div>
                  <label className="font-medium">Location</label>
                  <Input defaultValue="123 Main St, Downtown" className="mt-2" />
                </div>
                <div>
                  <label className="font-medium">Manager Announcements</label>
                  <textarea 
                    className="w-full mt-2 p-3 border rounded-lg"
                    rows={4}
                    defaultValue="Staff meeting at 3 PM today. New menu items launching next week - please review prep procedures."
                  />
                </div>
                <Button>Save Settings</Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Management;