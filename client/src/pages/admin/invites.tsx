import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AdminLayout } from "@/components/admin/admin-layout";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import {
  Mail,
  Plus,
  Copy,
  Link2,
  CheckCircle2,
  Clock,
  XCircle,
  Send,
  Trash2,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

function getCSRFToken(): string | null {
  const match = document.cookie.match(/csrf_token=([^;]+)/);
  return match ? match[1] : null;
}

interface Invite {
  id: string;
  email: string;
  token: string;
  status: 'pending' | 'sent' | 'redeemed' | 'expired' | 'revoked';
  tierOverride?: string;
  notes?: string;
  sentAt?: string;
  redeemedAt?: string;
  expiresAt: string;
  createdAt: string;
}

function AdminInvitesContent() {
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newTier, setNewTier] = useState<string>("free");
  const [newNotes, setNewNotes] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: invitesData, isLoading, refetch } = useQuery<{ invites: Invite[] }>({
    queryKey: ['/api/admin/invites'],
    queryFn: async () => {
      const res = await fetch('/api/admin/invites', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch invites');
      return res.json();
    }
  });

  const createInviteMutation = useMutation({
    mutationFn: async ({ email, tier, notes }: { email: string; tier: string; notes: string }) => {
      const csrfToken = getCSRFToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (csrfToken) headers['x-csrf-token'] = csrfToken;
      const res = await fetch('/api/admin/invites', {
        method: 'POST',
        headers,
        body: JSON.stringify({ email, tierOverride: tier, notes }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to create invite');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/invites'] });
      toast({ title: "Invite created successfully" });
      setShowCreateDialog(false);
      setNewEmail("");
      setNewTier("free");
      setNewNotes("");
    },
    onError: () => {
      toast({ title: "Failed to create invite", variant: "destructive" });
    }
  });

  const sendInviteMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      const csrfToken = getCSRFToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (csrfToken) headers['x-csrf-token'] = csrfToken;
      const res = await fetch(`/api/admin/invites/${inviteId}/send`, {
        method: 'POST',
        headers,
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to send invite');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/invites'] });
      toast({ title: "Invite email sent" });
    },
    onError: () => {
      toast({ title: "Failed to send invite email", variant: "destructive" });
    }
  });

  const resendInviteMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      const csrfToken = getCSRFToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (csrfToken) headers['x-csrf-token'] = csrfToken;
      const res = await fetch(`/api/admin/invites/${inviteId}/resend`, {
        method: 'POST',
        headers,
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to resend invite');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/invites'] });
      toast({ title: "Invite email resent successfully" });
    },
    onError: () => {
      toast({ title: "Failed to resend invite email", variant: "destructive" });
    }
  });

  const revokeInviteMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      const csrfToken = getCSRFToken();
      const headers: Record<string, string> = {};
      if (csrfToken) headers['x-csrf-token'] = csrfToken;
      const res = await fetch(`/api/admin/invites/${inviteId}`, {
        method: 'DELETE',
        headers,
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to revoke invite');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/invites'] });
      toast({ title: "Invite revoked" });
    },
    onError: () => {
      toast({ title: "Failed to revoke invite", variant: "destructive" });
    }
  });

  const invites = invitesData?.invites || [];

  const getStatusBadge = (status: string) => {
    const styles = {
      pending: "bg-amber-500/10 text-amber-400 border-amber-500/20",
      sent: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
      redeemed: "bg-green-500/10 text-green-400 border-green-500/20",
      expired: "bg-slate-500/10 text-slate-400 border-slate-500/20",
      revoked: "bg-red-500/10 text-red-400 border-red-500/20",
    };
    const icons = {
      pending: <Clock className="h-3 w-3" />,
      sent: <Send className="h-3 w-3" />,
      redeemed: <CheckCircle2 className="h-3 w-3" />,
      expired: <Clock className="h-3 w-3" />,
      revoked: <XCircle className="h-3 w-3" />,
    };
    return (
      <Badge variant="outline" className={cn("flex items-center gap-1", styles[status as keyof typeof styles] || styles.pending)}>
        {icons[status as keyof typeof icons] || icons.pending}
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const copyInviteLink = (token: string, id: string) => {
    const link = `${window.location.origin}/join-beta?invite=${token}`;
    navigator.clipboard.writeText(link);
    setCopiedId(id);
    toast({ title: "Invite link copied to clipboard" });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const pendingCount = invites.filter(i => i.status === 'pending').length;
  const sentCount = invites.filter(i => i.status === 'sent').length;
  const redeemedCount = invites.filter(i => i.status === 'redeemed').length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Pending</p>
                <p className="text-2xl font-bold text-amber-400">{pendingCount}</p>
              </div>
              <Clock className="h-8 w-8 text-amber-400/20" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Sent</p>
                <p className="text-2xl font-bold text-cyan-400">{sentCount}</p>
              </div>
              <Send className="h-8 w-8 text-cyan-400/20" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Redeemed</p>
                <p className="text-2xl font-bold text-green-400">{redeemedCount}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-400/20" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-white flex items-center gap-2">
                <Mail className="h-5 w-5 text-cyan-400" />
                Beta Invites
              </CardTitle>
              <CardDescription className="text-slate-500">
                Manage invite codes and track redemptions
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                className="border-slate-700 text-slate-300"
                data-testid="button-refresh-invites"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogTrigger asChild>
                  <Button size="sm" className="bg-cyan-600 hover:bg-cyan-700" data-testid="button-create-invite">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Invite
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-slate-900 border-slate-700">
                  <DialogHeader>
                    <DialogTitle className="text-white">Create New Invite</DialogTitle>
                    <DialogDescription className="text-slate-400">
                      Generate a new invite code for beta access
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <label className="text-sm text-slate-400">Email Address</label>
                      <Input
                        placeholder="user@example.com"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        className="bg-slate-800 border-slate-700 text-white"
                        data-testid="input-invite-email"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm text-slate-400">Subscription Tier</label>
                      <Select value={newTier} onValueChange={setNewTier}>
                        <SelectTrigger className="bg-slate-800 border-slate-700 text-white" data-testid="select-invite-tier">
                          <SelectValue placeholder="Select tier" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-700">
                          <SelectItem value="free">Free</SelectItem>
                          <SelectItem value="advanced">Advanced</SelectItem>
                          <SelectItem value="pro">Pro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm text-slate-400">Notes (optional)</label>
                      <Textarea
                        placeholder="Internal notes about this invite..."
                        value={newNotes}
                        onChange={(e) => setNewNotes(e.target.value)}
                        className="bg-slate-800 border-slate-700 text-white resize-none"
                        rows={3}
                        data-testid="input-invite-notes"
                      />
                    </div>
                  </div>
                  <DialogFooter className="gap-2">
                    <Button 
                      variant="outline" 
                      onClick={() => setShowCreateDialog(false)}
                      className="border-slate-700 text-slate-300"
                    >
                      Cancel
                    </Button>
                    <Button 
                      onClick={() => createInviteMutation.mutate({ email: newEmail, tier: newTier, notes: newNotes })}
                      disabled={!newEmail || createInviteMutation.isPending}
                      className="bg-cyan-600 hover:bg-cyan-700"
                      data-testid="button-submit-invite"
                    >
                      {createInviteMutation.isPending ? "Creating..." : "Create Invite"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map(i => (
                <Skeleton key={i} className="h-16 bg-slate-800" />
              ))}
            </div>
          ) : invites.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Mail className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No invites created yet</p>
              <p className="text-sm mt-1">Click "Create Invite" to get started</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableHead className="text-slate-400">Email</TableHead>
                    <TableHead className="text-slate-400">Access Code</TableHead>
                    <TableHead className="text-slate-400">Status</TableHead>
                    <TableHead className="text-slate-400">Tier</TableHead>
                    <TableHead className="text-slate-400">Expires</TableHead>
                    <TableHead className="text-slate-400 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invites.map((invite) => (
                    <TableRow key={invite.id} className="border-slate-800" data-testid={`row-invite-${invite.id}`}>
                      <TableCell>
                        <p className="font-medium text-white">{invite.email}</p>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <code className="text-xs text-cyan-400 font-mono bg-slate-800/50 px-2 py-1 rounded max-w-[180px] truncate" title={invite.token}>
                            {invite.token}
                          </code>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-slate-400 hover:text-cyan-400"
                            onClick={() => {
                              navigator.clipboard.writeText(invite.token);
                              setCopiedId(invite.id + '-code');
                              toast({ title: "Access code copied!" });
                              setTimeout(() => setCopiedId(null), 2000);
                            }}
                            data-testid={`button-copy-code-${invite.id}`}
                            title="Copy access code"
                          >
                            {copiedId === invite.id + '-code' ? (
                              <CheckCircle2 className="h-3 w-3 text-green-400" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(invite.status)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-slate-300 border-slate-600">
                          {invite.tierOverride || 'free'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-slate-400 text-sm">
                        {format(new Date(invite.expiresAt), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-slate-400 hover:text-white"
                            onClick={() => copyInviteLink(invite.token, invite.id)}
                            data-testid={`button-copy-${invite.id}`}
                          >
                            {copiedId === invite.id ? (
                              <CheckCircle2 className="h-4 w-4 text-green-400" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                          {invite.status === 'pending' && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-cyan-400 hover:text-cyan-300"
                              onClick={() => sendInviteMutation.mutate(invite.id)}
                              disabled={sendInviteMutation.isPending}
                              data-testid={`button-send-${invite.id}`}
                              title="Send invite email"
                            >
                              <Send className="h-4 w-4" />
                            </Button>
                          )}
                          {invite.status === 'sent' && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-amber-400 hover:text-amber-300"
                              onClick={() => resendInviteMutation.mutate(invite.id)}
                              disabled={resendInviteMutation.isPending}
                              data-testid={`button-resend-${invite.id}`}
                              title="Resend invite email"
                            >
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                          )}
                          {['pending', 'sent'].includes(invite.status) && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-red-400 hover:text-red-300"
                              onClick={() => revokeInviteMutation.mutate(invite.id)}
                              data-testid={`button-revoke-${invite.id}`}
                              title="Revoke invite"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminInvites() {
  return (
    <AdminLayout>
      <AdminInvitesContent />
    </AdminLayout>
  );
}
