import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { attributionPayload } from "@/lib/attribution";
import { useToast } from "@/hooks/use-toast";
import { Check } from "lucide-react";
import { IntakeForm } from "@/components/onboarding/intake-form";
import type { IntakeProfile } from "@shared/intake";

interface WaitlistPopupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Turn an apiRequest error ("400: {...}") into a sentence for the form. */
export function waitlistErrorText(error: unknown): string {
  const raw = (error as Error)?.message ?? "";
  if (/answers are missing/i.test(raw)) return "Some answers are missing — check the earlier steps.";
  const m = raw.match(/"error"\s*:\s*"([^"]+)"/);
  return m?.[1] ?? (raw.replace(/^\d+:\s*/, "") || "Something went wrong — try again.");
}

/**
 * "Join the Lab" — the multi-step waitlist intake (components/onboarding/intake-form.tsx).
 * Everything posts once, at the end, to /api/waitlist/join with { email, profile }.
 */
export function WaitlistPopup({ open, onOpenChange }: WaitlistPopupProps) {
  const [done, setDone] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const { toast } = useToast();

  const submit = async (profile: IntakeProfile, email?: string) => {
    try {
      const res = await apiRequest("POST", "/api/waitlist/join", { email, source: "popup", profile, ...attributionPayload() });
      const data = await res.json();
      setDone(data.alreadyExists ? "You're already on the list — we'll be in touch." : "We'll email you when a spot opens.");
      toast({ title: data.alreadyExists ? "You're already on the list!" : "Welcome to the Lab!", description: data.message });
    } catch (error) {
      return waitlistErrorText(error);
    }
  };

  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => { setDone(null); setFormKey((k) => k + 1); }, 300);
      return () => clearTimeout(t);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Join the Lab</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Learn how trades are built, not copied. About a minute.
          </DialogDescription>
        </DialogHeader>
        {done ? (
          <div className="ob ob-done" data-testid="waitlist-success">
            <Check className="h-6 w-6 mx-auto" style={{ color: "var(--lx-accent, #3b8cff)" }} aria-hidden />
            <h3>You're on the list</h3>
            <p>{done}</p>
          </div>
        ) : (
          <IntakeForm key={formKey} mode="waitlist" onSubmit={submit} submitLabel="Join the waitlist" />
        )}
      </DialogContent>
    </Dialog>
  );
}
