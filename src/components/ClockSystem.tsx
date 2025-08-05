import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useSession } from '@/hooks/useSession';
import { Clock, LogIn, LogOut, Coffee } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface ClockLog {
  id: string;
  employee_id: string;
  status: 'clocked_in' | 'on_break' | 'clocked_out';
  timestamp: string;
  profiles: {
    first_name: string;
    last_name: string;
    employee_number: string;
  };
}

interface EmployeeStatus {
  employee_id: string;
  first_name: string;
  last_name: string;
  employee_number: string;
  status: 'clocked_in' | 'on_break' | 'clocked_out';
  last_action: string;
  hours_today: number;
}

export function ClockSystem() {
  const { profile } = useAuth();
  const { currentSession } = useSession();
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [recentLogs, setRecentLogs] = useState<ClockLog[]>([]);
  const [employeeStatuses, setEmployeeStatuses] = useState<EmployeeStatus[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (currentSession) {
      fetchRecentLogs();
      fetchEmployeeStatuses();
    }
  }, [currentSession]);

  const fetchRecentLogs = async () => {
    if (!currentSession) return;

    try {
      const { data, error } = await supabase
        .from('clock_logs')
        .select(`
          *,
          profiles:employee_id(first_name, last_name, employee_number)
        `)
        .eq('session_id', currentSession.id)
        .order('timestamp', { ascending: false })
        .limit(10);

      if (error) throw error;
      setRecentLogs(data || []);
    } catch (error) {
      console.error('Error fetching recent logs:', error);
    }
  };

  const fetchEmployeeStatuses = async () => {
    if (!profile?.restaurant_id || !currentSession) return;

    try {
      // Get all employees in restaurant
      const { data: employees, error: empError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, employee_number')
        .eq('restaurant_id', profile.restaurant_id)
        .eq('is_active', true);

      if (empError) throw empError;

      // Get latest status for each employee today
      const statuses: EmployeeStatus[] = [];
      
      for (const employee of employees || []) {
        const { data: latestLog, error: logError } = await supabase
          .from('clock_logs')
          .select('status, timestamp')
          .eq('employee_id', employee.id)
          .eq('session_id', currentSession.id)
          .order('timestamp', { ascending: false })
          .limit(1);

        if (logError) continue;

        // Calculate hours today
        const { data: todaysLogs, error: hoursError } = await supabase
          .from('clock_logs')
          .select('status, timestamp')
          .eq('employee_id', employee.id)
          .eq('session_id', currentSession.id)
          .order('timestamp', { ascending: true });

        let hoursToday = 0;
        if (!hoursError && todaysLogs) {
          // Calculate work hours based on clock in/out pairs
          let clockedInTime: Date | null = null;
          for (const log of todaysLogs) {
            if (log.status === 'clocked_in') {
              clockedInTime = new Date(log.timestamp);
            } else if (log.status === 'clocked_out' && clockedInTime) {
              hoursToday += (new Date(log.timestamp).getTime() - clockedInTime.getTime()) / (1000 * 60 * 60);
              clockedInTime = null;
            }
          }
          // If still clocked in, add time until now
          if (clockedInTime && latestLog?.[0]?.status === 'clocked_in') {
            hoursToday += (new Date().getTime() - clockedInTime.getTime()) / (1000 * 60 * 60);
          }
        }

        statuses.push({
          employee_id: employee.id,
          first_name: employee.first_name,
          last_name: employee.last_name,
          employee_number: employee.employee_number,
          status: latestLog?.[0]?.status || 'clocked_out',
          last_action: latestLog?.[0]?.timestamp || '',
          hours_today: Math.round(hoursToday * 100) / 100
        });
      }

      setEmployeeStatuses(statuses);
    } catch (error) {
      console.error('Error fetching employee statuses:', error);
    }
  };

  const handleClockAction = async (action: 'clocked_in' | 'on_break' | 'clocked_out') => {
    if (!employeeNumber || !profile?.restaurant_id || !currentSession) {
      toast({
        title: "Error",
        description: "Por favor ingresa tu número de empleado",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      // Find employee by number
      const { data: employee, error: findError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .eq('employee_number', employeeNumber)
        .eq('restaurant_id', profile.restaurant_id)
        .single();

      if (findError || !employee) {
        toast({
          title: "Error",
          description: "Número de empleado no encontrado",
          variant: "destructive"
        });
        return;
      }

      // Create clock log
      const { error: logError } = await supabase
        .from('clock_logs')
        .insert({
          restaurant_id: profile.restaurant_id,
          employee_id: employee.id,
          session_id: currentSession.id,
          status: action
        });

      if (logError) throw logError;

      const actionText = {
        'clocked_in': 'entrada',
        'on_break': 'descanso',
        'clocked_out': 'salida'
      };

      toast({
        title: "Éxito",
        description: `${employee.first_name} ${employee.last_name} registró ${actionText[action]}`
      });

      setEmployeeNumber('');
      fetchRecentLogs();
      fetchEmployeeStatuses();
    } catch (error) {
      console.error('Error recording clock action:', error);
      toast({
        title: "Error",
        description: "Error al registrar la acción",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      'clocked_in': 'default',
      'on_break': 'secondary',
      'clocked_out': 'outline'
    } as const;

    const labels = {
      'clocked_in': 'Trabajando',
      'on_break': 'En descanso',
      'clocked_out': 'Fuera'
    };

    return (
      <Badge variant={variants[status as keyof typeof variants]}>
        {labels[status as keyof typeof labels]}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Sistema de Checador
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Número de empleado"
              value={employeeNumber}
              onChange={(e) => setEmployeeNumber(e.target.value)}
              maxLength={6}
            />
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => handleClockAction('clocked_in')}
              disabled={loading}
              className="flex-1"
            >
              <LogIn className="mr-2 h-4 w-4" />
              Entrada
            </Button>
            <Button
              onClick={() => handleClockAction('on_break')}
              disabled={loading}
              variant="secondary"
              className="flex-1"
            >
              <Coffee className="mr-2 h-4 w-4" />
              Descanso
            </Button>
            <Button
              onClick={() => handleClockAction('clocked_out')}
              disabled={loading}
              variant="outline"
              className="flex-1"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Salida
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Estado del Personal</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {employeeStatuses.map((employee) => (
                <div key={employee.employee_id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium">{employee.first_name} {employee.last_name}</p>
                    <p className="text-sm text-muted-foreground">#{employee.employee_number}</p>
                    <p className="text-sm text-muted-foreground">{employee.hours_today}h hoy</p>
                  </div>
                  <div className="text-right">
                    {getStatusBadge(employee.status)}
                    {employee.last_action && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(employee.last_action).toLocaleTimeString()}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Actividad Reciente</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentLogs.map((log) => (
                <div key={log.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium">
                      {log.profiles.first_name} {log.profiles.last_name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      #{log.profiles.employee_number}
                    </p>
                  </div>
                  <div className="text-right">
                    {getStatusBadge(log.status)}
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}