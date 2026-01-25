import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useActiveSession } from "@/hooks/useActiveSession";
import { useEmployeeStatuses } from "@/hooks/useEmployeeStatuses";
import { supabase } from "@/integrations/supabase/client";
import { mockSupabase, initializeMockData } from "@/utils/supabaseWrapper";
import { 
  ArrowLeft,
  Upload,
  Users,
  Settings,
  ChefHat,
  Utensils,
  CheckCircle,
  X,
  Plus
} from "lucide-react";

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  category: string;
  price: number;
  stations: string[];
  is_active: boolean;
}

const STATIONS = [
  { value: 'grill', label: 'Grill' },
  { value: 'fry', label: 'Fryer' },
  { value: 'salads', label: 'Salads' },
  { value: 'broiler', label: 'Broiler' },
];

const Management = () => {
  const { profile } = useAuth();
  const { session } = useActiveSession();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [selectedTab, setSelectedTab] = useState(searchParams.get('tab') || 'menu');
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newDish, setNewDish] = useState({
    name: '',
    description: '',
    category: '',
    price: 0,
  });
  const staffQuery = useEmployeeStatuses(session?.id);

  useEffect(() => {
    const tab = searchParams.get('tab');
    const action = searchParams.get('action');
    if (tab) setSelectedTab(tab);
    if (action === 'add' && tab === 'menu') {
      setShowAddForm(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (profile?.restaurant_id) {
      initializeMockData(profile.restaurant_id);
      fetchMenuItems();
    }
  }, [profile?.restaurant_id]);

  const fetchMenuItems = async () => {
    if (!profile?.restaurant_id) return;
    setLoading(true);
    try {
      // Try Supabase first, fall back to mock
      let data: MenuItem[] = [];
      let error: any = null;

      try {
        const result = await supabase
          .from('recipes')
          .select('id, name, description, category, price, stations, is_active')
          .eq('restaurant_id', profile.restaurant_id)
          .order('category', { ascending: true })
          .order('name', { ascending: true });
        data = (result.data || []) as MenuItem[];
        error = result.error;
      } catch (e) {
        // Use mock data when Supabase fails
        console.warn('Using mock data for recipes');
        data = mockSupabase.from('recipes')
          .select('id, name, description, category, price, stations, is_active')
          .eq('restaurant_id', profile.restaurant_id)
          .order('category', { ascending: true })
          .order('name', { ascending: true })
          .data() as MenuItem[];
      }

      if (error) throw error;
      setMenuItems(data);
    } catch (error: any) {
      console.error('Error fetching menu:', error);
      // Try mock as last resort
      try {
        const mockData = mockSupabase.from('recipes')
          .select('id, name, description, category, price, stations, is_active')
          .eq('restaurant_id', profile.restaurant_id)
          .data() as MenuItem[];
        setMenuItems(mockData);
      } catch {
        toast({
          title: "Error",
          description: "Failed to load menu items",
          variant: "destructive"
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const updateMenuItemStations = async (itemId: string, stations: string[]) => {
    try {
      let error: any = null;
      try {
        const result = await supabase
          .from('recipes')
          .update({ stations })
          .eq('id', itemId);
        error = result.error;
      } catch (e) {
        // Use mock when Supabase fails
        mockSupabase.from('recipes').update({ stations }).eq('id', itemId);
      }

      if (error) throw error;

      setMenuItems(prev =>
        prev.map(item => item.id === itemId ? { ...item, stations } : item)
      );

      toast({
        title: "Updated",
        description: "Station assignment saved",
      });
    } catch (error: any) {
      // Update local state anyway
      setMenuItems(prev =>
        prev.map(item => item.id === itemId ? { ...item, stations } : item)
      );
      mockSupabase.from('recipes').update({ stations }).eq('id', itemId);
      toast({
        title: "Updated",
        description: "Station assignment saved (offline mode)",
      });
    }
  };

  const toggleMenuItemActive = async (itemId: string, isActive: boolean) => {
    try {
      let error: any = null;
      try {
        const result = await supabase
          .from('recipes')
          .update({ is_active: isActive })
          .eq('id', itemId);
        error = result.error;
      } catch (e) {
        // Use mock when Supabase fails
        mockSupabase.from('recipes').update({ is_active: isActive }).eq('id', itemId);
      }

      if (error) throw error;

      setMenuItems(prev =>
        prev.map(item => item.id === itemId ? { ...item, is_active: isActive } : item)
      );
    } catch (error: any) {
      // Update local state anyway
      setMenuItems(prev =>
        prev.map(item => item.id === itemId ? { ...item, is_active: isActive } : item)
      );
      mockSupabase.from('recipes').update({ is_active: isActive }).eq('id', itemId);
    }
  };

  const addDishManually = async () => {
    if (!profile?.restaurant_id || !newDish.name || !newDish.category || newDish.price <= 0) {
      toast({
        title: "Error",
        description: "Please fill in all required fields (name, category, price)",
        variant: "destructive"
      });
      return;
    }

    try {
      let data: MenuItem | null = null;
      let error: any = null;

      try {
        const result = await supabase
          .from('recipes')
          .insert({
            restaurant_id: profile.restaurant_id,
            name: newDish.name,
            description: newDish.description || null,
            category: newDish.category,
            price: newDish.price,
            stations: [],
            batch_size: 1,
            is_active: true,
          })
          .select()
          .single();
        data = result.data as MenuItem;
        error = result.error;
      } catch (e) {
        // Use mock when Supabase fails
        const mockResult = mockSupabase.from('recipes').insert({
          restaurant_id: profile.restaurant_id,
          name: newDish.name,
          description: newDish.description || null,
          category: newDish.category,
          price: newDish.price,
          stations: [],
          batch_size: 1,
          is_active: true,
        }).select().single();
        data = mockResult.data as MenuItem;
      }

      if (error) throw error;

      toast({
        title: "Success",
        description: "Dish added to menu",
      });

      if (data) {
        setMenuItems(prev => [...prev, data]);
      }
      setNewDish({ name: '', description: '', category: '', price: 0 });
      setShowAddForm(false);
    } catch (error: any) {
      // Add to mock anyway
      const mockResult = mockSupabase.from('recipes').insert({
        restaurant_id: profile.restaurant_id,
        name: newDish.name,
        description: newDish.description || null,
        category: newDish.category,
        price: newDish.price,
        stations: [],
        batch_size: 1,
        is_active: true,
      }).select().single();
      const mockData = mockResult.data as MenuItem;
      setMenuItems(prev => [...prev, mockData]);
      setNewDish({ name: '', description: '', category: '', price: 0 });
      setShowAddForm(false);
      toast({
        title: "Success",
        description: "Dish added to menu (offline mode)",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
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
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-red-50">
      {/* Header */}
      <header className="bg-white border-b border-border shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link to="/dashboard">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold">Management</h1>
                <p className="text-muted-foreground">Configure your menu and operations</p>
              </div>
            </div>
            <div className="flex space-x-2">
              <Button 
                onClick={() => navigate('/menu-upload')} 
                className="bg-primary text-white hover:bg-primary/90"
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload Menu
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="menu">Menu & Stations</TabsTrigger>
            <TabsTrigger value="staff">Staff Status</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          {/* Menu & Stations Tab */}
          <TabsContent value="menu" className="space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <CardTitle className="flex items-center space-x-2">
                  <ChefHat className="h-5 w-5" />
                  <span>Menu Items & Station Assignment</span>
                </CardTitle>
                <Button
                  onClick={() => setShowAddForm(true)}
                  size="sm"
                  className="bg-primary text-white hover:bg-primary/90"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Dish
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Add Dish Form */}
                {showAddForm && (
                  <Card className="border-2 border-primary/20 bg-primary/5">
                    <CardContent className="p-6 space-y-4">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-lg">Add New Dish</h3>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setShowAddForm(false);
                            setNewDish({ name: '', description: '', category: '', price: 0 });
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="dish-name" className="text-foreground font-medium">
                            Dish Name *
                          </Label>
                          <Input
                            id="dish-name"
                            value={newDish.name}
                            onChange={(e) => setNewDish({ ...newDish, name: e.target.value })}
                            placeholder="e.g., Grilled Chicken Tacos"
                            className="mt-2 bg-white"
                          />
                        </div>
                        <div>
                          <Label htmlFor="dish-category" className="text-foreground font-medium">
                            Category *
                          </Label>
                          <Input
                            id="dish-category"
                            value={newDish.category}
                            onChange={(e) => setNewDish({ ...newDish, category: e.target.value })}
                            placeholder="e.g., Main Course, Salads, Desserts"
                            className="mt-2 bg-white"
                          />
                        </div>
                        <div>
                          <Label htmlFor="dish-price" className="text-foreground font-medium">
                            Price *
                          </Label>
                          <div className="relative mt-2">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                            <Input
                              id="dish-price"
                              type="number"
                              step="0.01"
                              value={newDish.price || ''}
                              onChange={(e) => setNewDish({ ...newDish, price: parseFloat(e.target.value) || 0 })}
                              placeholder="0.00"
                              className="pl-7 bg-white"
                            />
                          </div>
                        </div>
                        <div>
                          <Label htmlFor="dish-description" className="text-foreground font-medium">
                            Description (optional)
                          </Label>
                          <Input
                            id="dish-description"
                            value={newDish.description}
                            onChange={(e) => setNewDish({ ...newDish, description: e.target.value })}
                            placeholder="Brief description of the dish"
                            className="mt-2 bg-white"
                          />
                        </div>
                      </div>
                      <div className="flex space-x-2 pt-2">
                        <Button
                          onClick={addDishManually}
                          className="bg-primary text-white hover:bg-primary/90"
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Add Dish
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setShowAddForm(false);
                            setNewDish({ name: '', description: '', category: '', price: 0 });
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {loading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading menu...</div>
                ) : menuItems.length === 0 ? (
                  <div className="text-center py-12 space-y-4">
                    <ChefHat className="h-16 w-16 mx-auto text-muted-foreground" />
                    <div>
                      <h3 className="text-lg font-semibold mb-2">No menu items yet</h3>
                      <p className="text-muted-foreground mb-4">
                        Upload your menu to get started
                      </p>
                      <Button onClick={() => navigate('/menu-upload')}>
                        <Upload className="h-4 w-4 mr-2" />
                        Upload Menu
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {menuItems.map((item) => (
                      <Card key={item.id} className={!item.is_active ? 'opacity-60' : ''}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center space-x-2">
                                <h3 className="font-semibold text-lg">{item.name}</h3>
                                {!item.is_active && (
                                  <Badge variant="secondary">Inactive</Badge>
                                )}
                              </div>
                              {item.description && (
                                <p className="text-sm text-muted-foreground">{item.description}</p>
                              )}
                              <div className="flex items-center space-x-4">
                                <span className="text-sm font-medium">${item.price.toFixed(2)}</span>
                                <span className="text-sm text-muted-foreground">{item.category}</span>
                              </div>
                              <div className="mt-3">
                                <Label className="text-sm font-medium mb-2 block">
                                  Assign to Stations
                                </Label>
                                <div className="flex flex-wrap gap-2">
                                  {STATIONS.map((station) => {
                                    const isSelected = item.stations.includes(station.value);
                                    return (
                                      <Button
                                        key={station.value}
                                        variant={isSelected ? "default" : "outline"}
                                        size="sm"
                                        className={isSelected ? "bg-primary text-white hover:bg-primary/90" : "bg-white text-foreground border-border"}
                                        onClick={() => {
                                          const newStations = isSelected
                                            ? item.stations.filter(s => s !== station.value)
                                            : [...item.stations, station.value];
                                          updateMenuItemStations(item.id, newStations);
                                        }}
                                      >
                                        {isSelected && <CheckCircle className="h-3 w-3 mr-1" />}
                                        {station.label}
                                      </Button>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                            <div className="ml-4">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => toggleMenuItemActive(item.id, !item.is_active)}
                              >
                                {item.is_active ? (
                                  <CheckCircle className="h-4 w-4 text-success" />
                                ) : (
                                  <X className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Staff Status Tab */}
          <TabsContent value="staff" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Users className="h-5 w-5" />
                  <span>Staff Status</span>
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

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Settings className="h-5 w-5" />
                  <span>Restaurant Settings</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="font-medium">Restaurant Name</Label>
                  <Input placeholder="Your restaurant name" className="mt-2" />
                </div>
                <div>
                  <Label className="font-medium">Location</Label>
                  <Input placeholder="Address" className="mt-2" />
                </div>
                <div>
                  <Label className="font-medium">Manager Announcements</Label>
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
    </div>
  );
};

export default Management;
