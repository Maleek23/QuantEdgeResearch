import { useAuth } from "@/hooks/useAuth";
import { Redirect, useLocation } from "wouter";
import { Loader2, Lock, Mail } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireBetaAccess?: boolean;
}

export function ProtectedRoute({ children, requireBetaAccess = true }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [inviteCode, setInviteCode] = useState("");
  const [isRedeeming, setIsRedeeming] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-400" data-testid="loading-spinner" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  const hasBetaAccess = user.hasBetaAccess || user.subscriptionTier === 'admin' || user.subscriptionTier === 'pro';

  if (requireBetaAccess && !hasBetaAccess) {
    const handleRedeemInvite = async () => {
      if (!inviteCode.trim()) {
        toast({
          title: "Enter invite code",
          description: "Please enter your beta invite code",
          variant: "destructive",
        });
        return;
      }

      setIsRedeeming(true);
      try {
        const response = await apiRequest("POST", "/api/beta/redeem", { 
          token: inviteCode.trim().toUpperCase() 
        });
        
        if (response.ok) {
          toast({
            title: "Welcome to the Beta!",
            description: "Your invite code has been redeemed. Enjoy the platform!",
          });
          queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
          window.location.reload();
        } else {
          const data = await response.json();
          toast({
            title: "Invalid Code",
            description: data.error || "This invite code is invalid or expired",
            variant: "destructive",
          });
        }
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to redeem invite code. Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsRedeeming(false);
      }
    };

    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-slate-950 to-slate-900">
        <Card className="w-full max-w-md glass-card border-amber-500/20" data-testid="card-beta-access">
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mb-2">
              <Lock className="h-8 w-8 text-amber-400" />
            </div>
            <CardTitle className="text-xl font-bold">Beta Access Required</CardTitle>
            <CardDescription>
              Quant Edge Labs is currently in private beta. Enter your invite code to access the platform.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Input
                placeholder="Enter invite code (e.g., BETA-XXXX)"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                className="text-center font-mono text-lg tracking-wider"
                data-testid="input-invite-code"
              />
              <Button 
                onClick={handleRedeemInvite} 
                disabled={isRedeeming}
                className="w-full"
                data-testid="button-redeem-invite"
              >
                {isRedeeming ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Redeem Invite Code"
                )}
              </Button>
            </div>
            
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-slate-700" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-slate-900 px-2 text-muted-foreground">Or</span>
              </div>
            </div>
            
            <div className="text-center space-y-3">
              <p className="text-sm text-muted-foreground">
                Don't have an invite code?
              </p>
              <Button 
                variant="outline" 
                onClick={() => setLocation("/pricing")}
                className="w-full"
                data-testid="button-join-waitlist"
              >
                <Mail className="mr-2 h-4 w-4" />
                Join the Waitlist
              </Button>
            </div>
            
            <p className="text-xs text-center text-muted-foreground mt-4">
              Logged in as: {user.email}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
