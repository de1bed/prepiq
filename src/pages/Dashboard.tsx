import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StationAccess } from "@/components/StationAccess";
import { 
  ChefHat, 
  Users, 
  Utensils, 
  BarChart3,
  LogOut,
  Settings,
  Clock
} from "lucide-react";

const Dashboard = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [accessDialog, setAccessDialog] = useState<{
    isOpen: boolean;
    stationId: string;
    stationTitle: string;
    stationPath: string;
  }>({
    isOpen: false,
    stationId: '',
    stationTitle: '',
    stationPath: ''
  });

  const handleLogout = async () => {
    try {
      await signOut();
      navigate("/");
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const stations = [
    {
      id: "servers",
      title: "Servers",
      description: "Take orders and manage customer requests",
      icon: Users,
      path: "/servers",
      color: "bg-gradient-secondary",
      code: "1111"
    },
    {
      id: "cook",
      title: "Cook",
      description: "Receive and manage live kitchen orders",
      icon: Utensils,
      path: "/cook",
      color: "bg-warning",
      code: "3333"
    },
    {
      id: "management",
      title: "Management",
      description: "Configure menu, stations, and settings",
      icon: BarChart3,
      path: "/management",
      color: "bg-gradient-primary",
      code: "4444"
    },
    {
      id: "clock",
      title: "Clock In/Out",
      description: "Employee time tracking and attendance",
      icon: Clock,
      path: "/clock",
      color: "bg-secondary",
      code: "5555"
    }
  ];

  const handleStationClick = (station: typeof stations[0]) => {
    // Bypass access codes for testing - navigate directly
    navigate(station.path);
    
    // Original code with access check (commented out for testing):
    // const hasAccess = localStorage.getItem(`station_access_${station.id}`) === 'true';
    // if (hasAccess) {
    //   navigate(station.path);
    // } else {
    //   setAccessDialog({
    //     isOpen: true,
    //     stationId: station.id,
    //     stationTitle: station.title,
    //     stationPath: station.path
    //   });
    // }
  };

  const closeAccessDialog = () => {
    setAccessDialog({
      isOpen: false,
      stationId: '',
      stationTitle: '',
      stationPath: ''
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-red-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-border/50 shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-primary rounded-lg shadow-md">
                <ChefHat className="h-6 w-6 text-white drop-shadow-sm" />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-orange-600 bg-clip-text text-transparent">
                  PrepIQ
                </h1>
                <p className="text-xs text-muted-foreground">
                  Restaurant Management System
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <Badge variant="outline" className="px-3 py-1.5 bg-white">
                {user?.email || 'test@example.com'}
              </Badge>
              <Button variant="ghost" size="icon" onClick={() => navigate('/management')}>
                <Settings className="h-5 w-5" />
              </Button>
              <Button variant="outline" onClick={handleLogout} size="sm">
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Welcome Section */}
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold mb-3 bg-gradient-to-r from-primary to-orange-600 bg-clip-text text-transparent">
            Welcome to PrepIQ
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Select your station to get started. Manage orders, track staff, and run your restaurant efficiently.
          </p>
        </div>

        {/* Station Selection */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
          {stations.map((station) => (
            <Card 
              key={station.id}
              className="hover:shadow-xl transition-all duration-300 hover:scale-105 cursor-pointer group border-2 hover:border-primary/50 bg-white/80 backdrop-blur-sm"
              onClick={() => handleStationClick(station)}
            >
              <CardHeader className="text-center pb-4 pt-6">
                <div className={`w-20 h-20 ${station.color} rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform shadow-lg`}>
                  <station.icon className="h-10 w-10 text-white drop-shadow-sm" />
                </div>
                <CardTitle className="text-xl font-bold">{station.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-center pt-0 pb-6">
                <p className="text-muted-foreground text-sm leading-relaxed">{station.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="mt-12 text-center">
          <p className="text-sm text-muted-foreground mb-4">Quick Setup</p>
          <Button 
            variant="outline" 
            onClick={() => navigate('/menu-upload')}
            className="bg-white text-foreground border-2 hover:bg-primary hover:text-white hover:border-primary"
          >
            Upload Your Menu
          </Button>
        </div>

        {/* Station Access Dialog */}
        <StationAccess
          isOpen={accessDialog.isOpen}
          onClose={closeAccessDialog}
          stationId={accessDialog.stationId}
          stationTitle={accessDialog.stationTitle}
          stationPath={accessDialog.stationPath}
        />
      </main>
    </div>
  );
};

export default Dashboard;