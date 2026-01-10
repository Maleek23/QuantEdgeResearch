import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogFooter,
  DialogTrigger 
} from "@/components/ui/dialog";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue 
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  MessageSquare, Plus, Edit2, Trash2, Tag, Calendar, Lock, Unlock, Bot
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface SymbolNote {
  id: string;
  symbol: string;
  userId: string;
  content: string;
  noteType: 'user' | 'system' | 'ai_generated' | null;
  tags: string[] | null;
  isPrivate: boolean | null;
  linkedEventType: string | null;
  linkedEventId: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

interface NotesPanelProps {
  symbol: string;
  userId?: string;
  compact?: boolean;
}

function NoteCard({ note, onEdit, onDelete }: { 
  note: SymbolNote; 
  onEdit: (note: SymbolNote) => void;
  onDelete: (id: string) => void;
}) {
  const createdAt = note.createdAt ? new Date(note.createdAt) : null;
  
  const typeIcon = () => {
    switch (note.noteType) {
      case 'system': return <Bot className="h-3 w-3 text-cyan-400" />;
      case 'ai_generated': return <Bot className="h-3 w-3 text-purple-400" />;
      default: return <MessageSquare className="h-3 w-3 text-muted-foreground" />;
    }
  };

  return (
    <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700/50 hover-elevate">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {typeIcon()}
          {createdAt && (
            <span title={format(createdAt, 'PPpp')}>
              {formatDistanceToNow(createdAt, { addSuffix: true })}
            </span>
          )}
          {note.isPrivate ? (
            <Lock className="h-3 w-3 text-amber-400" />
          ) : (
            <Unlock className="h-3 w-3 text-green-400" />
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-6 w-6"
            onClick={() => onEdit(note)}
            data-testid={`button-edit-note-${note.id}`}
          >
            <Edit2 className="h-3 w-3" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-6 w-6 text-red-400 hover:text-red-300"
            onClick={() => onDelete(note.id)}
            data-testid={`button-delete-note-${note.id}`}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
      
      <p className="mt-2 text-sm whitespace-pre-wrap">{note.content}</p>
      
      {note.tags && note.tags.length > 0 && (
        <div className="flex items-center gap-1 mt-2 flex-wrap">
          <Tag className="h-3 w-3 text-muted-foreground" />
          {note.tags.map((tag, idx) => (
            <Badge key={idx} variant="outline" className="text-xs py-0">
              {tag}
            </Badge>
          ))}
        </div>
      )}
      
      {note.linkedEventType && (
        <div className="mt-2 text-xs text-cyan-400">
          Linked: {note.linkedEventType}
          {note.linkedEventId && ` #${note.linkedEventId.slice(0, 8)}`}
        </div>
      )}
    </div>
  );
}

export default function NotesPanel({ symbol, userId = 'default', compact = false }: NotesPanelProps) {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<SymbolNote | null>(null);
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [isPrivate, setIsPrivate] = useState(true);
  const [linkedEventType, setLinkedEventType] = useState<string>('');

  const { data: notes, isLoading } = useQuery<SymbolNote[]>({
    queryKey: ['/api/symbol-notes', symbol],
    enabled: !!symbol,
    staleTime: 30 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: async (data: { symbol: string; content: string; tags?: string[]; isPrivate?: boolean; linkedEventType?: string }) => {
      const response = await apiRequest('POST', '/api/symbol-notes', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/symbol-notes', symbol] });
      toast({ title: 'Note created', description: 'Your note has been saved.' });
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<SymbolNote> }) => {
      const response = await apiRequest('PATCH', `/api/symbol-notes/${id}`, updates);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/symbol-notes', symbol] });
      toast({ title: 'Note updated', description: 'Your changes have been saved.' });
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('DELETE', `/api/symbol-notes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/symbol-notes', symbol] });
      toast({ title: 'Note deleted' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const resetForm = () => {
    setContent('');
    setTags('');
    setIsPrivate(true);
    setLinkedEventType('');
    setEditingNote(null);
    setIsDialogOpen(false);
  };

  const handleEdit = (note: SymbolNote) => {
    setEditingNote(note);
    setContent(note.content);
    setTags(note.tags?.join(', ') || '');
    setIsPrivate(note.isPrivate ?? true);
    setLinkedEventType(note.linkedEventType || '');
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    const tagArray = tags.split(',').map(t => t.trim()).filter(Boolean);
    
    if (editingNote) {
      updateMutation.mutate({
        id: editingNote.id,
        updates: {
          content,
          tags: tagArray.length > 0 ? tagArray : null,
          isPrivate,
          linkedEventType: linkedEventType || null,
        },
      });
    } else {
      createMutation.mutate({
        symbol,
        content,
        tags: tagArray.length > 0 ? tagArray : undefined,
        isPrivate,
        linkedEventType: linkedEventType || undefined,
      });
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('Delete this note?')) {
      deleteMutation.mutate(id);
    }
  };

  if (isLoading) {
    return (
      <Card className="bg-slate-800/30 backdrop-blur-sm">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-800/30 backdrop-blur-sm" data-testid="notes-panel">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-purple-400" />
            Research Notes
            {notes && notes.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {notes.length}
              </Badge>
            )}
          </CardTitle>
          <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setIsDialogOpen(open); }}>
            <DialogTrigger asChild>
              <Button 
                variant="outline" 
                size="sm" 
                className="h-7 gap-1"
                data-testid="button-add-note"
              >
                <Plus className="h-3 w-3" />
                Add Note
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{editingNote ? 'Edit Note' : 'Add Note'} for {symbol}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="content">Note</Label>
                  <Textarea
                    id="content"
                    placeholder="Your research notes, observations, thesis..."
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className="min-h-[100px]"
                    data-testid="input-note-content"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tags">Tags (comma-separated)</Label>
                  <Input
                    id="tags"
                    placeholder="earnings, catalyst, breakout"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    data-testid="input-note-tags"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="linkedEvent">Link to Event</Label>
                  <Select value={linkedEventType} onValueChange={setLinkedEventType}>
                    <SelectTrigger data-testid="select-linked-event">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      <SelectItem value="trade">Trade</SelectItem>
                      <SelectItem value="earnings">Earnings</SelectItem>
                      <SelectItem value="catalyst">Catalyst</SelectItem>
                      <SelectItem value="alert">Alert</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="isPrivate"
                    checked={isPrivate}
                    onCheckedChange={setIsPrivate}
                    data-testid="switch-private"
                  />
                  <Label htmlFor="isPrivate" className="text-sm">
                    Private note (only visible to you)
                  </Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={resetForm} data-testid="button-cancel-note">
                  Cancel
                </Button>
                <Button 
                  onClick={handleSubmit} 
                  disabled={!content.trim() || createMutation.isPending || updateMutation.isPending}
                  data-testid="button-save-note"
                >
                  {createMutation.isPending || updateMutation.isPending ? 'Saving...' : 'Save Note'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {!notes || notes.length === 0 ? (
          <div className={cn(
            "flex flex-col items-center justify-center text-muted-foreground",
            compact ? "py-4" : "py-8"
          )}>
            <MessageSquare className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">No notes for {symbol}</p>
            <p className="text-xs mt-1">Add research notes to track your analysis</p>
          </div>
        ) : (
          <div className={cn("space-y-2", compact ? "max-h-48 overflow-y-auto" : "")}>
            {notes.map((note) => (
              <NoteCard 
                key={note.id} 
                note={note} 
                onEdit={handleEdit} 
                onDelete={handleDelete} 
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
