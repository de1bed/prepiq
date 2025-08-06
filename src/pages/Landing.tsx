import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  ChefHat, 
  Users, 
  Clock, 
  BarChart3, 
  CheckCircle,
  Star,
  Building,
  UtensilsCrossed,
  Hotel,
  Truck
} from "lucide-react";
import heroImage from "@/assets/kitchen-hero.jpg";

const Landing = () => {
  const features = [
    {
      icon: Users,
      title: "Real-time Team Connection",
      description: "Connect Prep and Cook teams instantly with live order management and inventory updates."
    },
    {
      icon: Clock,
      title: "Smart Preparation Tracking",
      description: "Automate prep scheduling and inventory deduction based on real recipe requirements."
    },
    {
      icon: BarChart3,
      title: "Operational Analytics",
      description: "Get insights on sales, waste, and team performance to optimize your kitchen operations."
    }
  ];

  const useCases = [
    {
      icon: UtensilsCrossed,
      title: "Restaurants",
      description: "Fine dining to casual restaurants"
    },
    {
      icon: Building,
      title: "Dark Kitchens",
      description: "Delivery-only kitchen operations"
    },
    {
      icon: Hotel,
      title: "Hotels",
      description: "Multi-outlet hotel food operations"
    },
    {
      icon: Truck,
      title: "Catering",
      description: "Large-scale catering companies"
    }
  ];

  const testimonials = [
    {
      name: "Maria Rodriguez",
      role: "Restaurant Manager at Bistro Central",
      quote: "PrepIQ transformed our kitchen efficiency. We reduced food waste by 30% in the first month."
    },
    {
      name: "James Wilson",
      role: "Executive Chef at The Modern Kitchen",
      quote: "Finally, a system that understands how kitchens actually work. Our prep team loves it."
    },
    {
      name: "Sarah Kim",
      role: "Operations Director at CloudKitchen Pro",
      quote: "Managing 5 virtual brands became effortless with PrepIQ's real-time coordination."
    }
  ];

  const pricingPlans = [
    {
      name: "Freemium",
      price: "Free",
      description: "Perfect for small kitchens getting started",
      features: [
        "Up to 3 team members",
        "Basic order management",
        "Simple inventory tracking",
        "Email support"
      ]
    },
    {
      name: "Pro",
      price: "$49/month",
      description: "For growing restaurants and kitchens",
      features: [
        "Unlimited team members",
        "Advanced analytics",
        "Recipe management",
        "Priority support",
        "Mobile apps"
      ],
      popular: true
    },
    {
      name: "Enterprise",
      price: "Custom",
      description: "For large operations and chains",
      features: [
        "Multi-location support",
        "Custom integrations",
        "Dedicated account manager",
        "24/7 phone support",
        "Custom training"
      ]
    }
  ];

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${heroImage})` }}
        >
          <div className="absolute inset-0 bg-black/50" />
        </div>
        
        <div className="relative z-10 container mx-auto px-4 text-center text-white">
          <h1 className="text-5xl md:text-7xl font-bold mb-6 animate-fade-in">
            The Operational Brain of Your Kitchen
          </h1>
          <p className="text-xl md:text-2xl mb-8 max-w-3xl mx-auto text-white/90 animate-fade-in">
            PrepIQ digitizes and optimizes professional kitchen operations, connecting your Prep and Cook teams in real-time with smart automation.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in">
            <Link to="/auth">
              <Button size="xl" variant="hero">
                Start Free Trial
              </Button>
            </Link>
            <Link to="/auth">
              <Button size="xl" variant="outline" className="border-white text-white hover:bg-white hover:text-black">
                Watch Demo
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* What is PrepIQ Section */}
      <section id="features" className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">What is PrepIQ?</h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              PrepIQ is not a POS or heavy ERP. It's the smart operational brain that connects your kitchen teams, automates preparation workflows, and provides real-time visibility into your entire operation.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-16">
            {features.map((feature, index) => (
              <Card key={index} className="hover:shadow-lg transition-all duration-300 hover:scale-105">
                <CardContent className="p-8 text-center">
                  <feature.icon className="h-12 w-12 text-primary mx-auto mb-4" />
                  <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
                  <p className="text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Integration Visualization */}
          <div className="bg-gradient-primary rounded-2xl p-8 md:p-12 text-white text-center">
            <h3 className="text-3xl font-bold mb-6">Prep + Cook = Perfect Sync</h3>
            <p className="text-lg text-white/90 max-w-2xl mx-auto">
              When your prep team updates inventory, your cook station automatically knows what's available. When orders come in, prep requirements are instantly calculated. It's kitchen intelligence that actually works.
            </p>
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section id="use-cases" className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">Perfect for Every Kitchen</h2>
            <p className="text-xl text-muted-foreground">
              From intimate bistros to large-scale operations
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {useCases.map((useCase, index) => (
              <Card key={index} className="hover:shadow-lg transition-all duration-300 hover:scale-105">
                <CardContent className="p-6 text-center">
                  <useCase.icon className="h-10 w-10 text-primary mx-auto mb-4" />
                  <h3 className="font-semibold mb-2">{useCase.title}</h3>
                  <p className="text-sm text-muted-foreground">{useCase.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section id="testimonials" className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">Loved by Kitchen Teams</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, index) => (
              <Card key={index} className="hover:shadow-lg transition-all duration-300">
                <CardContent className="p-6">
                  <div className="flex mb-4">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-primary text-primary" />
                    ))}
                  </div>
                  <p className="text-muted-foreground mb-4">"{testimonial.quote}"</p>
                  <div>
                    <p className="font-semibold">{testimonial.name}</p>
                    <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">Simple, Transparent Pricing</h2>
            <p className="text-xl text-muted-foreground">
              Choose the plan that fits your kitchen size
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {pricingPlans.map((plan, index) => (
              <Card key={index} className={`relative hover:shadow-lg transition-all duration-300 hover:scale-105 ${plan.popular ? 'ring-2 ring-primary' : ''}`}>
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <span className="bg-primary text-primary-foreground px-4 py-1 rounded-full text-sm font-medium">
                      Most Popular
                    </span>
                  </div>
                )}
                <CardContent className="p-8">
                  <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                  <p className="text-3xl font-bold text-primary mb-2">{plan.price}</p>
                  <p className="text-muted-foreground mb-6">{plan.description}</p>
                  
                  <ul className="space-y-3 mb-8">
                    {plan.features.map((feature, featureIndex) => (
                      <li key={featureIndex} className="flex items-center">
                        <CheckCircle className="h-4 w-4 text-success mr-3" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  
                  <Button 
                    className="w-full" 
                    variant={plan.popular ? "default" : "outline"}
                  >
                    Get Started
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-kitchen-dark text-white py-12">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center space-x-2 mb-4">
                <ChefHat className="h-6 w-6 text-primary" />
                <span className="text-lg font-bold">PrepIQ</span>
              </div>
              <p className="text-white/70">
                The operational brain of your kitchen.
              </p>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-white/70">
                <li><a href="#features" className="hover:text-white">Features</a></li>
                <li><a href="#pricing" className="hover:text-white">Pricing</a></li>
                <li><a href="#" className="hover:text-white">Demo</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Support</h4>
              <ul className="space-y-2 text-white/70">
                <li><a href="#" className="hover:text-white">Help Center</a></li>
                <li><a href="#" className="hover:text-white">Contact</a></li>
                <li><a href="#" className="hover:text-white">Training</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Contact</h4>
              <ul className="space-y-2 text-white/70">
                <li>support@prepiq.com</li>
                <li>1-800-PREP-IQ</li>
                <li>San Francisco, CA</li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-white/20 mt-8 pt-8 text-center text-white/70">
            <p>&copy; 2024 PrepIQ. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;