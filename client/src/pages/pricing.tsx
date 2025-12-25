import { useState } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Check, X, Crown, Zap, TrendingUp } from "lucide-react";

interface PlanFeature {
  name: string;
  included: boolean;
}

interface PricingPlan {
  id: string;
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  features: PlanFeature[];
  icon: typeof Crown;
  popular?: boolean;
  currentPlan?: boolean;
}

const plans: PricingPlan[] = [
  {
    id: "free",
    name: "Free",
    description: "Get started with basic trading insights",
    monthlyPrice: 0,
    yearlyPrice: 0,
    icon: TrendingUp,
    currentPlan: true,
    features: [
      { name: "3 trade ideas per day", included: true },
      { name: "5 AI chat messages per day", included: true },
      { name: "1 chart analysis per day", included: true },
      { name: "5 watchlist items", included: true },
      { name: "Performance tracking", included: false },
      { name: "Real-time alerts", included: false },
      { name: "Advanced analytics", included: false },
      { name: "Export data", included: false },
      { name: "Priority support", included: false },
    ],
  },
  {
    id: "advanced",
    name: "Advanced",
    description: "For serious traders who want more power",
    monthlyPrice: 39,
    yearlyPrice: 349,
    icon: Zap,
    features: [
      { name: "15 trade ideas per day", included: true },
      { name: "50 AI chat messages per day", included: true },
      { name: "10 chart analyses per day", included: true },
      { name: "25 watchlist items", included: true },
      { name: "Performance tracking", included: true },
      { name: "Real-time alerts", included: true },
      { name: "Advanced analytics", included: false },
      { name: "Export data", included: true },
      { name: "Priority support", included: false },
    ],
  },
  {
    id: "pro",
    name: "Pro",
    description: "Unlimited access for professional traders",
    monthlyPrice: 79,
    yearlyPrice: 699,
    icon: Crown,
    popular: true,
    features: [
      { name: "Unlimited trade ideas", included: true },
      { name: "Unlimited AI chat messages", included: true },
      { name: "Unlimited chart analyses", included: true },
      { name: "Unlimited watchlist items", included: true },
      { name: "Performance tracking", included: true },
      { name: "Real-time alerts", included: true },
      { name: "Advanced analytics", included: true },
      { name: "Export data", included: true },
      { name: "Priority support", included: true },
    ],
  },
];

export default function Pricing() {
  const [isYearly, setIsYearly] = useState(false);

  const formatPrice = (monthly: number, yearly: number) => {
    if (monthly === 0) return "$0";
    return isYearly ? `$${yearly}` : `$${monthly}`;
  };

  const getPeriod = (monthly: number) => {
    if (monthly === 0) return "/mo";
    return isYearly ? "/year" : "/mo";
  };

  const getYearlySavings = (monthly: number, yearly: number) => {
    if (monthly === 0) return null;
    const yearlyCost = monthly * 12;
    const savings = yearlyCost - yearly;
    const percent = Math.round((savings / yearlyCost) * 100);
    return percent;
  };

  return (
    <div className="min-h-screen bg-background py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h1 
            className="text-3xl font-bold tracking-tight mb-4"
            data-testid="text-pricing-header"
          >
            Choose Your Plan
          </h1>
          <p 
            className="text-lg text-muted-foreground max-w-2xl mx-auto"
            data-testid="text-pricing-subtext"
          >
            Unlock the full power of QuantEdge with our 3-tier subscription model. 
            From free basic access to unlimited professional features.
          </p>
        </div>

        <div className="flex items-center justify-center gap-4 mb-10">
          <span 
            className={`text-sm font-medium ${!isYearly ? 'text-foreground' : 'text-muted-foreground'}`}
            data-testid="text-monthly-label"
          >
            Monthly
          </span>
          <Switch
            checked={isYearly}
            onCheckedChange={setIsYearly}
            data-testid="switch-billing-toggle"
          />
          <span 
            className={`text-sm font-medium ${isYearly ? 'text-foreground' : 'text-muted-foreground'}`}
            data-testid="text-yearly-label"
          >
            Yearly
          </span>
          {isYearly && (
            <Badge variant="default" className="bg-green-600 text-white border-green-700" data-testid="badge-yearly-savings">
              Save ~25%
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {plans.map((plan) => {
            const Icon = plan.icon;
            const savings = getYearlySavings(plan.monthlyPrice, plan.yearlyPrice);
            
            return (
              <Card 
                key={plan.id}
                className={`relative flex flex-col ${
                  plan.popular 
                    ? 'border-primary ring-2 ring-primary/20' 
                    : ''
                }`}
                data-testid={`card-plan-${plan.id}`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge 
                      variant="default" 
                      className="bg-primary text-primary-foreground"
                      data-testid="badge-most-popular"
                    >
                      <Crown className="w-3 h-3 mr-1" />
                      Most Popular
                    </Badge>
                  </div>
                )}
                
                <CardHeader className="text-center pb-4">
                  <div className="mx-auto mb-3 p-3 rounded-full bg-muted w-fit">
                    <Icon className="w-6 h-6 text-primary" />
                  </div>
                  <CardTitle className="text-xl" data-testid={`text-plan-name-${plan.id}`}>
                    {plan.name}
                  </CardTitle>
                  <CardDescription data-testid={`text-plan-description-${plan.id}`}>
                    {plan.description}
                  </CardDescription>
                </CardHeader>
                
                <CardContent className="flex-1">
                  <div className="text-center mb-6">
                    <div className="flex items-baseline justify-center gap-1">
                      <span 
                        className="text-4xl font-bold"
                        data-testid={`text-plan-price-${plan.id}`}
                      >
                        {formatPrice(plan.monthlyPrice, plan.yearlyPrice)}
                      </span>
                      <span className="text-muted-foreground text-sm">
                        {getPeriod(plan.monthlyPrice)}
                      </span>
                    </div>
                    {isYearly && savings && (
                      <p className="text-sm text-green-500 mt-1" data-testid={`text-savings-${plan.id}`}>
                        Save {savings}% vs monthly
                      </p>
                    )}
                  </div>
                  
                  <ul className="space-y-3">
                    {plan.features.map((feature, index) => (
                      <li 
                        key={index}
                        className="flex items-start gap-3"
                        data-testid={`feature-${plan.id}-${index}`}
                      >
                        {feature.included ? (
                          <Check className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                        ) : (
                          <X className="w-5 h-5 text-muted-foreground/50 shrink-0 mt-0.5" />
                        )}
                        <span className={feature.included ? '' : 'text-muted-foreground/50'}>
                          {feature.name}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                
                <CardFooter className="pt-4">
                  {plan.currentPlan ? (
                    <Button 
                      variant="outline" 
                      className="w-full" 
                      disabled
                      data-testid={`button-plan-${plan.id}`}
                    >
                      Current Plan
                    </Button>
                  ) : (
                    <Button 
                      variant={plan.popular ? "default" : "outline"}
                      className="w-full"
                      data-testid={`button-plan-${plan.id}`}
                    >
                      <Zap className="w-4 h-4 mr-2" />
                      Upgrade to {plan.name}
                    </Button>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>

        <div className="mt-12 text-center">
          <p className="text-sm text-muted-foreground" data-testid="text-pricing-footer">
            All plans include access to our core trading research platform. 
            Upgrade or downgrade at any time.
          </p>
        </div>
      </div>
    </div>
  );
}
