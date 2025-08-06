import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { Lock } from 'lucide-react';

interface StationAccessProps {
  isOpen: boolean;
  onClose: () => void;
  stationId: string;
  stationTitle: string;
  stationPath: string;
}

const STATION_CODES = {
  servers: '1111',
  prep: '2222',
  cook: '3333',
  management: '4444'
};

export function StationAccess({ isOpen, onClose, stationId, stationTitle, stationPath }: StationAccessProps) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Validate access code
    const requiredCode = STATION_CODES[stationId as keyof typeof STATION_CODES];
    
    if (code === requiredCode) {
      // Store access in localStorage for session persistence
      localStorage.setItem(`station_access_${stationId}`, 'true');
      
      toast({
        title: "Acceso Concedido",
        description: `Bienvenido a ${stationTitle}`
      });
      
      onClose();
      navigate(stationPath);
    } else {
      toast({
        title: "Código Incorrecto",
        description: "El código de acceso no es válido",
        variant: "destructive"
      });
    }

    setLoading(false);
    setCode('');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Acceso a {stationTitle}
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="accessCode">Código de Acceso</Label>
            <Input
              id="accessCode"
              type="password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Ingresa el código de 4 dígitos"
              maxLength={4}
              className="text-center text-lg tracking-widest"
              autoFocus
            />
          </div>
          
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || code.length !== 4} className="flex-1">
              {loading ? 'Verificando...' : 'Acceder'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}