import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";
import { Link, useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { SEOHead } from "@/components/seo-head";
import { Check, Loader2 } from "lucide-react";
import { SiDiscord } from "react-icons/si";
import { useState } from "react";
import quantEdgeLabsLogoUrl from "@assets/q_1767502987714.png";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function Landing() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();

  const joinWaitlist = useMutation({
    mutationFn: async (email: string) => {
      const res = await apiRequest("POST", "/api/waitlist/join", { email, source: "landing" });
      return res.json();
    },
    onSuccess: (data) => {
      setSubmitted(true);
      toast({
        title: data.alreadyExists ? "You're already on the list!" : "Welcome to the Lab!",
        description: data.message,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Something went wrong",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) {
      joinWaitlist.mutate(email.trim());
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead pageKey="landing" />
      
      <header className="fixed top-0 left-0 right-0 z-50 bg-transparent backdrop-blur-sm" data-testid="navbar">
        <div className="container mx-auto px-6">
          <div className="flex items-center justify-between h-16 gap-4">
            <Link href="/" className="flex-shrink-0" data-testid="link-logo">
              <img src={quantEdgeLabsLogoUrl} alt="Quant Edge Labs" className="h-10 w-10 object-contain" />
            </Link>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              {isAuthenticated && (
                <Button onClick={() => setLocation('/home')} data-testid="button-dashboard">
                  Dashboard
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 pt-16">
        <div className="max-w-xl w-full text-center space-y-8">
          <img 
            src={quantEdgeLabsLogoUrl} 
            alt="Quant Edge Labs" 
            className="h-24 w-24 mx-auto object-contain"
            data-testid="img-logo"
          />
          
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight" data-testid="text-headline">
            Learn how trades are built, not copied.
          </h1>
          
          <ul className="space-y-3 text-left max-w-md mx-auto">
            <li className="flex items-start gap-3">
              <Check className="h-5 w-5 text-cyan-500 mt-0.5 flex-shrink-0" />
              <span className="text-muted-foreground">Trade ideas explained, not hyped</span>
            </li>
            <li className="flex items-start gap-3">
              <Check className="h-5 w-5 text-cyan-500 mt-0.5 flex-shrink-0" />
              <span className="text-muted-foreground">Beginner-first framework</span>
            </li>
            <li className="flex items-start gap-3">
              <Check className="h-5 w-5 text-cyan-500 mt-0.5 flex-shrink-0" />
              <span className="text-muted-foreground">Real-time examples, real risk</span>
            </li>
          </ul>

          {submitted ? (
            <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-6" data-testid="success-message">
              <Check className="h-8 w-8 text-cyan-500 mx-auto mb-3" />
              <p className="text-lg font-medium">You're on the list!</p>
              <p className="text-sm text-muted-foreground mt-1">We'll be in touch soon.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
              <Input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1"
                required
                data-testid="input-email"
              />
              <Button 
                type="submit" 
                className="bg-cyan-500 text-slate-950 hover:bg-cyan-400 font-semibold"
                disabled={joinWaitlist.isPending}
                data-testid="button-join-lab"
              >
                {joinWaitlist.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Join the Lab"
                )}
              </Button>
            </form>
          )}

          <div className="pt-4">
            <Button 
              variant="outline"
              onClick={() => window.open("https://discord.gg/your-invite-code", "_blank")}
              className="gap-2"
              data-testid="button-join-discord"
            >
              <SiDiscord className="h-5 w-5" />
              Join Discord
            </Button>
          </div>
        </div>
      </main>

      <footer className="py-6 text-center text-sm text-muted-foreground">
        <p>Quant Edge Labs &copy; {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}
