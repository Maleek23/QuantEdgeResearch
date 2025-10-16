import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Search, Loader2, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { SymbolActionDialog } from "@/components/symbol-action-dialog";
import type { MarketData } from "@shared/schema";

export function SymbolSearch() {
  const [search, setSearch] = useState("");
  const [searchResult, setSearchResult] = useState<MarketData | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();

  const searchMutation = useMutation({
    mutationFn: async (symbol: string) => {
      const response = await fetch(`/api/search-symbol/${symbol}`);
      if (!response.ok) {
        throw new Error("Symbol not found");
      }
      return response.json() as Promise<MarketData>;
    },
    onSuccess: (data) => {
      setSearchResult(data);
      setDialogOpen(true);
      queryClient.invalidateQueries({ queryKey: ['/api/market-data'] });
      toast({
        title: "Symbol Found",
        description: `${data.symbol} added to dashboard - ${data.assetType === 'crypto' ? 'Crypto' : 'Stock'}`,
      });
    },
    onError: () => {
      setSearchResult(null);
      setDialogOpen(false);
      toast({
        title: "Symbol Not Found",
        description: "Try another symbol. Stocks require Alpha Vantage API key. Crypto: BTC, ETH, SOL, DOGE, etc.",
        variant: "destructive",
      });
    },
  });

  const handleSearch = () => {
    if (!search.trim()) return;
    searchMutation.mutate(search.toUpperCase().trim());
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className="flex flex-col gap-3 w-full">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search any stock or crypto (e.g., AAPL, SOL, DOGE)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyPress={handleKeyPress}
            className="pl-10 pr-10"
            disabled={searchMutation.isPending}
            data-testid="input-symbol-search"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              data-testid="button-clear-search"
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Button
          onClick={handleSearch}
          disabled={!search.trim() || searchMutation.isPending}
          className="gap-2"
          data-testid="button-search-symbol"
        >
          {searchMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" />
              Add
            </>
          )}
        </Button>
      </div>
      
      <SymbolActionDialog 
        open={dialogOpen} 
        onOpenChange={setDialogOpen}
        marketData={searchResult}
      />
    </div>
  );
}
