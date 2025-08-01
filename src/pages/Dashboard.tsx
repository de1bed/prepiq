import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  ChefHat, 
  Users, 
  Utensils, 
  ClipboardList, 
  BarChart3,
  LogOut,
  Settings
} from "lucide-react";

interface UserData {
  email: string;
  restaurant: string;
  location: string;
}

const Dashboard = () => {
  const [userData, setUserData] = useState<UserData | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const user = localStorage.getItem("prepiq_user");
    if (!user) {
      navigate("/login");
      return;
    }
    setUserData(JSON.parse(user));
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem("prepiq_user");
    navigate("/");
  };

  const roles = [
    {
      id: "management",
      title: "Management",
      description: "Oversee operations, analytics, and settings",
      icon: BarChart3,
      path: "/management",
      color: "bg-gradient-primary"
    },
    {
      id: "servers",
      title: "Servers",
      description: "Take orders and manage customer requests",
      icon: Users,
      path: "/servers",
      color: "bg-gradient-secondary"
    },
    {
      id: "prep",
      title: "Prep Station",
      description: "Register prepared food and update inventory",
      icon: ClipboardList,
      path: "/prep",
      color: "bg-success"
    },
    {
      id: "cook",
      title: "Cook Station",
      description: "Receive and manage live kitchen orders",
      icon: Utensils,
      path: "/cook",
      color: "bg-warning"
    }
  ];

  if (!userData) {
    return <div>Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="bg-white border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <ChefHat className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-2xl font-bold">{userData.restaurant}</h1>
                <p className="text-sm text-muted-foreground">{userData.location}</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <Badge variant="outline" className="px-3 py-1">
                {userData.email}
              </Badge>
              <Button variant="ghost" size="icon">
                <Settings className="h-5 w-5" />
              </Button>
              <Button variant="outline" onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Announcements */}
        <Card className="mb-8 bg-gradient-primary text-white">
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold mb-2">📢 Daily Announcement</h3>
            <p>New seasonal menu items available. Remember to check inventory levels before prep. Great job on yesterday's efficiency metrics!</p>
          </CardContent>
        </Card>

        {/* Role Selection */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold mb-2">Select Your Station</h2>
          <p className="text-muted-foreground mb-8">Choose your role to access the appropriate tools and interface</p>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {roles.map((role) => (
              <Link key={role.id} to={role.path}>
                <Card className="hover:shadow-lg transition-all duration-300 hover:scale-105 cursor-pointer group">
                  <CardHeader className="text-center pb-4">
                    <div className={`w-16 h-16 ${role.color} rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform`}>
                      <role.icon className="h-8 w-8 text-white" />
                    </div>
                    <CardTitle className="text-xl">{role.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-center pt-0">
                    <p className="text-muted-foreground text-sm">{role.description}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid md:grid-cols-3 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Orders Today</p>
                  <p className="text-2xl font-bold">127</p>
                </div>
                <div className="w-12 h-12 bg-success/10 rounded-full flex items-center justify-center">
                  <Utensils className="h-6 w-6 text-success" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Active Staff</p>
                  <p className="text-2xl font-bold">8</p>
                </div>
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                  <Users className="h-6 w-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Prep Items Ready</p>
                  <p className="text-2xl font-bold">23</p>
                </div>
                <div className="w-12 h-12 bg-warning/10 rounded-full flex items-center justify-center">
                  <ClipboardList className="h-6 w-6 text-warning" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;