import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CardHeader, CardTitle } from "@/components/ui/card";
import { Bot, Send, Trash2, Sparkles, X, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

// Typing effect component for assistant messages
function TypingMessage({ content }: { content: string }) {
  const [displayedContent, setDisplayedContent] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (currentIndex < content.length) {
      const timeout = setTimeout(() => {
        setDisplayedContent(prev => prev + content[currentIndex]);
        setCurrentIndex(prev => prev + 1);
      }, 15); // 15ms per character for smooth typing
      return () => clearTimeout(timeout);
    }
  }, [currentIndex, content]);

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {displayedContent}
      </ReactMarkdown>
    </div>
  );
}

// Markdown message component with manual "Save as Research Brief" backup
function MarkdownMessage({ content, messageId, wasAutoSaved }: { content: string; messageId: string; wasAutoSaved?: boolean }) {
  const { toast } = useToast();
  const [showSaveButton, setShowSaveButton] = useState(false);

  // Detect if message contains research patterns (manual backup only if not auto-saved)
  useEffect(() => {
    if (wasAutoSaved) {
      setShowSaveButton(false); // Already saved automatically
      return;
    }
    
    // Must have explicit price targets with $ or specific price levels
    const hasPriceTarget = /(?:entry|target|stop)\s*(?:price)?:?\s*\$?\d+\.?\d*/i.test(content);
    
    // Must have trading action words in context of execution
    const hasTradeAction = /(?:buy at|sell at|enter at|entry.*\$|target.*\$|stop.*\$)/i.test(content);
    
    // Must have stock symbols in trading context (not just any uppercase word)
    const hasStockSymbol = /(?:^|\s)(?:NVDA|AAPL|TSLA|AMD|MSFT|GOOGL|AMZN|META|BTC|ETH|SOL|DOGE)\b/i.test(content);
    
    // Avoid educational/explanatory content
    const isEducational = /(?:what is|how does|explain|definition|example|for instance|illustration)/i.test(content);
    
    // Show button only if: has specific trade structure AND NOT educational AND NOT auto-saved
    setShowSaveButton((hasPriceTarget || hasTradeAction) && hasStockSymbol && !isEducational);
  }, [content, wasAutoSaved]);

  const saveAsTradeIdea = useMutation({
    mutationFn: async () => {
      // Parse the message content to extract trade ideas
      return await apiRequest('POST', '/api/ai/parse-chat-idea', { 
        messageId, 
        content 
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/trade-ideas'] });
      toast({
        title: "Success!",
        description: `Saved ${data.count || 1} research brief(s) from this message`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Could not parse research patterns from this message",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="space-y-2">
      <div className="prose prose-sm dark:prose-invert max-w-none
        prose-headings:font-semibold prose-headings:text-foreground
        prose-h1:text-lg prose-h2:text-base prose-h3:text-sm
        prose-p:text-sm prose-p:leading-relaxed prose-p:text-foreground
        prose-strong:text-foreground prose-strong:font-semibold
        prose-ul:text-sm prose-li:text-foreground
        prose-code:text-xs prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded
      ">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {content}
        </ReactMarkdown>
      </div>
      {showSaveButton && (
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={() => saveAsTradeIdea.mutate()}
          disabled={saveAsTradeIdea.isPending}
          data-testid={`button-save-idea-${messageId}`}
        >
          <TrendingUp className="h-3 w-3" />
          {saveAsTradeIdea.isPending ? "Saving..." : "Save as Research Brief"}
        </Button>
      )}
    </div>
  );
}

interface QuantAIBotProps {
  isOpen: boolean;
  onClose: () => void;
}

export function QuantAIBot({ isOpen, onClose }: QuantAIBotProps) {
  const [message, setMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [lastMessageId, setLastMessageId] = useState<string | null>(null);
  const [autoSavedMessageIds, setAutoSavedMessageIds] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const { data: chatHistory = [], refetch } = useQuery<ChatMessage[]>({
    queryKey: ['/api/ai/chat/history'],
    enabled: isOpen,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (userMessage: string) => {
      return await apiRequest('POST', '/api/ai/chat', { message: userMessage });
    },
    onSuccess: (data: any) => {
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ['/api/ai/chat/history'] });
      
      // Track the latest message to show typing effect
      if (data && chatHistory.length > 0) {
        setLastMessageId(chatHistory[chatHistory.length - 1]?.id);
      }
      
      // If trade ideas were auto-saved, notify user and refresh feed
      if (data.autoSavedIdeas && data.autoSavedIdeas > 0) {
        queryClient.invalidateQueries({ queryKey: ['/api/trade-ideas'] });
        // Track this message as auto-saved
        setAutoSavedMessageIds(prev => new Set(prev).add(data.messageId));
        toast({
          title: "Research Briefs Added!",
          description: `Automatically saved ${data.autoSavedIdeas} research brief(s) to your feed`,
        });
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    },
  });

  const clearHistoryMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('DELETE', '/api/ai/chat/history', {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ai/chat/history'] });
      toast({
        title: "Success",
        description: "Chat history cleared",
      });
    },
  });

  const handleSend = () => {
    if (message.trim()) {
      sendMessageMutation.mutate(message);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatHistory]);

  // Update last message ID when history changes
  useEffect(() => {
    if (chatHistory.length > 0) {
      const latestMsg = chatHistory[chatHistory.length - 1];
      if (latestMsg.role === 'assistant' && latestMsg.id !== lastMessageId) {
        setLastMessageId(latestMsg.id);
      }
    }
  }, [chatHistory]);

  if (!isOpen) return null;

  return (
    <div className="fixed right-0 top-0 h-screen w-full md:w-[600px] bg-background border-l border-border z-50 flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b bg-muted/30">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="flex items-center gap-2">
              QuantAI Bot
              <Badge variant="outline" className="text-xs">
                <Sparkles className="h-3 w-3 mr-1" />
                AI
              </Badge>
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Powered by GPT-5, Claude & Gemini
            </p>
          </div>
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => clearHistoryMutation.mutate()}
            disabled={clearHistoryMutation.isPending || chatHistory.length === 0}
            data-testid="button-clear-chat"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            data-testid="button-close-chat"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <ScrollArea className="flex-1 p-6" ref={scrollRef}>
        <div className="space-y-6">
          {chatHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <div className="p-4 rounded-full bg-primary/10 mb-4">
                <Bot className="h-12 w-12 text-primary" />
              </div>
              <h3 className="font-semibold text-xl mb-2">QuantAI Research Assistant</h3>
              <p className="text-sm text-muted-foreground max-w-md leading-relaxed mb-6">
                Get AI-powered market analysis, trading insights, and stock research. I can analyze symbols, identify patterns, and help you make informed decisions.
              </p>

              {/* Quick Action Prompts */}
              <div className="w-full max-w-md space-y-3">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Quick Actions</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "Analyze NVDA", prompt: "Give me a detailed technical analysis of NVDA including key support/resistance levels and trading outlook" },
                    { label: "Today's Market", prompt: "What's the current market sentiment and what sectors are showing strength today?" },
                    { label: "Options Flow", prompt: "Analyze unusual options activity and smart money flow in the market" },
                    { label: "Trade Ideas", prompt: "Suggest 3 swing trade ideas with entry, target, and stop loss levels" },
                  ].map((action) => (
                    <Button
                      key={action.label}
                      variant="outline"
                      size="sm"
                      className="justify-start text-left h-auto py-2 px-3 border-border/50 hover:bg-muted/50 hover:border-primary/30"
                      onClick={() => {
                        setMessage(action.prompt);
                      }}
                    >
                      <Sparkles className="h-3 w-3 mr-2 text-primary shrink-0" />
                      <span className="text-xs">{action.label}</span>
                    </Button>
                  ))}
                </div>

                <div className="pt-4 border-t border-border/30">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-2">Popular Symbols</p>
                  <div className="flex flex-wrap gap-1.5 justify-center">
                    {["AAPL", "TSLA", "MSFT", "GOOGL", "AMD", "META", "SPY", "QQQ"].map((symbol) => (
                      <Badge
                        key={symbol}
                        variant="outline"
                        className="cursor-pointer hover:bg-primary/10 hover:border-primary/30 transition-colors text-xs"
                        onClick={() => setMessage(`Analyze ${symbol} - give me the technical setup, key levels, and your trading recommendation`)}
                      >
                        {symbol}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            chatHistory.map((msg, index) => {
              const isLatestAssistant = msg.role === 'assistant' && msg.id === lastMessageId;
              const isJustReceived = isLatestAssistant && index === chatHistory.length - 1;
              
              return (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/50 border border-border/50'
                    }`}
                  >
                    {msg.role === 'assistant' && (
                      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border/30">
                        <div className="p-1 rounded bg-primary/10">
                          <Bot className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <span className="text-xs font-medium text-foreground">QuantAI</span>
                      </div>
                    )}
                    {/* Show typing effect for the latest assistant message */}
                    {isJustReceived ? (
                      <TypingMessage content={msg.content} />
                    ) : msg.role === 'assistant' ? (
                      <MarkdownMessage 
                        content={msg.content} 
                        messageId={msg.id}
                        wasAutoSaved={autoSavedMessageIds.has(msg.id)}
                      />
                    ) : (
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    )}
                    <span className="text-xs opacity-60 mt-2 block">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              );
            })
          )}
          {sendMessageMutation.isPending && (
            <div className="flex justify-start">
              <div className="bg-muted/50 border border-border/50 rounded-2xl px-4 py-3 max-w-[85%]">
                <div className="flex items-center gap-2">
                  <Bot className="h-3.5 w-3.5 animate-pulse text-primary" />
                  <span className="text-xs font-medium">QuantAI is thinking...</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="border-t bg-muted/30 p-4">
        <div className="flex gap-2">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask about markets, strategies, indicators..."
            disabled={sendMessageMutation.isPending}
            className="bg-background"
            data-testid="input-chat-message"
          />
          <Button
            onClick={handleSend}
            disabled={!message.trim() || sendMessageMutation.isPending}
            size="icon"
            data-testid="button-send-message"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-3 text-center">
          Educational purposes only • Not financial advice
        </p>
      </div>
    </div>
  );
}
