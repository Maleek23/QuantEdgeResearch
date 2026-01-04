import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Check, Loader2, X } from "lucide-react";
import { SiDiscord } from "react-icons/si";

interface WaitlistPopupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  discordInviteUrl?: string;
}

export function WaitlistPopup({ open, onOpenChange, discordInviteUrl = "https://discord.gg/3QF8QEKkYq" }: WaitlistPopupProps) {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const { toast } = useToast();

  const joinWaitlist = useMutation({
    mutationFn: async (email: string) => {
      const res = await apiRequest("POST", "/api/waitlist/join", { email, source: "popup" });
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

  const handleDiscordClick = () => {
    window.open(discordInviteUrl, "_blank");
  };

  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setEmail("");
        setSubmitted(false);
      }, 300);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Join the Lab</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Learn how trades are built, not copied.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <Check className="h-4 w-4 text-cyan-500 mt-0.5 flex-shrink-0" />
              <span className="text-muted-foreground">Trade ideas explained, not hyped</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="h-4 w-4 text-cyan-500 mt-0.5 flex-shrink-0" />
              <span className="text-muted-foreground">Beginner-first framework</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="h-4 w-4 text-cyan-500 mt-0.5 flex-shrink-0" />
              <span className="text-muted-foreground">Real-time examples, real risk</span>
            </li>
          </ul>

          {submitted ? (
            <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-4 text-center" data-testid="waitlist-success">
              <Check className="h-6 w-6 text-cyan-500 mx-auto mb-2" />
              <p className="font-medium">You're on the list!</p>
              <p className="text-sm text-muted-foreground mt-1">We'll be in touch soon.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <Input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                data-testid="input-waitlist-email"
              />
              <Button 
                type="submit" 
                className="w-full bg-cyan-500 text-slate-950 hover:bg-cyan-400 font-semibold"
                disabled={joinWaitlist.isPending}
                data-testid="button-join-waitlist"
              >
                {joinWaitlist.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Join the Waitlist"
                )}
              </Button>
            </form>
          )}

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">or</span>
            </div>
          </div>

          <Button 
            variant="outline"
            onClick={handleDiscordClick}
            className="w-full gap-2"
            data-testid="button-discord-popup"
          >
            <SiDiscord className="h-5 w-5" />
            Join our Discord Community
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
