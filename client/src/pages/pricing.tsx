import { useState } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Check, X, Crown, Zap, TrendingUp, Rocket, Clock } from "lucide-react";

interface PlanFeature {
  name: string;
  included: boolean;
  comingSoon?: boolean;
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
  comingSoon?: boolean;
}

const plans: PricingPlan[] = [
  {
    id: "free",
    name: "Free",
    description: "Preview the platform and explore trade ideas",
    monthlyPrice: 0,
    yearlyPrice: 0,
    icon: TrendingUp,
    currentPlan: true,
    features: [
      { name: "5 trade ideas per day", included: true },
      { name: "Delayed market data (15min)", included: true },
      { name: "7-day performance history", included: true },
      { name: "Stocks & crypto only", included: true },
      { name: "3 watchlist items", included: true },
      { name: "Real-time market data", included: false },
      { name: "Chart analysis", included: false },
      { name: "Discord alerts", included: false },
      { name: "Advanced analytics", included: false },
    ],
  },
  {
    id: "advanced",
    name: "Advanced",
    description: "Full stock & crypto access for serious traders",
    monthlyPrice: 39,
    yearlyPrice: 349,
    icon: Zap,
    popular: true,
    features: [
      { name: "Unlimited trade ideas", included: true },
      { name: "Real-time market data", included: true },
      { name: "Unlimited chart analyses", included: true },
      { name: "Unlimited AI generations", included: true },
      { name: "Full performance history", included: true },
      { name: "Discord alerts", included: true },
      { name: "Advanced analytics", included: true },
      { name: "Export data", included: true },
      { name: "50 watchlist items", included: true },
    ],
  },
  {
    id: "pro",
    name: "Pro",
    description: "For power users who need institutional-grade tools",
    monthlyPrice: 79,
    yearlyPrice: 699,
    icon: Rocket,
    comingSoon: true,
    features: [
      { name: "Everything in Advanced", included: true },
      { name: "Futures trading (NQ, ES, GC)", included: true, comingSoon: true },
      { name: "REST API access", included: true, comingSoon: true },
      { name: "White-label PDF reports", included: true, comingSoon: true },
      { name: "Backtesting module", included: true, comingSoon: true },
      { name: "Custom webhooks (Slack, Telegram)", included: true, comingSoon: true },
      { name: "Portfolio correlation analytics", included: true, comingSoon: true },
      { name: "Priority idea generation", included: true, comingSoon: true },
      { name: "1-on-1 onboarding call", included: true, comingSoon: true },
      { name: "Private Discord channel", included: true, comingSoon: true },
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
            Start with Free to preview the platform, then upgrade to Advanced for unlimited access and real-time data.
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 max-w-6xl mx-auto">
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
                {plan.comingSoon && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge 
                      variant="secondary" 
                      className="bg-amber-500/10 text-amber-600 border-amber-500/20"
                      data-testid="badge-coming-soon"
                    >
                      <Clock className="w-3 h-3 mr-1" />
                      Coming Soon
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
                        <span className={`flex items-center gap-2 ${feature.included ? '' : 'text-muted-foreground/50'}`}>
                          {feature.name}
                          {feature.comingSoon && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-amber-600 border-amber-500/30">
                              Soon
                            </Badge>
                          )}
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
                  ) : plan.comingSoon ? (
                    <Button 
                      variant="outline"
                      className="w-full"
                      data-testid={`button-plan-${plan.id}`}
                    >
                      <Clock className="w-4 h-4 mr-2" />
                      Join Waitlist
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
