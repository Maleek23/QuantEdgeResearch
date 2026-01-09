import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle, Mail, Key, User, Shield, ArrowRight, ArrowLeft } from "lucide-react";
import { FloatingBubblesBackground } from "@/components/floating-bubbles-background";
import quantEdgeLabsLogoUrl from "@assets/q_1767502987714.png";

const verifyCodeSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  token: z.string().min(4, "Access code must be at least 4 characters"),
});

const onboardingSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  occupation: z.string().min(1, "Occupation is required"),
  tradingExperienceLevel: z.enum(["beginner", "intermediate", "advanced", "professional"]),
  knowledgeFocus: z.array(z.string()).min(1, "Select at least one area"),
  investmentGoals: z.enum(["income", "growth", "speculation", "hedging"]),
  riskTolerance: z.enum(["conservative", "moderate", "aggressive", "very_aggressive"]),
  referralSource: z.string().min(1, "Please tell us how you found us"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type VerifyCodeForm = z.infer<typeof verifyCodeSchema>;
type OnboardingForm = z.infer<typeof onboardingSchema>;

const KNOWLEDGE_AREAS = [
  { value: "stocks", label: "Stocks" },
  { value: "options", label: "Options" },
  { value: "futures", label: "Futures" },
  { value: "crypto", label: "Cryptocurrency" },
  { value: "forex", label: "Forex" },
  { value: "technical_analysis", label: "Technical Analysis" },
];

const EXPERIENCE_LEVELS = [
  { value: "beginner", label: "Beginner (0-1 years)" },
  { value: "intermediate", label: "Intermediate (1-3 years)" },
  { value: "advanced", label: "Advanced (3-7 years)" },
  { value: "professional", label: "Professional (7+ years)" },
];

const INVESTMENT_GOALS = [
  { value: "income", label: "Generate Income" },
  { value: "growth", label: "Long-term Growth" },
  { value: "speculation", label: "Short-term Speculation" },
  { value: "hedging", label: "Portfolio Hedging" },
];

const RISK_TOLERANCES = [
  { value: "conservative", label: "Conservative - Preserve capital" },
  { value: "moderate", label: "Moderate - Balanced approach" },
  { value: "aggressive", label: "Aggressive - Higher risk tolerance" },
  { value: "very_aggressive", label: "Very Aggressive - Max risk for max reward" },
];

export default function JoinBeta() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const [step, setStep] = useState<"verify" | "onboard" | "success">("verify");
  const [verifiedEmail, setVerifiedEmail] = useState("");

  const verifyForm = useForm<VerifyCodeForm>({
    resolver: zodResolver(verifyCodeSchema),
    defaultValues: { email: "", token: "" },
  });

  useEffect(() => {
    const params = new URLSearchParams(search);
    const code = params.get("code") || params.get("invite");
    if (code) {
      verifyForm.setValue("token", code.trim());
    }
  }, [search, verifyForm]);

  const onboardingForm = useForm<OnboardingForm>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      occupation: "",
      tradingExperienceLevel: "intermediate",
      knowledgeFocus: [],
      investmentGoals: "growth",
      riskTolerance: "moderate",
      referralSource: "",
      password: "",
      confirmPassword: "",
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async (data: VerifyCodeForm) => {
      const response = await apiRequest("POST", "/api/beta/verify-code", {
        email: data.email.trim().toLowerCase(),
        token: data.token.trim().toLowerCase(),
      });
      return response.json();
    },
    onSuccess: (data) => {
      setVerifiedEmail(data.email);
      setStep("onboard");
      toast({
        title: "Code Verified!",
        description: "Complete your profile to get started.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Verification Failed",
        description: error.message || "Invalid or expired access code",
        variant: "destructive",
      });
    },
  });

  const onboardMutation = useMutation({
    mutationFn: async (data: OnboardingForm) => {
      const response = await apiRequest("POST", "/api/beta/onboard", data);
      return response.json();
    },
    onSuccess: () => {
      setStep("success");
      toast({
        title: "Welcome to the Beta!",
        description: "Your account is now active.",
      });
      setTimeout(() => navigate("/automations"), 2000);
    },
    onError: (error: any) => {
      if (error.requiresVerification) {
        setStep("verify");
        toast({
          title: "Session Expired",
          description: "Please verify your code again.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Registration Failed",
          description: error.message || "Something went wrong",
          variant: "destructive",
        });
      }
    },
  });

  if (step === "success") {
    return (
      <div className="min-h-screen bg-[#050b16] flex items-center justify-center p-4">
        <FloatingBubblesBackground />
        <Card className="w-full max-w-md text-center bg-[#0a1525]/90 border-white/10 backdrop-blur-xl relative z-10">
          <CardHeader>
            <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-400" />
            </div>
            <CardTitle className="text-2xl text-white" data-testid="text-welcome-title">Welcome to the Lab!</CardTitle>
            <CardDescription className="text-slate-400">
              Your beta access is now active. Redirecting you to the Automations Hub...
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={() => navigate("/automations")} 
              className="w-full bg-gradient-to-r from-cyan-500 to-cyan-400 text-slate-950 font-bold hover:from-cyan-400 hover:to-cyan-300" 
              data-testid="button-go-automations"
            >
              Go to Automations Hub
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050b16] flex items-center justify-center p-4">
      <FloatingBubblesBackground />
      <div className="w-full max-w-lg relative z-10">
        {/* Logo Header */}
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-3 mb-4">
            <img 
              src={quantEdgeLabsLogoUrl} 
              alt="Quant Edge Labs" 
              className="h-12 w-12 object-contain drop-shadow-[0_0_15px_rgba(0,212,255,0.4)]" 
            />
            <h2 className="text-xl font-bold bg-gradient-to-r from-cyan-300 via-cyan-400 to-cyan-500 bg-clip-text text-transparent italic">
              Quant Edge Labs
            </h2>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2" data-testid="text-join-beta-title">Join the Beta</h1>
          <p className="text-slate-400">
            {step === "verify" 
              ? "Enter your email and the access code you received" 
              : "Complete your profile to get started"}
          </p>
        </div>

        {/* Progress Steps */}
        <div className="flex justify-center mb-6">
          <div className="flex items-center gap-2">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all ${step === "verify" ? "bg-gradient-to-r from-cyan-500 to-cyan-400 text-slate-950" : "bg-green-500/20 border border-green-500/50 text-green-400"}`}>
              {step !== "verify" ? <CheckCircle className="w-5 h-5" /> : "1"}
            </div>
            <div className={`w-16 h-0.5 transition-all ${step === "onboard" ? "bg-cyan-500" : "bg-slate-700"}`} />
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all ${step === "onboard" ? "bg-gradient-to-r from-cyan-500 to-cyan-400 text-slate-950" : "bg-slate-800 border border-slate-700 text-slate-500"}`}>
              2
            </div>
          </div>
        </div>

        {step === "verify" ? (
          <Card className="bg-[#0a1525]/90 border-white/10 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Key className="w-5 h-5 text-cyan-400" />
                Verify Your Access
              </CardTitle>
              <CardDescription className="text-slate-400">
                Enter the email address where you received your invite and the access code.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...verifyForm}>
                <form onSubmit={verifyForm.handleSubmit((data) => verifyMutation.mutate(data))} className="space-y-4">
                  <FormField
                    control={verifyForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Address</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                            <Input 
                              placeholder="you@example.com" 
                              className="pl-10 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500" 
                              data-testid="input-verify-email"
                              {...field} 
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={verifyForm.control}
                    name="token"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Access Code</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Shield className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                            <Input 
                              placeholder="XXXX-XXXX" 
                              className="pl-10 uppercase font-mono tracking-wider bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500" 
                              data-testid="input-verify-token"
                              {...field} 
                            />
                          </div>
                        </FormControl>
                        <FormDescription>
                          The code from your invite email (case-insensitive)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button 
                    type="submit" 
                    className="w-full bg-gradient-to-r from-cyan-500 to-cyan-400 text-slate-950 font-bold hover:from-cyan-400 hover:to-cyan-300" 
                    disabled={verifyMutation.isPending}
                    data-testid="button-verify-code"
                  >
                    {verifyMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <ArrowRight className="w-4 h-4 mr-2" />
                    )}
                    Verify Code
                  </Button>
                </form>
              </Form>

              <div className="mt-6 pt-4 border-t border-white/10 text-center text-sm text-slate-500">
                <p>Don't have an invite code?</p>
                <Button variant="ghost" className="text-cyan-400 hover:text-cyan-300" onClick={() => navigate("/")} data-testid="button-join-waitlist">
                  Join the Waitlist
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-[#0a1525]/90 border-white/10 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <User className="w-5 h-5 text-cyan-400" />
                Complete Your Profile
              </CardTitle>
              <CardDescription className="text-slate-400">
                Tell us about yourself so we can personalize your experience.
                <br />
                <span className="text-xs text-slate-500">Signing up as: {verifiedEmail}</span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...onboardingForm}>
                <form onSubmit={onboardingForm.handleSubmit((data) => onboardMutation.mutate(data))} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={onboardingForm.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First Name</FormLabel>
                          <FormControl>
                            <Input placeholder="John" className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500" data-testid="input-first-name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={onboardingForm.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Last Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Doe" className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500" data-testid="input-last-name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={onboardingForm.control}
                    name="occupation"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Occupation</FormLabel>
                        <FormControl>
                          <Input placeholder="Software Engineer, Trader, Student..." className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500" data-testid="input-occupation" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={onboardingForm.control}
                    name="tradingExperienceLevel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Trading Experience</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="bg-slate-800/50 border-slate-700 text-white" data-testid="select-experience">
                              <SelectValue placeholder="Select your experience level" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {EXPERIENCE_LEVELS.map(level => (
                              <SelectItem key={level.value} value={level.value}>
                                {level.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={onboardingForm.control}
                    name="knowledgeFocus"
                    render={() => (
                      <FormItem>
                        <FormLabel>Areas of Interest</FormLabel>
                        <div className="grid grid-cols-2 gap-2">
                          {KNOWLEDGE_AREAS.map((area) => (
                            <FormField
                              key={area.value}
                              control={onboardingForm.control}
                              name="knowledgeFocus"
                              render={({ field }) => (
                                <FormItem className="flex flex-row items-start space-x-2 space-y-0">
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value?.includes(area.value)}
                                      onCheckedChange={(checked) => {
                                        return checked
                                          ? field.onChange([...field.value, area.value])
                                          : field.onChange(field.value?.filter((v: string) => v !== area.value));
                                      }}
                                      data-testid={`checkbox-${area.value}`}
                                    />
                                  </FormControl>
                                  <Label className="text-sm font-normal cursor-pointer">
                                    {area.label}
                                  </Label>
                                </FormItem>
                              )}
                            />
                          ))}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={onboardingForm.control}
                    name="investmentGoals"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Investment Goals</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="bg-slate-800/50 border-slate-700 text-white" data-testid="select-goals">
                              <SelectValue placeholder="Select your primary goal" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {INVESTMENT_GOALS.map(goal => (
                              <SelectItem key={goal.value} value={goal.value}>
                                {goal.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={onboardingForm.control}
                    name="riskTolerance"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Risk Tolerance</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="bg-slate-800/50 border-slate-700 text-white" data-testid="select-risk">
                              <SelectValue placeholder="Select your risk tolerance" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {RISK_TOLERANCES.map(risk => (
                              <SelectItem key={risk.value} value={risk.value}>
                                {risk.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={onboardingForm.control}
                    name="referralSource"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>How did you hear about us?</FormLabel>
                        <FormControl>
                          <Input placeholder="Twitter, Discord, Friend, etc." className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500" data-testid="input-referral" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="border-t border-white/10 pt-4">
                    <h3 className="font-medium mb-3 text-white">Create Your Password</h3>
                    <div className="space-y-4">
                      <FormField
                        control={onboardingForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Password</FormLabel>
                            <FormControl>
                              <Input type="password" placeholder="••••••••" className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500" data-testid="input-password" {...field} />
                            </FormControl>
                            <FormDescription>At least 8 characters</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={onboardingForm.control}
                        name="confirmPassword"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Confirm Password</FormLabel>
                            <FormControl>
                              <Input type="password" placeholder="••••••••" className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500" data-testid="input-confirm-password" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <Button 
                      type="button" 
                      variant="outline" 
                      className="border-slate-600 text-slate-300 hover:bg-slate-800"
                      onClick={() => setStep("verify")}
                      data-testid="button-back"
                    >
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      Back
                    </Button>
                    <Button 
                      type="submit" 
                      className="flex-1 bg-gradient-to-r from-cyan-500 to-cyan-400 text-slate-950 font-bold hover:from-cyan-400 hover:to-cyan-300" 
                      disabled={onboardMutation.isPending}
                      data-testid="button-complete-signup"
                    >
                      {onboardMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <CheckCircle className="w-4 h-4 mr-2" />
                      )}
                      Complete Signup
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-slate-500 mt-6">
          By signing up, you agree that this platform is for educational and research purposes only.
          <br />
          Past performance is not indicative of future results.
        </p>
      </div>
    </div>
  );
}
