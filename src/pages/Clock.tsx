import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ClockSystem } from "@/components/ClockSystem";
import { ArrowLeft } from "lucide-react";

const Clock = () => {
  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="bg-white border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center space-x-4">
            <Link to="/dashboard">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Clock In/Out System</h1>
              <p className="text-muted-foreground">Employee time tracking and attendance</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <ClockSystem />
      </main>
    </div>
  );
};

export default Clock;