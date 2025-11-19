import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Upload, Image as ImageIcon, TrendingUp, DollarSign, AlertTriangle, Brain, Loader2, ExternalLink, CheckCircle2, Sparkles } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

interface ChartAnalysisResult {
  patterns: string[];
  supportLevels: number[];
  resistanceLevels: number[];
  entryPoint: number;
  targetPrice: number;
  stopLoss: number;
  riskRewardRatio: number;
  sentiment: "bullish" | "bearish" | "neutral";
  analysis: string;
  confidence: number;
  timeframe: string;
}

export default function ChartAnalysis() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [symbol, setSymbol] = useState("");
  const [timeframe, setTimeframe] = useState("1D");
  const [additionalContext, setAdditionalContext] = useState("");
  const [analysisResult, setAnalysisResult] = useState<ChartAnalysisResult | null>(null);
  const [savedTradeIdeaId, setSavedTradeIdeaId] = useState<string | null>(null);
  const [isPromoted, setIsPromoted] = useState(false);
  const { toast } = useToast();

  // Mutation to save analysis as draft trade idea
  const saveDraftMutation = useMutation({
    mutationFn: async (data: { symbol: string; analysis: ChartAnalysisResult }) => {
      const response = await apiRequest('POST', '/api/trade-ideas/from-chart', {
        symbol: data.symbol,
        analysis: data.analysis,
        chartImageUrl: undefined, // Optional - not persisting images yet
      });
      return await response.json();
    },
    onSuccess: (data: any) => {
      setSavedTradeIdeaId(data.id);
      toast({
        title: "Saved as Draft",
        description: "Analysis saved as draft trade idea. You can view it in Trade Desk.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Save",
        description: error.message || "Could not save analysis as trade idea.",
        variant: "destructive",
      });
    },
  });

  // Mutation to promote draft to published
  const promoteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('PATCH', `/api/trade-ideas/${id}/promote`);
      return await response.json();
    },
    onSuccess: () => {
      setIsPromoted(true);
      toast({
        title: "Promoted to Published",
        description: "Trade idea is now published and visible in Trade Desk.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Promote",
        description: error.message || "Could not promote trade idea.",
        variant: "destructive",
      });
    },
  });

  const analysisMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const response = await fetch('/api/chart-analysis', {
        method: 'POST',
        body: data,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to analyze chart');
      }
      
      return await response.json() as ChartAnalysisResult;
    },
    onSuccess: (data) => {
      setAnalysisResult(data);
      toast({
        title: "Analysis Complete",
        description: "Your chart has been analyzed successfully.",
      });

      // Auto-save as draft trade idea if symbol is provided
      if (symbol) {
        saveDraftMutation.mutate({ symbol, analysis: data });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Analysis Failed",
        description: error.message || "Failed to analyze chart. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Invalid File",
          description: "Please select a valid image file.",
          variant: "destructive",
        });
        return;
      }

      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async () => {
    if (!selectedFile) {
      toast({
        title: "No File Selected",
        description: "Please upload a chart image to analyze.",
        variant: "destructive",
      });
      return;
    }

    if (!symbol) {
      toast({
        title: "Symbol Required",
        description: "Please enter a symbol to save the analysis as a trade idea.",
        variant: "destructive",
      });
      return;
    }

    const formData = new FormData();
    formData.append('chart', selectedFile);
    formData.append('symbol', symbol);
    formData.append('timeframe', timeframe);
    formData.append('context', additionalContext);

    analysisMutation.mutate(formData);
  };

  const resetForm = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setSymbol("");
    setTimeframe("1D");
    setAdditionalContext("");
    setAnalysisResult(null);
    setSavedTradeIdeaId(null);
  };

  const handlePromote = () => {
    if (savedTradeIdeaId) {
      promoteMutation.mutate(savedTradeIdeaId);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Chart Pattern Recognition</h1>
        <p className="text-muted-foreground">
          Upload any trading chart for AI-powered technical analysis with precise entry/exit points
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upload Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload Chart
            </CardTitle>
            <CardDescription>
              Upload a screenshot of your trading chart for analysis
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* File Upload */}
            <div className="space-y-2">
              <Label htmlFor="chart-upload">Chart Image</Label>
              <div className="border-2 border-dashed rounded-lg p-6 text-center hover-elevate active-elevate-2 transition-colors cursor-pointer">
                <Input
                  id="chart-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                  data-testid="input-chart-upload"
                />
                <label htmlFor="chart-upload" className="cursor-pointer">
                  {previewUrl ? (
                    <div className="space-y-2">
                      <img 
                        src={previewUrl} 
                        alt="Chart preview" 
                        className="max-h-64 mx-auto rounded-lg"
                      />
                      <p className="text-sm text-muted-foreground">Click to change image</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground" />
                      <div>
                        <p className="font-medium">Click to upload chart</p>
                        <p className="text-sm text-muted-foreground">PNG, JPG up to 10MB</p>
                      </div>
                    </div>
                  )}
                </label>
              </div>
            </div>

            {/* Symbol Input */}
            <div className="space-y-2">
              <Label htmlFor="symbol">Symbol <span className="text-destructive">*</span></Label>
              <Input
                id="symbol"
                placeholder="e.g., AAPL, BTC/USD"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                data-testid="input-symbol"
              />
              <p className="text-xs text-muted-foreground">Required to save analysis as trade idea</p>
            </div>

            {/* Timeframe Input */}
            <div className="space-y-2">
              <Label htmlFor="timeframe">Timeframe</Label>
              <Input
                id="timeframe"
                placeholder="e.g., 1D, 4H, 15m"
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
                data-testid="input-timeframe"
              />
            </div>

            {/* Additional Context */}
            <div className="space-y-2">
              <Label htmlFor="context">Additional Context (Optional)</Label>
              <Textarea
                id="context"
                placeholder="Any additional information about the chart, market conditions, or specific patterns you want analyzed..."
                value={additionalContext}
                onChange={(e) => setAdditionalContext(e.target.value)}
                rows={3}
                data-testid="input-context"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <Button
                onClick={handleSubmit}
                disabled={!selectedFile || analysisMutation.isPending || saveDraftMutation.isPending}
                className="flex-1"
                data-testid="button-analyze-chart"
              >
                {analysisMutation.isPending || saveDraftMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {analysisMutation.isPending ? "Analyzing..." : "Saving..."}
                  </>
                ) : (
                  <>
                    <Brain className="h-4 w-4 mr-2" />
                    Analyze Chart
                  </>
                )}
              </Button>
              {(selectedFile || analysisResult) && (
                <Button
                  variant="outline"
                  onClick={resetForm}
                  data-testid="button-reset-form"
                >
                  Reset
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Results Section */}
        <div className="space-y-4">
          {analysisResult ? (
            <>
              {/* Summary Card */}
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <CardTitle className="flex items-center gap-2 flex-wrap">
                        <span>Analysis Results</span>
                        <Badge variant={
                          analysisResult.sentiment === "bullish" ? "default" : 
                          analysisResult.sentiment === "bearish" ? "destructive" : 
                          "secondary"
                        }>
                          {analysisResult.sentiment.toUpperCase()}
                        </Badge>
                      </CardTitle>
                      <CardDescription>
                        {symbol && `${symbol} • `}{analysisResult.timeframe} • {analysisResult.confidence}% Confidence
                      </CardDescription>
                    </div>
                    {savedTradeIdeaId && (
                      <Badge variant={isPromoted ? "default" : "outline"} className="gap-1" data-testid="badge-saved-draft">
                        <CheckCircle2 className="h-3 w-3" />
                        {isPromoted ? "Published" : "Saved as Draft"}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Key Metrics */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Entry Point</p>
                      <p className="text-lg font-bold" data-testid="text-entry-point">
                        ${analysisResult.entryPoint.toFixed(2)}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Target</p>
                      <p className="text-lg font-bold text-green-500" data-testid="text-target-price">
                        ${analysisResult.targetPrice.toFixed(2)}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Stop Loss</p>
                      <p className="text-lg font-bold text-red-500" data-testid="text-stop-loss">
                        ${analysisResult.stopLoss.toFixed(2)}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">R:R Ratio</p>
                      <p className="text-lg font-bold" data-testid="text-risk-reward">
                        {analysisResult.riskRewardRatio.toFixed(2)}:1
                      </p>
                    </div>
                  </div>

                  {/* Analysis Text */}
                  <div className="space-y-2">
                    <Label>AI Analysis</Label>
                    <p className="text-sm leading-relaxed" data-testid="text-analysis">
                      {analysisResult.analysis}
                    </p>
                  </div>

                  {/* Action Buttons - Only show if saved */}
                  {savedTradeIdeaId && (
                    <div className="flex gap-2 pt-2">
                      <Button
                        asChild
                        variant="default"
                        className="flex-1"
                        data-testid="button-view-trade-desk"
                      >
                        <Link href="/trade-desk">
                          <ExternalLink className="h-4 w-4 mr-2" />
                          View in Trade Desk
                        </Link>
                      </Button>
                      <Button
                        onClick={handlePromote}
                        disabled={promoteMutation.isPending || isPromoted}
                        variant="outline"
                        className="flex-1"
                        data-testid="button-promote-published"
                      >
                        {promoteMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Promoting...
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4 mr-2" />
                            Promote to Published
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Detailed Breakdown */}
              <Accordion type="single" collapsible className="space-y-2">
                {/* Patterns Detected */}
                <AccordionItem value="patterns">
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      <span>Patterns Detected ({analysisResult.patterns.length})</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2 pt-2">
                      {analysisResult.patterns.map((pattern, index) => (
                        <Badge key={index} variant="outline" className="mr-2">
                          {pattern}
                        </Badge>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Support & Resistance */}
                <AccordionItem value="levels">
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      <span>Support & Resistance Levels</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="grid grid-cols-2 gap-4 pt-2">
                      <div>
                        <Label className="text-xs">Support Levels</Label>
                        <div className="space-y-1 mt-2">
                          {analysisResult.supportLevels.map((level, index) => (
                            <p key={index} className="text-sm text-green-500">
                              ${level.toFixed(2)}
                            </p>
                          ))}
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs">Resistance Levels</Label>
                        <div className="space-y-1 mt-2">
                          {analysisResult.resistanceLevels.map((level, index) => (
                            <p key={index} className="text-sm text-red-500">
                              ${level.toFixed(2)}
                            </p>
                          ))}
                        </div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              {/* Disclaimer */}
              <Card className="bg-amber-500/10 border-amber-500/20">
                <CardContent className="pt-6">
                  <div className="flex gap-3">
                    <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Educational Purpose Only</p>
                      <p className="text-xs text-muted-foreground">
                        This analysis is for educational and research purposes only. Not financial advice. 
                        Always conduct your own research and risk management before trading.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="border-dashed">
              <CardContent className="pt-6 text-center py-12">
                <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="font-medium">No Analysis Yet</p>
                <p className="text-sm text-muted-foreground">
                  Upload a chart to see AI-powered technical analysis
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* How It Works Section */}
      <Card>
        <CardHeader>
          <CardTitle>How Chart Analysis Works</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                1
              </div>
              <h3 className="font-semibold">Upload Chart</h3>
              <p className="text-sm text-muted-foreground">
                Upload any trading chart screenshot from your platform (TradingView, MetaTrader, etc.)
              </p>
            </div>
            <div className="space-y-2">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                2
              </div>
              <h3 className="font-semibold">AI Analysis</h3>
              <p className="text-sm text-muted-foreground">
                Our AI analyzes patterns, support/resistance, trend strength, and generates trade parameters
              </p>
            </div>
            <div className="space-y-2">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                3
              </div>
              <h3 className="font-semibold">Get Results</h3>
              <p className="text-sm text-muted-foreground">
                Receive precise entry points, targets, stop losses, and comprehensive technical analysis
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
