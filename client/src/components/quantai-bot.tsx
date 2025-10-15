import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bot, Send, Trash2, Sparkles, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface QuantAIBotProps {
  isOpen: boolean;
  onClose: () => void;
}

export function QuantAIBot({ isOpen, onClose }: QuantAIBotProps) {
  const [message, setMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const { data: chatHistory = [], refetch } = useQuery<ChatMessage[]>({
    queryKey: ['/api/ai/chat/history'],
    enabled: isOpen,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (userMessage: string) => {
      return await apiRequest('POST', '/api/ai/chat', { message: userMessage });
    },
    onSuccess: () => {
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ['/api/ai/chat/history'] });
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

  if (!isOpen) return null;

  return (
    <div className="fixed right-0 top-0 h-screen w-full md:w-[500px] bg-background border-l border-border z-50 flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b">
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

      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4">
          {chatHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[400px] text-center">
              <Bot className="h-16 w-16 text-muted-foreground opacity-20 mb-4" />
              <h3 className="font-semibold text-lg mb-2">Welcome to QuantAI Bot</h3>
              <p className="text-sm text-muted-foreground max-w-xs">
                Ask me about market analysis, trading strategies, or technical indicators. I'm here to help!
              </p>
            </div>
          ) : (
            chatHistory.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  {msg.role === 'assistant' && (
                    <div className="flex items-center gap-2 mb-1">
                      <Bot className="h-3 w-3" />
                      <span className="text-xs font-medium">QuantAI</span>
                    </div>
                  )}
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  <span className="text-xs opacity-70 mt-1 block">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))
          )}
          {sendMessageMutation.isPending && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg p-3 max-w-[80%]">
                <div className="flex items-center gap-2">
                  <Bot className="h-3 w-3 animate-pulse" />
                  <span className="text-xs font-medium">QuantAI is thinking...</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="border-t p-4">
        <div className="flex gap-2">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask about markets, strategies, indicators..."
            disabled={sendMessageMutation.isPending}
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
        <p className="text-xs text-muted-foreground mt-2 text-center">
          Educational purposes only • Not financial advice
        </p>
      </div>
    </div>
  );
}
