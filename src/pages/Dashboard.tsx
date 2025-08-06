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
  ClipboardList, 
  BarChart3,
  LogOut,
  Settings
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
      title: "Meseros",
      description: "Tomar órdenes y gestionar solicitudes de clientes",
      icon: Users,
      path: "/servers",
      color: "bg-gradient-secondary",
      code: "1111"
    },
    {
      id: "prep",
      title: "Preparadores",
      description: "Registrar comida preparada y actualizar inventario",
      icon: ClipboardList,
      path: "/prep",
      color: "bg-success",
      code: "2222"
    },
    {
      id: "cook",
      title: "Cocineros",
      description: "Recibir y gestionar órdenes de cocina en vivo",
      icon: Utensils,
      path: "/cook",
      color: "bg-warning",
      code: "3333"
    },
    {
      id: "management",
      title: "Management",
      description: "Supervisar operaciones, análisis y configuraciones",
      icon: BarChart3,
      path: "/management",
      color: "bg-gradient-primary",
      code: "4444"
    }
  ];

  const handleStationClick = (station: typeof stations[0]) => {
    // Check if user already has access stored
    const hasAccess = localStorage.getItem(`station_access_${station.id}`) === 'true';
    
    if (hasAccess) {
      navigate(station.path);
    } else {
      setAccessDialog({
        isOpen: true,
        stationId: station.id,
        stationTitle: station.title,
        stationPath: station.path
      });
    }
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
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="bg-white border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <ChefHat className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-2xl font-bold">PrepIQ Restaurante</h1>
                <p className="text-sm text-muted-foreground">
                  Sistema de gestión integrado
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <Badge variant="outline" className="px-3 py-1">
                {user?.email}
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
        {/* Station Selection */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold mb-2">Selecciona tu Estación</h2>
          <p className="text-muted-foreground mb-8">
            Ingresa el código de acceso correspondiente para cada estación
          </p>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {stations.map((station) => (
              <div key={station.id}>
                <Card 
                  className="hover:shadow-lg transition-all duration-300 hover:scale-105 cursor-pointer group"
                  onClick={() => handleStationClick(station)}
                >
                  <CardHeader className="text-center pb-4">
                    <div className={`w-16 h-16 ${station.color} rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform`}>
                      <station.icon className="h-8 w-8 text-white" />
                    </div>
                    <CardTitle className="text-xl">{station.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-center pt-0">
                    <p className="text-muted-foreground text-sm mb-2">{station.description}</p>
                    <p className="text-xs text-muted-foreground">Código: {station.code}</p>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
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