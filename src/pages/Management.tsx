import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { 
  ArrowLeft,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  Users,
  Package,
  BarChart3,
  Clock
} from "lucide-react";

const Management = () => {
  const [menuItems, setMenuItems] = useState([
    { id: 1, name: "Grilled Salmon", available: true, soldToday: 23 },
    { id: 2, name: "Chicken Caesar Salad", available: true, soldToday: 31 },
    { id: 3, name: "Beef Bourguignon", available: false, soldToday: 8 },
    { id: 4, name: "Vegetarian Pasta", available: true, soldToday: 19 }
  ]);

  const toggleMenuItem = (id: number) => {
    setMenuItems(items => 
      items.map(item => 
        item.id === id ? { ...item, available: !item.available } : item
      )
    );
  };

  const statsData = [
    {
      title: "Today's Revenue",
      value: "$3,247",
      change: "+12%",
      icon: DollarSign,
      color: "text-success"
    },
    {
      title: "Orders Completed",
      value: "127",
      change: "+8%",
      icon: TrendingUp,
      color: "text-primary"
    },
    {
      title: "Active Staff",
      value: "8",
      change: "0%",
      icon: Users,
      color: "text-secondary"
    },
    {
      title: "Waste Alerts",
      value: "2",
      change: "-3%",
      icon: AlertTriangle,
      color: "text-warning"
    }
  ];

  const inventoryAlerts = [
    { item: "Salmon Fillets", level: "Low", severity: "warning" },
    { item: "Tomatoes", level: "Critical", severity: "destructive" },
    { item: "Chicken Breast", level: "Good", severity: "success" }
  ];

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
                <h1 className="text-2xl font-bold">Management Dashboard</h1>
                <p className="text-muted-foreground">Oversee operations and analytics</p>
              </div>
            </div>
            <Badge variant="outline" className="bg-gradient-primary text-white">
              Manager View
            </Badge>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Key Metrics */}
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          {statsData.map((stat, index) => (
            <Card key={index}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.title}</p>
                    <p className="text-2xl font-bold">{stat.value}</p>
                    <p className={`text-sm ${stat.color}`}>{stat.change} vs yesterday</p>
                  </div>
                  <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center">
                    <stat.icon className="h-6 w-6" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Menu Item Management */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Package className="h-5 w-5 mr-2" />
                86 Menu Items
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {menuItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex-1">
                      <h4 className="font-medium">{item.name}</h4>
                      <p className="text-sm text-muted-foreground">
                        Sold today: {item.soldToday}
                      </p>
                    </div>
                    <div className="flex items-center space-x-3">
                      <Badge variant={item.available ? "default" : "destructive"}>
                        {item.available ? "Available" : "86'd"}
                      </Badge>
                      <Switch
                        checked={item.available}
                        onCheckedChange={() => toggleMenuItem(item.id)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Inventory Alerts */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <AlertTriangle className="h-5 w-5 mr-2" />
                Inventory Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {inventoryAlerts.map((alert, index) => (
                  <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <h4 className="font-medium">{alert.item}</h4>
                      <p className="text-sm text-muted-foreground">Stock Level</p>
                    </div>
                    <Badge 
                      variant={alert.severity === "success" ? "default" : 
                              alert.severity === "warning" ? "secondary" : "destructive"}
                    >
                      {alert.level}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Sales Analytics */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <BarChart3 className="h-5 w-5 mr-2" />
                Top Selling Items
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span>Chicken Caesar Salad</span>
                  <Badge>31 sold</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span>Grilled Salmon</span>
                  <Badge>23 sold</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span>Vegetarian Pasta</span>
                  <Badge>19 sold</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span>Beef Bourguignon</span>
                  <Badge variant="secondary">8 sold</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Performance Metrics */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Clock className="h-5 w-5 mr-2" />
                Kitchen Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-sm">Average Order Time</span>
                  <span className="font-semibold">12 min</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Prep Efficiency</span>
                  <span className="font-semibold text-success">94%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Order Accuracy</span>
                  <span className="font-semibold text-success">98%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Food Waste</span>
                  <span className="font-semibold text-warning">3.2%</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Coming Soon Section */}
        <Card className="mt-8 border-dashed border-2">
          <CardContent className="p-8 text-center">
            <h3 className="text-xl font-semibold mb-2">🔮 Coming Soon</h3>
            <p className="text-muted-foreground mb-4">
              AI-powered forecasting, weather-based prep suggestions, and cross-kitchen coordination for chains
            </p>
            <Badge variant="outline">Future Features</Badge>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Management;