import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { LogIn, ArrowLeft, Eye, EyeOff, AlertCircle } from "lucide-react";
import { SiGoogle } from "react-icons/si";
import { Separator } from "@/components/ui/separator";
import { Link } from "wouter";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean().default(false),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [showDevLogin, setShowDevLogin] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Handle URL error parameters from OAuth callbacks
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    
    if (error) {
      const errorMessages: Record<string, string> = {
        'invite_required': 'This is an invite-only beta. You need an invite to sign in with Google. Join our waitlist to request access!',
        'google_auth_failed': 'Google sign-in failed. Please try again.',
        'no_user': 'Could not retrieve your account. Please try again.',
        'login_failed': 'Login failed. Please try again.',
      };
      
      setAuthError(errorMessages[error] || 'An error occurred during sign-in.');
      
      // Clear the error from URL without page reload
      window.history.replaceState({}, '', '/login');
    }
  }, []);

  // Dev login mutation
  const devLoginMutation = useMutation({
    mutationFn: async (code: string) => {
      const response = await apiRequest("POST", "/api/auth/dev-login", { accessCode: code });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Welcome!",
        description: "Dev login successful.",
      });
      setLocation("/trade-desk");
    },
    onError: (error: Error) => {
      toast({
        title: "Login failed",
        description: error.message || "Invalid access code",
        variant: "destructive",
      });
    },
  });

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
      rememberMe: false,
    },
  });

  const loginMutation = useMutation({
    mutationFn: async (data: LoginFormData) => {
      const response = await apiRequest("POST", "/api/auth/login", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Welcome back!",
        description: "You have been logged in successfully.",
      });
      setLocation("/trade-desk");
    },
    onError: (error: Error) => {
      toast({
        title: "Login failed",
        description: error.message || "Invalid email or password",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: LoginFormData) => {
    loginMutation.mutate(data);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#050b16] p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-cyan-400/5" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-500/10 via-transparent to-transparent" />
      
      <div className="relative w-full max-w-md overflow-hidden rounded-xl bg-[#0a1525]/90 border border-white/10 backdrop-blur-xl p-6">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-cyan-400/10" />
        <div className="relative z-10">
          <div className="space-y-2 mb-8">
            <div className="flex items-center gap-2 mb-6">
              <Link href="/">
                <Button variant="ghost" size="icon" className="hover-elevate" data-testid="button-back">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
            </div>
            <div className="flex justify-center mb-4">
              <div className="p-3 rounded-xl bg-gradient-to-br from-cyan-500/20 to-cyan-400/10 border border-cyan-500/20">
                <LogIn className="h-6 w-6 text-cyan-400" />
              </div>
            </div>
            <p className="text-xs font-medium uppercase tracking-wider text-cyan-400 text-center">
              Welcome Back
            </p>
            <h2 className="text-2xl font-bold text-center text-white">Sign in to your account</h2>
            <p className="text-center text-slate-400 text-sm">
              Enter your credentials to access your account
            </p>
          </div>
          
          <div className="space-y-4">
            {authError && (
              <Alert variant="destructive" className="mb-4" data-testid="alert-auth-error">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Access Denied</AlertTitle>
                <AlertDescription className="space-y-2">
                  <p>{authError}</p>
                  {authError.includes('invite') && (
                    <Link href="/">
                      <Button variant="outline" size="sm" className="mt-2" data-testid="button-join-waitlist">
                        Join Waitlist
                      </Button>
                    </Link>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <a href="/api/auth/google" className="w-full">
              <Button
                type="button"
                variant="glass-secondary"
                className="w-full"
                data-testid="button-google-login"
              >
                <SiGoogle className="mr-2 h-4 w-4" />
                Continue with Google
              </Button>
            </a>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <Separator className="w-full bg-slate-700" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-[#0a1525] px-2 text-slate-400">Or continue with email</span>
              </div>
            </div>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-300">Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="you@example.com"
                          className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500"
                          data-testid="input-email"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-300">Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showPassword ? "text" : "password"}
                            placeholder="Enter your password"
                            className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500"
                            data-testid="input-password"
                            {...field}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full px-3"
                            onClick={() => setShowPassword(!showPassword)}
                            data-testid="button-toggle-password"
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="rememberMe"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          className="border-slate-600 data-[state=checked]:bg-cyan-500 data-[state=checked]:border-cyan-500"
                          data-testid="checkbox-remember-me"
                        />
                      </FormControl>
                      <FormLabel className="text-sm text-slate-400 font-normal cursor-pointer">
                        Remember me for 30 days
                      </FormLabel>
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  variant="glass"
                  className="w-full"
                  disabled={loginMutation.isPending}
                  data-testid="button-login"
                >
                  {loginMutation.isPending ? (
                    "Logging in..."
                  ) : (
                    <>
                      <LogIn className="mr-2 h-4 w-4" />
                      Log in
                    </>
                  )}
                </Button>
              </form>
            </Form>
            
            <div className="flex flex-col gap-4 mt-6">
              <div className="text-sm text-muted-foreground text-center">
                Have an invite code?{" "}
                <Link href="/join-beta" className="text-cyan-400 hover:text-cyan-300 transition-colors font-medium" data-testid="link-join-beta">
                  Join Beta
                </Link>
              </div>
              
              <Separator className="my-2" />
              
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setShowDevLogin(!showDevLogin)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="button-show-dev-login"
                >
                  Quick Access (Admin)
                </button>
              </div>
              
              {showDevLogin && (
                <div className="space-y-2 p-3 rounded-lg bg-muted/30 border border-muted">
                  <Input
                    type="password"
                    placeholder="Enter access code"
                    value={accessCode}
                    onChange={(e) => setAccessCode(e.target.value)}
                    data-testid="input-access-code"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => devLoginMutation.mutate(accessCode)}
                    disabled={devLoginMutation.isPending || !accessCode}
                    data-testid="button-dev-login"
                  >
                    {devLoginMutation.isPending ? "Logging in..." : "Quick Login"}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
