import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { safeToFixed } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle, XCircle, MinusCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface ManualOutcomeRecorderProps {
  ideaId: string;
  symbol: string;
  entryPrice: number;
  direction: string;
}

export function ManualOutcomeRecorder({ 
  ideaId, 
  symbol, 
  entryPrice,
  direction 
}: ManualOutcomeRecorderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [outcome, setOutcome] = useState<'won' | 'lost' | 'breakeven'>('won');
  const [exitPrice, setExitPrice] = useState('');
  const [notes, setNotes] = useState('');
  const { toast } = useToast();

  const recordOutcomeMutation = useMutation({
    mutationFn: async (data: {
      outcomeStatus: string;
      exitPrice: number;
      percentGain: number;
      resolutionReason: string;
      exitDate: string;
      outcomeNotes: string;
      validatedAt: string;
      actualHoldingTimeMinutes: number;
    }) => {
      return apiRequest('PATCH', `/api/trade-ideas/${ideaId}/performance`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/trade-ideas'] });
      queryClient.invalidateQueries({ queryKey: ['/api/performance/stats'] });
      toast({
        title: "Outcome Recorded",
        description: `${symbol} marked as ${outcome}`,
      });
      setIsOpen(false);
      setExitPrice('');
      setNotes('');
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to record outcome",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    const exitPriceNum = parseFloat(exitPrice);
    if (isNaN(exitPriceNum) || exitPriceNum <= 0) {
      toast({
        title: "Invalid Exit Price",
        description: "Please enter a valid exit price",
        variant: "destructive",
      });
      return;
    }

    // Calculate percent gain
    let percentGain = 0;
    if (direction === 'long') {
      percentGain = ((exitPriceNum - entryPrice) / entryPrice) * 100;
    } else {
      percentGain = ((entryPrice - exitPriceNum) / entryPrice) * 100;
    }

    // Determine outcome status and resolution reason
    let outcomeStatus: string;
    let resolutionReason: string;
    
    if (outcome === 'won') {
      outcomeStatus = 'hit_target';
      resolutionReason = 'manual_user_won';
    } else if (outcome === 'lost') {
      outcomeStatus = 'hit_stop';
      resolutionReason = 'manual_user_lost';
    } else {
      outcomeStatus = 'manual_exit';
      resolutionReason = 'manual_user_breakeven';
    }

    const now = new Date().toISOString();
    recordOutcomeMutation.mutate({
      outcomeStatus,
      exitPrice: exitPriceNum,
      percentGain,
      resolutionReason,
      exitDate: now,
      outcomeNotes: notes,
      validatedAt: now,
      actualHoldingTimeMinutes: 0, // Backend will calculate from timestamp
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          data-testid={`button-record-outcome-${ideaId}`}
        >
          Record Outcome
        </Button>
      </DialogTrigger>
      <DialogContent data-testid={`dialog-record-outcome-${ideaId}`}>
        <DialogHeader>
          <DialogTitle>Record Research Outcome</DialogTitle>
          <DialogDescription>
            Mark this research brief as won, lost, or breakeven for {symbol}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="outcome">Outcome</Label>
            <Select value={outcome} onValueChange={(val) => setOutcome(val as any)}>
              <SelectTrigger id="outcome" data-testid="select-outcome">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="won" data-testid="option-outcome-won">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span>Won (Hit Target)</span>
                  </div>
                </SelectItem>
                <SelectItem value="lost" data-testid="option-outcome-lost">
                  <div className="flex items-center gap-2">
                    <XCircle className="w-4 h-4 text-red-500" />
                    <span>Lost (Hit Stop)</span>
                  </div>
                </SelectItem>
                <SelectItem value="breakeven" data-testid="option-outcome-breakeven">
                  <div className="flex items-center gap-2">
                    <MinusCircle className="w-4 h-4 text-amber-500" />
                    <span>Breakeven (Manual Exit)</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="exit-price">Exit Price</Label>
            <Input
              id="exit-price"
              type="number"
              step="0.01"
              placeholder={`Enter exit price (Entry: $${safeToFixed(entryPrice, 2)})`}
              value={exitPrice}
              onChange={(e) => setExitPrice(e.target.value)}
              data-testid="input-exit-price"
            />
            {exitPrice && !isNaN(parseFloat(exitPrice)) && (
              <p className="text-xs text-muted-foreground">
                Entry: ${safeToFixed(entryPrice, 2)} → Exit: ${safeToFixed(parseFloat(exitPrice), 2)}
                {' '}(
                  {direction === 'long'
                    ? safeToFixed((parseFloat(exitPrice) - entryPrice) / entryPrice * 100, 2)
                    : safeToFixed((entryPrice - parseFloat(exitPrice)) / entryPrice * 100, 2)
                  }%)
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Textarea
              id="notes"
              placeholder="Add any notes about this trade..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              data-testid="input-outcome-notes"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setIsOpen(false)}
            data-testid="button-cancel-outcome"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={recordOutcomeMutation.isPending || !exitPrice}
            data-testid="button-submit-outcome"
          >
            {recordOutcomeMutation.isPending ? "Recording..." : "Record Outcome"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
