import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  TrendingUp, TrendingDown, Calendar, FileText, Target,
  Clock, BarChart3, Plus, Activity, Zap, Eye, Ban
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { WatchlistHistoryRecord, SymbolNote, WatchlistItem } from '@shared/schema';

interface SymbolJourneyModalProps {
  symbol: string;
  watchlistItem?: WatchlistItem;
  year?: number;
  isOpen: boolean;
  onClose: () => void;
}

interface TimelineEvent {
  id: string;
  date: string;
  type: 'grade_change' | 'traded' | 'note_added' | 'catalyst' | 'price_alert' | 'added';
  title: string;
  description?: string;
  gradeFrom?: string;
  gradeTo?: string;
  scoreDelta?: number;
  pnl?: number;
}

const TIER_COLORS: Record<string, string> = {
  S: 'text-purple-400 bg-purple-500/20 border-purple-500/40',
  A: 'text-emerald-400 bg-emerald-500/20 border-emerald-500/40',
  B: 'text-cyan-400 bg-cyan-500/20 border-cyan-500/40',
  C: 'text-amber-400 bg-amber-500/20 border-amber-500/40',
  D: 'text-orange-400 bg-orange-500/20 border-orange-500/40',
  F: 'text-red-400 bg-red-500/20 border-red-500/40',
};

function getEventIcon(type: TimelineEvent['type']) {
  switch (type) {
    case 'grade_change': return Activity;
    case 'traded': return Target;
    case 'note_added': return FileText;
    case 'catalyst': return Zap;
    case 'price_alert': return TrendingUp;
    case 'added': return Plus;
    default: return Activity;
  }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function SymbolJourneyModal({
  symbol,
  watchlistItem,
  year = new Date().getFullYear(),
  isOpen,
  onClose
}: SymbolJourneyModalProps) {
  const [activeTab, setActiveTab] = useState<'timeline' | 'notes' | 'stats'>('timeline');
  const [newNote, setNewNote] = useState('');
  const { toast } = useToast();

  const { data: history, isLoading: historyLoading } = useQuery<WatchlistHistoryRecord[]>({
    queryKey: ['/api/watchlist-history', symbol, year],
    enabled: isOpen,
  });

  const { data: notes, isLoading: notesLoading } = useQuery<SymbolNote[]>({
    queryKey: ['/api/symbol-notes', symbol],
    enabled: isOpen,
  });

  const addNoteMutation = useMutation({
    mutationFn: async (content: string) => {
      return apiRequest('POST', '/api/symbol-notes', {
        symbol,
        content,
        noteType: 'user',
        watchlistId: watchlistItem?.id
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/symbol-notes', symbol] });
      setNewNote('');
      toast({ title: 'Note added', description: `Research note saved for ${symbol}` });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to add note', variant: 'destructive' });
    }
  });

  const timelineEvents: TimelineEvent[] = [];
  
  if (watchlistItem) {
    timelineEvents.push({
      id: 'added',
      date: watchlistItem.addedAt,
      type: 'added',
      title: 'Added to Watchlist',
      description: watchlistItem.addedReason || 'Symbol added for tracking',
      gradeTo: watchlistItem.initialTier || undefined,
    });
  }

  if (history) {
    let prevTier: string | null = null;
    let prevScore: number | null = null;
    
    for (const record of history) {
      if (prevTier && record.tier && prevTier !== record.tier) {
        timelineEvents.push({
          id: `grade-${record.id}`,
          date: record.snapshotDate,
          type: 'grade_change',
          title: `Grade ${prevTier} → ${record.tier}`,
          gradeFrom: prevTier,
          gradeTo: record.tier,
          scoreDelta: prevScore && record.gradeScore ? Math.round(record.gradeScore - prevScore) : undefined,
        });
      }
      
      if (record.hasTrade) {
        timelineEvents.push({
          id: `trade-${record.id}`,
          date: record.snapshotDate,
          type: 'traded',
          title: 'Trade Executed',
          description: `Price: $${record.price?.toFixed(2)}`,
        });
      }
      
      if (record.hasNote) {
        timelineEvents.push({
          id: `note-${record.id}`,
          date: record.snapshotDate,
          type: 'note_added',
          title: 'Research Note Added',
        });
      }
      
      prevTier = record.tier;
      prevScore = record.gradeScore;
    }
  }

  timelineEvents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const stats = {
    daysWatched: watchlistItem ? Math.ceil((Date.now() - new Date(watchlistItem.addedAt).getTime()) / (1000 * 60 * 60 * 24)) : 0,
    avgScore: history?.length ? Math.round(history.reduce((s, h) => s + (h.gradeScore || 0), 0) / history.length) : 0,
    currentScore: watchlistItem?.gradeScore || 0,
    initialScore: watchlistItem?.initialScore || 0,
    scoreImprovement: watchlistItem ? Math.round((watchlistItem.gradeScore || 0) - (watchlistItem.initialScore || 0)) : 0,
    timesTraded: watchlistItem?.timesTraded || 0,
    winRate: watchlistItem?.timesTraded && watchlistItem.timesTraded > 0 
      ? Math.round((watchlistItem.timesWon || 0) / watchlistItem.timesTraded * 100) 
      : 0,
    totalPnl: watchlistItem?.totalPnl || 0,
    notesCount: notes?.length || 0,
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden" data-testid="symbol-journey-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="text-2xl font-bold font-mono">{symbol}</span>
            {watchlistItem?.tier && (
              <Badge className={cn("text-sm font-bold", TIER_COLORS[watchlistItem.tier])}>
                {watchlistItem.tier}
              </Badge>
            )}
            <span className="text-xl font-mono text-muted-foreground">
              {watchlistItem?.gradeScore?.toFixed(0) || '—'}/100
            </span>
          </DialogTitle>
          <DialogDescription>
            {year} Research Journey • {stats.daysWatched} days tracked
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="timeline" data-testid="tab-timeline">
              <Activity className="h-4 w-4 mr-1" />
              Timeline
            </TabsTrigger>
            <TabsTrigger value="notes" data-testid="tab-notes">
              <FileText className="h-4 w-4 mr-1" />
              Notes ({stats.notesCount})
            </TabsTrigger>
            <TabsTrigger value="stats" data-testid="tab-stats">
              <BarChart3 className="h-4 w-4 mr-1" />
              Stats
            </TabsTrigger>
          </TabsList>

          <TabsContent value="timeline" className="mt-4">
            <ScrollArea className="h-[400px] pr-4">
              {historyLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex gap-4">
                      <Skeleton className="w-12 h-12 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : timelineEvents.length > 0 ? (
                <div className="relative">
                  <div className="absolute left-5 top-0 bottom-0 w-px bg-slate-700" />
                  <div className="space-y-6">
                    {timelineEvents.map((event) => {
                      const Icon = getEventIcon(event.type);
                      return (
                        <div key={event.id} className="flex gap-4 relative" data-testid={`event-${event.id}`}>
                          <div className={cn(
                            "w-10 h-10 rounded-full flex items-center justify-center z-10",
                            event.type === 'traded' ? 'bg-green-500/20 text-green-400' :
                            event.type === 'grade_change' ? 'bg-cyan-500/20 text-cyan-400' :
                            event.type === 'added' ? 'bg-purple-500/20 text-purple-400' :
                            'bg-slate-700 text-slate-400'
                          )}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="flex-1 pb-2">
                            <div className="flex items-center justify-between">
                              <h4 className="font-medium">{event.title}</h4>
                              <span className="text-xs text-muted-foreground">{formatDate(event.date)}</span>
                            </div>
                            {event.description && (
                              <p className="text-sm text-muted-foreground">{event.description}</p>
                            )}
                            {event.gradeFrom && event.gradeTo && (
                              <div className="flex items-center gap-2 mt-1">
                                <Badge className={cn("text-xs", TIER_COLORS[event.gradeFrom])}>{event.gradeFrom}</Badge>
                                <span className="text-xs text-muted-foreground">→</span>
                                <Badge className={cn("text-xs", TIER_COLORS[event.gradeTo])}>{event.gradeTo}</Badge>
                                {event.scoreDelta !== undefined && (
                                  <span className={cn(
                                    "text-xs font-mono",
                                    event.scoreDelta > 0 ? "text-green-400" : "text-red-400"
                                  )}>
                                    ({event.scoreDelta > 0 ? '+' : ''}{event.scoreDelta} pts)
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No timeline events yet</p>
                  <p className="text-xs mt-1">Grade changes, trades, and notes will appear here</p>
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="notes" className="mt-4">
            <div className="space-y-4">
              <div className="flex gap-2">
                <Textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder={`Add a research note for ${symbol}...`}
                  className="flex-1 min-h-[80px] resize-none"
                  data-testid="input-new-note"
                />
              </div>
              <Button 
                onClick={() => addNoteMutation.mutate(newNote)}
                disabled={!newNote.trim() || addNoteMutation.isPending}
                className="w-full"
                data-testid="btn-add-note"
              >
                <Plus className="h-4 w-4 mr-1" />
                {addNoteMutation.isPending ? 'Adding...' : 'Add Note'}
              </Button>

              <ScrollArea className="h-[280px] pr-4">
                {notesLoading ? (
                  <div className="space-y-3">
                    {[1, 2].map((i) => (
                      <Card key={i} className="bg-slate-800/50">
                        <CardContent className="p-3">
                          <Skeleton className="h-4 w-full mb-2" />
                          <Skeleton className="h-3 w-1/3" />
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : notes && notes.length > 0 ? (
                  <div className="space-y-3">
                    {notes.map((note) => (
                      <Card key={note.id} className="bg-slate-800/50 border-slate-700/50" data-testid={`note-${note.id}`}>
                        <CardContent className="p-3">
                          <p className="text-sm">{note.content}</p>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-xs text-muted-foreground">
                              {formatDate(note.createdAt?.toString() || new Date().toISOString())}
                            </span>
                            {note.noteType && (
                              <Badge variant="outline" className="text-xs">
                                {note.noteType === 'ai_generated' ? 'AI' : note.noteType}
                              </Badge>
                            )}
                          </div>
                          {note.tags && note.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {note.tags.map((tag, i) => (
                                <Badge key={i} variant="secondary" className="text-xs">{tag}</Badge>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-10 w-10 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No research notes yet</p>
                    <p className="text-xs mt-1">Add your first note above</p>
                  </div>
                )}
              </ScrollArea>
            </div>
          </TabsContent>

          <TabsContent value="stats" className="mt-4">
            <div className="grid grid-cols-2 gap-4">
              <Card className="bg-slate-800/50 border-slate-700/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="h-4 w-4 text-cyan-400" />
                    <span className="text-xs text-muted-foreground">Days Watched</span>
                  </div>
                  <p className="text-2xl font-bold font-mono">{stats.daysWatched}</p>
                </CardContent>
              </Card>

              <Card className="bg-slate-800/50 border-slate-700/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="h-4 w-4 text-purple-400" />
                    <span className="text-xs text-muted-foreground">Score Evolution</span>
                  </div>
                  <p className="text-2xl font-bold font-mono">
                    {stats.initialScore} → {Math.round(stats.currentScore)}
                    <span className={cn(
                      "text-sm ml-2",
                      stats.scoreImprovement > 0 ? "text-green-400" : 
                      stats.scoreImprovement < 0 ? "text-red-400" : "text-slate-400"
                    )}>
                      ({stats.scoreImprovement > 0 ? '+' : ''}{stats.scoreImprovement})
                    </span>
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-slate-800/50 border-slate-700/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Target className="h-4 w-4 text-green-400" />
                    <span className="text-xs text-muted-foreground">Times Traded</span>
                  </div>
                  <p className="text-2xl font-bold font-mono">{stats.timesTraded}x</p>
                  {stats.timesTraded > 0 && (
                    <p className="text-sm text-muted-foreground">
                      Win rate: <span className={cn(
                        "font-mono",
                        stats.winRate >= 50 ? "text-green-400" : "text-red-400"
                      )}>{stats.winRate}%</span>
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-slate-800/50 border-slate-700/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <BarChart3 className="h-4 w-4 text-amber-400" />
                    <span className="text-xs text-muted-foreground">Total P&L</span>
                  </div>
                  <p className={cn(
                    "text-2xl font-bold font-mono",
                    stats.totalPnl >= 0 ? "text-green-400" : "text-red-400"
                  )}>
                    {stats.totalPnl >= 0 ? '+' : ''}${Math.abs(stats.totalPnl).toLocaleString()}
                  </p>
                </CardContent>
              </Card>

              <Card className="col-span-2 bg-slate-800/50 border-slate-700/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <BarChart3 className="h-4 w-4 text-slate-400" />
                    <span className="text-xs text-muted-foreground">Average Score ({year})</span>
                  </div>
                  <p className="text-xl font-bold font-mono">{stats.avgScore}/100</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Based on {history?.length || 0} daily snapshots
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
