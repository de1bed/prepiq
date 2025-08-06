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

// Mock employees data for demonstration
const MOCK_EMPLOYEES = [
  { number: '111', name: 'Maria Garcia', status: 'clocked_out' as const, hours: 0 },
  { number: '222', name: 'Pedro Martinez', status: 'clocked_in' as const, hours: 6.5 },
  { number: '333', name: 'Angel Rodriguez', status: 'on_break' as const, hours: 4.2 }
];

export function ClockSystem() {
  const { profile } = useAuth();
  const { currentSession } = useSession();
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<typeof MOCK_EMPLOYEES[0] | null>(null);
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

  // Handle employee number input
  const handleEmployeeNumberChange = (value: string) => {
    setEmployeeNumber(value);
    const employee = MOCK_EMPLOYEES.find(emp => emp.number === value);
    setSelectedEmployee(employee || null);
  };

  const handleClockAction = async (action: 'clocked_in' | 'on_break' | 'clocked_out') => {
    if (!selectedEmployee) {
      toast({
        title: "Error",
        description: "Please enter your employee number",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const actionText = {
        'clocked_in': 'clocked in',
        'on_break': 'break',
        'clocked_out': 'clocked out'
      };

      toast({
        title: "Success",
        description: `${selectedEmployee.name} ${actionText[action]} successfully`
      });

      // Update mock employee status
      const updatedEmployee = MOCK_EMPLOYEES.find(emp => emp.number === selectedEmployee.number);
      if (updatedEmployee) {
        updatedEmployee.status = action;
      }

      setEmployeeNumber('');
      setSelectedEmployee(null);
    } catch (error) {
      console.error('Error recording clock action:', error);
      toast({
        title: "Error",
        description: "Error recording action",
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
      'clocked_in': 'Working',
      'on_break': 'On Break',
      'clocked_out': 'Off Duty'
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
            Time Clock System
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Input
              placeholder="Employee number"
              value={employeeNumber}
              onChange={(e) => handleEmployeeNumberChange(e.target.value)}
              maxLength={3}
            />
            {selectedEmployee && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="font-medium">{selectedEmployee.name}</p>
                <p className="text-sm text-muted-foreground">
                  Current Status: {getStatusBadge(selectedEmployee.status)}
                </p>
                <p className="text-sm text-muted-foreground">
                  Hours Today: {selectedEmployee.hours}h
                </p>
              </div>
            )}
          </div>
          
          {selectedEmployee && selectedEmployee.status === 'clocked_out' && (
            <Button
              onClick={() => handleClockAction('clocked_in')}
              disabled={loading}
              className="w-full"
            >
              <LogIn className="mr-2 h-4 w-4" />
              Clock In
            </Button>
          )}
          
          {selectedEmployee && selectedEmployee.status === 'clocked_in' && (
            <div className="flex gap-2">
              <Button
                onClick={() => handleClockAction('on_break')}
                disabled={loading}
                variant="secondary"
                className="flex-1"
              >
                <Coffee className="mr-2 h-4 w-4" />
                Break
              </Button>
              <Button
                onClick={() => handleClockAction('clocked_out')}
                disabled={loading}
                variant="outline"
                className="flex-1"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Clock Out
              </Button>
            </div>
          )}
          
          {selectedEmployee && selectedEmployee.status === 'on_break' && (
            <div className="flex gap-2">
              <Button
                onClick={() => handleClockAction('clocked_in')}
                disabled={loading}
                className="flex-1"
              >
                <LogIn className="mr-2 h-4 w-4" />
                Return to Work
              </Button>
              <Button
                onClick={() => handleClockAction('clocked_out')}
                disabled={loading}
                variant="outline"
                className="flex-1"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Clock Out
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Staff Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {MOCK_EMPLOYEES.map((employee) => (
                <div key={employee.number} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium">{employee.name}</p>
                    <p className="text-sm text-muted-foreground">#{employee.number}</p>
                    <p className="text-sm text-muted-foreground">{employee.hours}h today</p>
                  </div>
                  <div className="text-right">
                    {getStatusBadge(employee.status)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-muted-foreground text-center py-8">
              <p>Activity will appear here once employees start using the system</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}