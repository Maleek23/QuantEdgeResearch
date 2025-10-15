import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Search, Loader2, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import type { MarketData } from "@shared/schema";

export function SymbolSearch() {
  const [search, setSearch] = useState("");
  const [searchResult, setSearchResult] = useState<MarketData | null>(null);
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
      queryClient.invalidateQueries({ queryKey: ['/api/market-data'] });
      toast({
        title: "Symbol Found",
        description: `${data.symbol} added to dashboard - ${data.assetType === 'crypto' ? 'Crypto' : 'Stock'}`,
      });
    },
    onError: () => {
      setSearchResult(null);
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
            className="pl-10"
            disabled={searchMutation.isPending}
            data-testid="input-symbol-search"
          />
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
      
      {searchResult && (
        <Card className="border-primary/20" data-testid="card-search-result">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-lg" data-testid="text-result-symbol">
                      {searchResult.symbol}
                    </span>
                    <Badge variant="outline" data-testid="badge-result-type">
                      {searchResult.assetType}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">Added to your dashboard</p>
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-2xl font-bold" data-testid="text-result-price">
                  ${searchResult.currentPrice.toLocaleString(undefined, { 
                    minimumFractionDigits: 2,
                    maximumFractionDigits: searchResult.currentPrice >= 100 ? 2 : 4
                  })}
                </div>
                <div className={`text-sm font-medium ${searchResult.changePercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {searchResult.changePercent >= 0 ? '+' : ''}{searchResult.changePercent.toFixed(2)}%
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
