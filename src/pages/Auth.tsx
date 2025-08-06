import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { LogIn, UserPlus } from 'lucide-react';

export default function Auth() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  
  // Login form
  const [loginForm, setLoginForm] = useState({
    email: '',
    password: ''
  });

  // Restaurant login form (only for davidrocha0520@gmail.com)
  const [restaurantLogin, setRestaurantLogin] = useState({
    email: 'davidrocha0520@gmail.com',
    password: ''
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginForm.email || !loginForm.password) {
      toast({
        title: "Error",
        description: "Por favor completa todos los campos",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginForm.email,
        password: loginForm.password
      });

      if (error) throw error;

      toast({
        title: "Éxito",
        description: "Sesión iniciada correctamente"
      });

      navigate('/dashboard');
    } catch (error: any) {
      console.error('Login error:', error);
      toast({
        title: "Error",
        description: error.message || "Error al iniciar sesión",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRestaurantLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!restaurantLogin.password) {
      toast({
        title: "Error",
        description: "Por favor ingresa la contraseña",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: restaurantLogin.email,
        password: restaurantLogin.password
      });

      if (error) throw error;

      toast({
        title: "Éxito",
        description: "Acceso al restaurante concedido"
      });

      navigate('/dashboard');
    } catch (error: any) {
      console.error('Restaurant login error:', error);
      toast({
        title: "Error",
        description: error.message || "Contraseña incorrecta",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-red-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-primary">PrepIQ</CardTitle>
          <p className="text-muted-foreground">Acceso al Restaurante</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRestaurantLogin} className="space-y-4">
            <div>
              <Label htmlFor="restaurantEmail">Email del Restaurante</Label>
              <Input
                id="restaurantEmail"
                type="email"
                value={restaurantLogin.email}
                disabled
                className="bg-muted"
              />
            </div>
            <div>
              <Label htmlFor="restaurantPassword">Contraseña del Restaurante</Label>
              <Input
                id="restaurantPassword"
                type="password"
                value={restaurantLogin.password}
                onChange={(e) => setRestaurantLogin({ ...restaurantLogin, password: e.target.value })}
                placeholder="Ingresa la contraseña del restaurante"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              <LogIn className="mr-2 h-4 w-4" />
              {loading ? 'Verificando...' : 'Acceder al Restaurante'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}