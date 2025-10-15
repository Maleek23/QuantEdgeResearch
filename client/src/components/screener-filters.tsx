import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import type { ScreenerFilters } from "@shared/schema";
import { Filter, X } from "lucide-react";

interface ScreenerFiltersProps {
  onFilterChange: (filters: ScreenerFilters) => void;
}

export function ScreenerFilters({ onFilterChange }: ScreenerFiltersProps) {
  const [filters, setFilters] = useState<ScreenerFilters>({});
  const [assetTypes, setAssetTypes] = useState<string[]>([]);

  const updateFilters = (updates: Partial<ScreenerFilters>) => {
    const newFilters = { ...filters, ...updates };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const toggleAssetType = (type: string) => {
    const newTypes = assetTypes.includes(type)
      ? assetTypes.filter((t) => t !== type)
      : [...assetTypes, type];
    setAssetTypes(newTypes);
    updateFilters({ assetType: newTypes as any });
  };

  const clearFilters = () => {
    setFilters({});
    setAssetTypes([]);
    onFilterChange({});
  };

  const activeFilterCount = Object.keys(filters).filter(
    (key) => filters[key as keyof ScreenerFilters] !== undefined
  ).length;

  return (
    <Card data-testid="card-screener-filters">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            <CardTitle>Market Screener</CardTitle>
            {activeFilterCount > 0 && (
              <Badge variant="default" className="ml-2" data-testid="badge-filter-count">
                {activeFilterCount}
              </Badge>
            )}
          </div>
          {activeFilterCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="gap-1"
              data-testid="button-clear-filters"
            >
              <X className="h-3 w-3" />
              Clear
            </Button>
          )}
        </div>
        <CardDescription>
          Filter opportunities by asset type, price, volume, and other criteria
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <Label>Asset Type</Label>
          <div className="flex flex-wrap gap-2">
            {['stock', 'option', 'crypto'].map((type) => (
              <div key={type} className="flex items-center space-x-2">
                <Checkbox
                  id={`asset-${type}`}
                  checked={assetTypes.includes(type)}
                  onCheckedChange={() => toggleAssetType(type)}
                  data-testid={`checkbox-asset-${type}`}
                />
                <label
                  htmlFor={`asset-${type}`}
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </label>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="min-price">Min Price</Label>
            <Input
              id="min-price"
              type="number"
              step="0.01"
              placeholder="0.00"
              className="font-mono"
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                updateFilters({
                  priceRange: { ...filters.priceRange, min: val || undefined },
                });
              }}
              data-testid="input-min-price"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="max-price">Max Price</Label>
            <Input
              id="max-price"
              type="number"
              step="0.01"
              placeholder="1000.00"
              className="font-mono"
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                updateFilters({
                  priceRange: { ...filters.priceRange, max: val || undefined },
                });
              }}
              data-testid="input-max-price"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="min-volume">Minimum Volume</Label>
          <Input
            id="min-volume"
            type="number"
            placeholder="1000000"
            className="font-mono"
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              updateFilters({ volumeThreshold: val || undefined });
            }}
            data-testid="input-min-volume"
          />
        </div>

        <div className="space-y-3">
          <Label>Special Filters</Label>
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="penny-stocks"
                checked={filters.pennyStocksOnly || false}
                onCheckedChange={(checked) =>
                  updateFilters({ pennyStocksOnly: checked as boolean })
                }
                data-testid="checkbox-penny-stocks"
              />
              <label
                htmlFor="penny-stocks"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Penny Stocks Only (&lt;$5)
              </label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="high-iv"
                checked={filters.highIVOnly || false}
                onCheckedChange={(checked) =>
                  updateFilters({ highIVOnly: checked as boolean })
                }
                data-testid="checkbox-high-iv"
              />
              <label
                htmlFor="high-iv"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                High IV Options (&gt;50%)
              </label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="unusual-volume"
                checked={filters.unusualVolume || false}
                onCheckedChange={(checked) =>
                  updateFilters({ unusualVolume: checked as boolean })
                }
                data-testid="checkbox-unusual-volume"
              />
              <label
                htmlFor="unusual-volume"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Unusual Volume (&gt;2x avg)
              </label>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}