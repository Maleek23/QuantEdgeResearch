import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle, ArrowRight, ArrowLeft } from "lucide-react";

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
  { value: "conservative", label: "Conservative" },
  { value: "moderate", label: "Moderate" },
  { value: "aggressive", label: "Aggressive" },
  { value: "very_aggressive", label: "Very Aggressive" },
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
        title: "Code Verified",
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
        title: "Welcome!",
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
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-6 w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-semibold text-white mb-2" data-testid="text-welcome-title">Welcome!</h1>
          <p className="text-neutral-500 mb-6">Your account is active. Redirecting...</p>
          <Button 
            onClick={() => navigate("/automations")} 
            className="bg-cyan-400 hover:bg-cyan-300 text-black font-semibold"
            data-testid="button-go-automations"
          >
            Go to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <span className="text-2xl font-bold text-white tracking-tight">QUANT EDGE</span>
            <span className="text-neutral-600">|</span>
            <span className="text-sm font-medium text-neutral-500 tracking-widest">LABS</span>
          </div>
          <h1 className="text-xl font-semibold text-white mb-1" data-testid="text-join-beta-title">
            {step === "verify" ? "Verify Access" : "Complete Profile"}
          </h1>
          <p className="text-neutral-500 text-sm">
            {step === "verify" ? "Enter your email and access code" : "Tell us about yourself"}
          </p>
        </div>

        {/* Progress */}
        <div className="flex justify-center items-center gap-3 mb-8">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step === "verify" ? "bg-cyan-400 text-black" : "bg-emerald-500/20 text-emerald-400"}`}>
            {step !== "verify" ? <CheckCircle className="w-4 h-4" /> : "1"}
          </div>
          <div className={`w-12 h-px ${step === "onboard" ? "bg-cyan-400" : "bg-neutral-800"}`} />
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step === "onboard" ? "bg-cyan-400 text-black" : "bg-neutral-800 text-neutral-600"}`}>
            2
          </div>
        </div>

        {step === "verify" ? (
          <Card className="bg-[#141414] border-neutral-800">
            <CardHeader className="pb-4">
              <CardTitle className="text-white text-lg">Enter Your Details</CardTitle>
              <CardDescription className="text-neutral-500">
                Use the email where you received your invite.
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
                        <FormLabel className="text-neutral-300">Email</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="you@example.com" 
                            className="bg-neutral-900 border-neutral-700 text-white placeholder:text-neutral-600"
                            data-testid="input-verify-email"
                            {...field} 
                          />
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
                        <FormLabel className="text-neutral-300">Access Code</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Enter your invite code"
                            className="font-mono bg-neutral-900 border-neutral-700 text-white placeholder:text-neutral-600"
                            data-testid="input-verify-token"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button 
                    type="submit" 
                    className="w-full h-11 bg-cyan-400 hover:bg-cyan-300 text-black font-semibold"
                    disabled={verifyMutation.isPending}
                    data-testid="button-verify-code"
                  >
                    {verifyMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <ArrowRight className="w-4 h-4 mr-2" />
                    )}
                    Verify
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-[#141414] border-neutral-800">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-white text-lg">Your Profile</CardTitle>
                  <CardDescription className="text-neutral-500">
                    {verifiedEmail}
                  </CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep("verify")}
                  className="text-neutral-400 hover:text-white"
                >
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  Back
                </Button>
              </div>
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
                          <FormLabel className="text-neutral-300">First Name</FormLabel>
                          <FormControl>
                            <Input 
                              className="bg-neutral-900 border-neutral-700 text-white"
                              data-testid="input-first-name"
                              {...field} 
                            />
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
                          <FormLabel className="text-neutral-300">Last Name</FormLabel>
                          <FormControl>
                            <Input 
                              className="bg-neutral-900 border-neutral-700 text-white"
                              data-testid="input-last-name"
                              {...field} 
                            />
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
                        <FormLabel className="text-neutral-300">Occupation</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="e.g. Software Engineer"
                            className="bg-neutral-900 border-neutral-700 text-white placeholder:text-neutral-600"
                            data-testid="input-occupation"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={onboardingForm.control}
                      name="tradingExperienceLevel"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-neutral-300">Experience</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger className="bg-neutral-900 border-neutral-700 text-white" data-testid="select-experience">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {EXPERIENCE_LEVELS.map(level => (
                                <SelectItem key={level.value} value={level.value}>{level.label}</SelectItem>
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
                          <FormLabel className="text-neutral-300">Risk Tolerance</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger className="bg-neutral-900 border-neutral-700 text-white" data-testid="select-risk">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {RISK_TOLERANCES.map(risk => (
                                <SelectItem key={risk.value} value={risk.value}>{risk.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={onboardingForm.control}
                    name="investmentGoals"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-neutral-300">Investment Goal</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="bg-neutral-900 border-neutral-700 text-white" data-testid="select-goals">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {INVESTMENT_GOALS.map(goal => (
                              <SelectItem key={goal.value} value={goal.value}>{goal.label}</SelectItem>
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
                        <FormLabel className="text-neutral-300">Areas of Interest</FormLabel>
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          {KNOWLEDGE_AREAS.map((area) => (
                            <FormField
                              key={area.value}
                              control={onboardingForm.control}
                              name="knowledgeFocus"
                              render={({ field }) => (
                                <FormItem className="flex items-center space-x-2 space-y-0">
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value?.includes(area.value)}
                                      onCheckedChange={(checked) => {
                                        const updated = checked
                                          ? [...(field.value || []), area.value]
                                          : field.value?.filter((v: string) => v !== area.value) || [];
                                        field.onChange(updated);
                                      }}
                                      className="border-neutral-600"
                                      data-testid={`checkbox-${area.value}`}
                                    />
                                  </FormControl>
                                  <FormLabel className="text-sm text-neutral-400 font-normal cursor-pointer">
                                    {area.label}
                                  </FormLabel>
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
                    name="referralSource"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-neutral-300">How did you find us?</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="e.g. Twitter, friend referral"
                            className="bg-neutral-900 border-neutral-700 text-white placeholder:text-neutral-600"
                            data-testid="input-referral"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="border-t border-neutral-800 pt-4 mt-4">
                    <p className="text-neutral-400 text-sm mb-4">Create your password</p>
                    <div className="space-y-4">
                      <FormField
                        control={onboardingForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-neutral-300">Password</FormLabel>
                            <FormControl>
                              <Input 
                                type="password"
                                className="bg-neutral-900 border-neutral-700 text-white"
                                data-testid="input-password"
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={onboardingForm.control}
                        name="confirmPassword"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-neutral-300">Confirm Password</FormLabel>
                            <FormControl>
                              <Input 
                                type="password"
                                className="bg-neutral-900 border-neutral-700 text-white"
                                data-testid="input-confirm-password"
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full h-11 bg-cyan-400 hover:bg-cyan-300 text-black font-semibold mt-4"
                    disabled={onboardMutation.isPending}
                    data-testid="button-complete-signup"
                  >
                    {onboardMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <CheckCircle className="w-4 h-4 mr-2" />
                    )}
                    Complete Sign Up
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}

        <p className="text-center text-neutral-600 text-xs mt-6">
          For educational and research purposes only.
        </p>
      </div>
    </div>
  );
}
