import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Send, Loader2, ChevronDown, ChevronUp, AlertTriangle, Sparkles } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";

interface ResearchResponse {
  response: string;
  disclaimer: string;
  timestamp: string;
}

interface AIResearchPanelProps {
  symbol?: string;
  tradeIdeaId?: number;
  defaultOpen?: boolean;
  className?: string;
}

export function AIResearchPanel({ symbol, tradeIdeaId, defaultOpen = false, className }: AIResearchPanelProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [question, setQuestion] = useState("");
  const [response, setResponse] = useState<ResearchResponse | null>(null);

  const researchMutation = useMutation({
    mutationFn: async (questionText: string) => {
      const res = await apiRequest("POST", "/api/ai/research-assistant", {
        question: questionText,
        context: {
          symbol: symbol || undefined,
          tradeIdeaId: tradeIdeaId || undefined,
        },
      });
      return res.json() as Promise<ResearchResponse>;
    },
    onSuccess: (data) => {
      setResponse(data);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (question.trim() && !researchMutation.isPending) {
      researchMutation.mutate(question.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className={className}>
      <Card className="glass-card overflow-visible">
        <CollapsibleTrigger asChild>
          <CardHeader 
            className="cursor-pointer hover-elevate py-3 px-4"
            data-testid="button-research-panel-toggle"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-cyan-400" />
                <CardTitle className="text-sm font-medium">AI Research Assistant</CardTitle>
                <Sparkles className="h-3 w-3 text-cyan-400/60" />
              </div>
              {isOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 pb-4 px-4 space-y-4">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <Input
                placeholder="Ask about trading concepts, market analysis, or research questions..."
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={researchMutation.isPending}
                className="flex-1"
                data-testid="input-research-question"
              />
              <Button
                type="submit"
                size="icon"
                disabled={!question.trim() || researchMutation.isPending}
                data-testid="button-research-submit"
              >
                {researchMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </form>

            {researchMutation.isPending && (
              <div 
                className="flex items-center gap-2 text-sm text-muted-foreground"
                data-testid="status-research-loading"
              >
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Researching your question...</span>
              </div>
            )}

            {researchMutation.isError && (
              <Alert variant="destructive" data-testid="alert-research-error">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {(researchMutation.error as Error)?.message || "Failed to get research response. Please try again."}
                </AlertDescription>
              </Alert>
            )}

            {response && !researchMutation.isPending && (
              <div className="space-y-3" data-testid="container-research-response">
                <ScrollArea className="max-h-[400px]">
                  <div className="prose prose-sm prose-invert max-w-none">
                    <ReactMarkdown
                      components={{
                        p: ({ children }) => <p className="mb-2 text-sm leading-relaxed">{children}</p>,
                        ul: ({ children }) => <ul className="mb-2 ml-4 list-disc space-y-1">{children}</ul>,
                        ol: ({ children }) => <ol className="mb-2 ml-4 list-decimal space-y-1">{children}</ol>,
                        li: ({ children }) => <li className="text-sm">{children}</li>,
                        strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                        h1: ({ children }) => <h3 className="text-base font-semibold mb-2 mt-3">{children}</h3>,
                        h2: ({ children }) => <h4 className="text-sm font-semibold mb-2 mt-3">{children}</h4>,
                        h3: ({ children }) => <h5 className="text-sm font-medium mb-1 mt-2">{children}</h5>,
                        code: ({ children }) => (
                          <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">{children}</code>
                        ),
                        blockquote: ({ children }) => (
                          <blockquote className="border-l-2 border-cyan-500/50 pl-3 italic text-muted-foreground">
                            {children}
                          </blockquote>
                        ),
                      }}
                    >
                      {response.response}
                    </ReactMarkdown>
                  </div>
                </ScrollArea>

                <Alert className="bg-amber-500/10 border-amber-500/30" data-testid="alert-research-disclaimer">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <AlertDescription className="text-xs text-amber-200/80">
                    {response.disclaimer}
                  </AlertDescription>
                </Alert>

                <p className="text-xs text-muted-foreground text-right">
                  Response generated at {new Date(response.timestamp).toLocaleTimeString()}
                </p>
              </div>
            )}

            {!response && !researchMutation.isPending && !researchMutation.isError && (
              <div className="text-center py-4 text-sm text-muted-foreground" data-testid="text-research-placeholder">
                <Bot className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Ask me about trading concepts, market analysis, or research questions.</p>
                <p className="text-xs mt-1 text-muted-foreground/70">
                  This is an educational tool, not financial advice.
                </p>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
