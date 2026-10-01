import { useState, useEffect } from "react";
import { useSearch } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, PASSWORD_TOO_SHORT_MESSAGE, PASSWORD_TOO_LONG_MESSAGE, PASSWORD_RULE_TEXT } from "@shared/password-policy";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle, ArrowRight, ArrowLeft, Shield, Mail, Sparkles, Lock, User } from "lucide-react";
import "@/styles/nexus.css";
import NextSteps from "@/components/landing/next-steps";
import { reasonOf } from "@/lib/optimistic";

const verifyCodeSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  token: z.string().min(4, "Access code must be at least 4 characters"),
});

const onboardingSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  occupation: z.string().optional(),
  tradingExperienceLevel: z.enum(["beginner", "intermediate", "advanced", "professional"]),
  knowledgeFocus: z.array(z.string()).min(1, "Select at least one area"),
  investmentGoals: z.enum(["income", "growth", "speculation", "hedging"]),
  riskTolerance: z.enum(["conservative", "moderate", "aggressive", "very_aggressive"]),
  referralSource: z.string().optional(),
  password: z.string().min(PASSWORD_MIN_LENGTH, PASSWORD_TOO_SHORT_MESSAGE).max(PASSWORD_MAX_LENGTH, PASSWORD_TOO_LONG_MESSAGE),
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

const inputStyles: React.CSSProperties = {
  backgroundColor: '#1a1a2e',
  border: '1px solid #374151',
  borderRadius: '8px',
  padding: '10px 12px',
  color: '#ffffff',
  fontSize: '16px',
  minHeight: '44px',
  width: '100%',
  outline: 'none',
};

const inputWithIconStyles: React.CSSProperties = {
  ...inputStyles,
  paddingLeft: '40px',
};

export default function JoinBeta() {
  const search = useSearch();
  const { toast } = useToast();
  const [step, setStep] = useState<"verify" | "onboard" | "success">("verify");
  const [verifiedEmail, setVerifiedEmail] = useState("");
  const [firstName, setFirstName] = useState<string | null>(null);

  const urlParams = new URLSearchParams(search);
  const initialCode = urlParams.get("code") || urlParams.get("invite") || "";

  const verifyForm = useForm<VerifyCodeForm>({
    resolver: zodResolver(verifyCodeSchema),
    defaultValues: { email: "", token: initialCode.trim() },
  });

  useEffect(() => {
    const params = new URLSearchParams(search);
    const code = params.get("code") || params.get("invite");
    if (code) {
      verifyForm.setValue("token", code.trim());
    }
  }, [search]);

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
        title: "Code verified",
        description: "Complete your profile to finish.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Couldn’t verify the code",
        description: reasonOf(error),
        variant: "destructive",
      });
    },
  });

  const onboardMutation = useMutation({
    mutationFn: async (data: OnboardingForm) => {
      const response = await apiRequest("POST", "/api/beta/onboard", data);
      return response.json();
    },
    onSuccess: (_res, vars) => {
      // Next steps instead of a 2-second jump to /t (home-page pass 2026-09-30).
      setFirstName(vars.firstName?.trim() || null);
      setStep("success");
    },
    onError: (error: any) => {
      if (error.requiresVerification) {
        setStep("verify");
        toast({
          title: "Session expired",
          description: "Verify your code again to continue.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Couldn’t finish registration",
          description: reasonOf(error),
          variant: "destructive",
        });
      }
    },
  });

  if (step === "success") {
    return (
      <div className="landing nexus-vars lp auth-page">
        <main className="auth-wrap">
          <NextSteps name={firstName} />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--surface-base)] flex items-start justify-center py-8 px-6 relative overflow-y-auto">
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-sky-500/5 blur-[120px] rounded-full pointer-events-none" />
      
      <div className="w-full max-w-lg relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <img src="/favicon.svg" alt="" width={40} height={40} className="w-10 h-10" />
            <span className="text-xl font-bold text-foreground tracking-tight">QuantEdge</span>
          </div>
          <h1 className="text-xl font-semibold text-foreground mb-1" data-testid="text-join-beta-title">
            {step === "verify" ? "Verify Your Access" : "Complete Your Profile"}
          </h1>
          <p className="text-muted-foreground text-sm">
            {step === "verify" ? "Enter your email and access code to continue" : "Tell us about your trading experience"}
          </p>
        </div>

        <div className="flex justify-center items-center gap-3 mb-8">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-semibold transition-all ${step === "verify" ? "bg-sky-500 text-black shadow-lg" : "bg-emerald-500/20 border border-emerald-500/30 text-[var(--trade-bullish)]"}`}>
            {step !== "verify" ? <CheckCircle className="w-5 h-5" /> : "1"}
          </div>
          <div className={`w-16 h-0.5 rounded-full transition-all ${step === "onboard" ? "bg-sky-500" : "bg-muted"}`} />
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-semibold transition-all ${step === "onboard" ? "bg-sky-500 text-black shadow-lg" : "bg-muted border border-border text-muted-foreground"}`}>
            2
          </div>
        </div>

        {step === "verify" ? (
          <div className="bg-card border border-border rounded-2xl shadow-2xl shadow-black/50 relative overflow-hidden">
            <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-sky-500/30 to-transparent" />
            <CardHeader className="pb-4 pt-6">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
                  <Shield className="w-4 h-4 text-sky-400" />
                </div>
                <CardTitle className="text-foreground text-lg">Enter Your Details</CardTitle>
              </div>
              <CardDescription className="text-muted-foreground">
                Use the email where you received your invite.
              </CardDescription>
            </CardHeader>
            <CardContent className="pb-6">
              <form 
                onSubmit={verifyForm.handleSubmit((data) => verifyMutation.mutate(data))} 
                className="space-y-4"
                autoComplete="off"
              >
                <div>
                  <label htmlFor="jb-email" className="block text-foreground text-sm font-medium mb-2">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sky-500 z-10" />
                    <input
                      type="email"
                      placeholder="you@example.com"
                      id="jb-email"
                      data-testid="input-verify-email"
                      autoComplete="email"
                      style={inputWithIconStyles}
                      {...verifyForm.register("email")}
                    />
                  </div>
                  {verifyForm.formState.errors.email && (
                    <p className="text-[var(--trade-bearish)] text-sm mt-1">{verifyForm.formState.errors.email.message}</p>
                  )}
                </div>
                
                <div>
                  <label htmlFor="jb-token" className="block text-foreground text-sm font-medium mb-2">Invite code</label>
                  <div className="relative">
                    <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sky-500 z-10" />
                    <input
                      type="text"
                      placeholder="Enter your invite code"
                      id="jb-token"
                      autoCapitalize="none"
                      data-testid="input-verify-token"
                      autoComplete="one-time-code"
                      style={{ ...inputWithIconStyles, fontFamily: 'monospace', color: '#3b8cff' }}
                      {...verifyForm.register("token")}
                    />
                  </div>
                  {verifyForm.formState.errors.token && (
                    <p className="text-[var(--trade-bearish)] text-sm mt-1">{verifyForm.formState.errors.token.message}</p>
                  )}
                </div>

                <Button 
                  type="submit" 
                  className="w-full h-12 bg-sky-500 hover:bg-sky-400 text-black font-semibold rounded-xl shadow-lg transition-all hover:shadow-lg mt-2"
                  disabled={verifyMutation.isPending}
                  data-testid="button-verify-code"
                >
                  {verifyMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <ArrowRight className="w-4 h-4 mr-2" />
                  )}
                  Verify & Continue
                </Button>
              </form>
            </CardContent>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-2xl shadow-2xl shadow-black/50 relative overflow-hidden">
            <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-sky-500/30 to-transparent" />
            <CardHeader className="pb-4 pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-foreground text-lg">Your Profile</CardTitle>
                  <CardDescription className="text-sky-400">
                    {verifiedEmail}
                  </CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep("verify")}
                  className="text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  Back
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pb-6">
              <Form {...onboardingForm}>
                <form onSubmit={onboardingForm.handleSubmit((data) => onboardMutation.mutate(data))} className="space-y-4">
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="jb-first" className="block text-foreground text-sm font-medium mb-2">First name</label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
                        <input
                          type="text"
                          id="jb-first"
                          data-testid="input-first-name"
                          autoComplete="given-name"
                          style={inputWithIconStyles}
                          {...onboardingForm.register("firstName")}
                        />
                      </div>
                      {onboardingForm.formState.errors.firstName && (
                        <p className="text-[var(--trade-bearish)] text-sm mt-1">{onboardingForm.formState.errors.firstName.message}</p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="jb-last" className="block text-foreground text-sm font-medium mb-2">Last name</label>
                      <input
                        type="text"
                        id="jb-last"
                        data-testid="input-last-name"
                        autoComplete="family-name"
                        style={inputStyles}
                        {...onboardingForm.register("lastName")}
                      />
                      {onboardingForm.formState.errors.lastName && (
                        <p className="text-[var(--trade-bearish)] text-sm mt-1">{onboardingForm.formState.errors.lastName.message}</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="jb-occ" className="block text-foreground text-sm font-medium mb-2">Occupation (optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Software Engineer"
                      id="jb-occ"
                      data-testid="input-occupation"
                      autoComplete="off"
                      data-lpignore="true"
                      style={{ ...inputStyles, color: '#ffffff' }}
                      {...onboardingForm.register("occupation")}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={onboardingForm.control}
                      name="tradingExperienceLevel"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-foreground">Experience</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger className="bg-background border-border text-foreground focus:border-sky-500" data-testid="select-experience">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="bg-background border-border">
                              {EXPERIENCE_LEVELS.map(level => (
                                <SelectItem key={level.value} value={level.value} className="text-foreground">{level.label}</SelectItem>
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
                          <FormLabel className="text-foreground">Risk Tolerance</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger className="bg-background border-border text-foreground focus:border-sky-500" data-testid="select-risk">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="bg-background border-border">
                              {RISK_TOLERANCES.map(risk => (
                                <SelectItem key={risk.value} value={risk.value} className="text-foreground">{risk.label}</SelectItem>
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
                        <FormLabel className="text-foreground">Investment Goal</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="bg-background border-border text-foreground focus:border-sky-500" data-testid="select-goals">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="bg-background border-border">
                            {INVESTMENT_GOALS.map(goal => (
                              <SelectItem key={goal.value} value={goal.value} className="text-foreground">{goal.label}</SelectItem>
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
                        <FormLabel className="text-foreground">Areas of Interest</FormLabel>
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          {KNOWLEDGE_AREAS.map((area) => (
                            <FormField
                              key={area.value}
                              control={onboardingForm.control}
                              name="knowledgeFocus"
                              render={({ field }) => (
                                <FormItem className="flex items-center space-x-2 space-y-0 p-2 rounded-lg bg-background/50 border border-border/50 hover:border-border transition-colors">
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value?.includes(area.value)}
                                      onCheckedChange={(checked) => {
                                        const updated = checked
                                          ? [...(field.value || []), area.value]
                                          : field.value?.filter((v: string) => v !== area.value) || [];
                                        field.onChange(updated);
                                      }}
                                      className="border-neutral-600 data-[state=checked]:bg-sky-500 data-[state=checked]:border-sky-500"
                                      data-testid={`checkbox-${area.value}`}
                                    />
                                  </FormControl>
                                  <FormLabel className="text-sm text-foreground font-normal cursor-pointer">
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

                  <div className="pt-2 border-t border-border">
                    <div>
                      <label htmlFor="jb-pw" className="block text-foreground text-sm font-medium mb-2">Password</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
                        <input
                          type="password"
                          id="jb-pw"
                          aria-describedby="jb-pw-rule"
                          data-testid="input-password"
                          autoComplete="new-password"
                          style={inputWithIconStyles}
                          {...onboardingForm.register("password")}
                        />
                      </div>
                      <p id="jb-pw-rule" className="text-muted-foreground text-xs mt-1">{PASSWORD_RULE_TEXT}</p>
                      {onboardingForm.formState.errors.password && (
                        <p className="text-[var(--trade-bearish)] text-sm mt-1">{onboardingForm.formState.errors.password.message}</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="jb-pw2" className="block text-foreground text-sm font-medium mb-2">Confirm password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
                      <input
                        type="password"
                        id="jb-pw2"
                        data-testid="input-confirm-password"
                        autoComplete="new-password"
                        style={inputWithIconStyles}
                        {...onboardingForm.register("confirmPassword")}
                      />
                    </div>
                    {onboardingForm.formState.errors.confirmPassword && (
                      <p className="text-[var(--trade-bearish)] text-sm mt-1">{onboardingForm.formState.errors.confirmPassword.message}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="jb-ref" className="block text-foreground text-sm font-medium mb-2">How did you find us? (optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Twitter, Friend, Google"
                      id="jb-ref"
                      data-testid="input-referral"
                      autoComplete="off"
                      style={inputStyles}
                      {...onboardingForm.register("referralSource")}
                    />
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full h-12 bg-sky-500 hover:bg-sky-400 text-black font-semibold rounded-xl shadow-lg transition-all hover:shadow-lg mt-2"
                    disabled={onboardMutation.isPending}
                    data-testid="button-complete-profile"
                  >
                    {onboardMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <CheckCircle className="w-4 h-4 mr-2" />
                    )}
                    Create my account
                  </Button>
                </form>
              </Form>
            </CardContent>
          </div>
        )}

        <p className="text-center text-muted-foreground text-xs mt-6">
          By signing up, you agree to our <a href="/terms" className="underline">Terms of Service</a> and <a href="/privacy" className="underline">Privacy Policy</a>, and acknowledge that QuantEdge is an
          educational research tool, not investment advice. Trading stocks, options and crypto involves substantial risk of loss.
        </p>
      </div>
    </div>
  );
}
