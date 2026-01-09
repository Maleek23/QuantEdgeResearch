import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
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
} from "@/components/ui/dialog";
import { AdminLayout } from "@/components/admin/admin-layout";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import {
  Users,
  Search,
  Crown,
  Shield,
  User,
  Trash2,
  Eye,
  Mail,
  Calendar,
  CheckCircle2,
  XCircle,
  Briefcase,
  TrendingUp,
  Target,
  Clock,
  CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

function getCSRFToken(): string | null {
  const match = document.cookie.match(/csrf_token=([^;]+)/);
  return match ? match[1] : null;
}

interface UserData {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
  subscriptionTier: string;
  subscriptionStatus?: string;
  hasBetaAccess: boolean;
  betaInviteId?: string;
  occupation?: string;
  tradingExperienceLevel?: string;
  knowledgeFocus?: string[];
  investmentGoals?: string;
  riskTolerance?: string;
  referralSource?: string;
  onboardingCompletedAt?: string;
  discordUsername?: string;
  stripeCustomerId?: string;
  createdAt: string;
  updatedAt?: string;
}

interface UserDetails {
  user: UserData;
  watchlistCount: number;
}

function AdminUsersContent() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const { data: users, isLoading } = useQuery<UserData[]>({
    queryKey: ['/api/admin/users'],
    queryFn: async () => {
      const res = await fetch('/api/admin/users', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch users');
      return res.json();
    }
  });

  const updateTierMutation = useMutation({
    mutationFn: async ({ userId, tier }: { userId: string; tier: string }) => {
      const csrfToken = getCSRFToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (csrfToken) headers['x-csrf-token'] = csrfToken;
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ subscriptionTier: tier }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to update tier');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      toast({ title: "User tier updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update user tier", variant: "destructive" });
    }
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const csrfToken = getCSRFToken();
      const headers: Record<string, string> = {};
      if (csrfToken) headers['x-csrf-token'] = csrfToken;
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers,
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to delete user');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      toast({ title: "User deleted successfully" });
      setDeleteUserId(null);
    },
    onError: () => {
      toast({ title: "Failed to delete user", variant: "destructive" });
    }
  });

  const filteredUsers = users?.filter((user) => {
    const matchesSearch = 
      user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.firstName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.lastName?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTier = tierFilter === "all" || user.subscriptionTier === tierFilter;
    return matchesSearch && matchesTier;
  }) || [];

  const getTierBadge = (tier: string) => {
    const styles = {
      admin: "bg-red-500/10 text-red-400 border-red-500/20",
      pro: "bg-purple-500/10 text-purple-400 border-purple-500/20",
      advanced: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
      free: "bg-slate-500/10 text-slate-400 border-slate-500/20",
    };
    const icons = {
      admin: <Shield className="h-3 w-3" />,
      pro: <Crown className="h-3 w-3" />,
      advanced: <CheckCircle2 className="h-3 w-3" />,
      free: <User className="h-3 w-3" />,
    };
    return (
      <Badge variant="outline" className={cn("flex items-center gap-1", styles[tier as keyof typeof styles] || styles.free)}>
        {icons[tier as keyof typeof icons] || icons.free}
        {tier.charAt(0).toUpperCase() + tier.slice(1)}
      </Badge>
    );
  };

  const userToDelete = users?.find(u => u.id === deleteUserId);
  const selectedUser = users?.find(u => u.id === selectedUserId);

  const getExperienceBadge = (level?: string) => {
    const labels: Record<string, { label: string; color: string }> = {
      beginner: { label: "Beginner", color: "bg-green-500/10 text-green-400 border-green-500/20" },
      intermediate: { label: "Intermediate", color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
      advanced: { label: "Advanced", color: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
      professional: { label: "Professional", color: "bg-red-500/10 text-red-400 border-red-500/20" },
    };
    const config = labels[level || ""] || { label: level || "Unknown", color: "bg-slate-500/10 text-slate-400 border-slate-500/20" };
    return <Badge variant="outline" className={config.color}>{config.label}</Badge>;
  };

  const getRiskBadge = (risk?: string) => {
    const labels: Record<string, { label: string; color: string }> = {
      conservative: { label: "Conservative", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
      moderate: { label: "Moderate", color: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" },
      aggressive: { label: "Aggressive", color: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
      very_aggressive: { label: "Very Aggressive", color: "bg-red-500/10 text-red-400 border-red-500/20" },
    };
    const config = labels[risk || ""] || { label: risk || "Unknown", color: "bg-slate-500/10 text-slate-400 border-slate-500/20" };
    return <Badge variant="outline" className={config.color}>{config.label}</Badge>;
  };

  return (
    <div className="space-y-6">
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-white flex items-center gap-2">
                <Users className="h-5 w-5 text-cyan-400" />
                User Management
              </CardTitle>
              <CardDescription className="text-slate-500">
                {filteredUsers.length} users {tierFilter !== 'all' && `(${tierFilter})`}
              </CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-500" />
                <Input
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-slate-800 border-slate-700 text-white w-full sm:w-64"
                  data-testid="input-search-users"
                />
              </div>
              <Select value={tierFilter} onValueChange={setTierFilter}>
                <SelectTrigger className="w-full sm:w-40 bg-slate-800 border-slate-700 text-white" data-testid="select-tier-filter">
                  <SelectValue placeholder="Filter by tier" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="all">All Tiers</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="advanced">Advanced</SelectItem>
                  <SelectItem value="free">Free</SelectItem>
                </SelectContent>
              </Select>
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
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No users found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableHead className="text-slate-400">User</TableHead>
                    <TableHead className="text-slate-400">Tier</TableHead>
                    <TableHead className="text-slate-400">Beta Access</TableHead>
                    <TableHead className="text-slate-400">Joined</TableHead>
                    <TableHead className="text-slate-400 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user.id} className="border-slate-800" data-testid={`row-user-${user.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-slate-700 flex items-center justify-center">
                            <span className="text-sm font-medium text-white">
                              {user.firstName?.[0] || user.email[0].toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-white">
                              {user.firstName && user.lastName 
                                ? `${user.firstName} ${user.lastName}` 
                                : user.email.split('@')[0]}
                            </p>
                            <p className="text-xs text-slate-500 flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {user.email}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select 
                          value={user.subscriptionTier} 
                          onValueChange={(tier) => updateTierMutation.mutate({ userId: user.id, tier })}
                        >
                          <SelectTrigger className="w-32 h-8 bg-transparent border-none p-0" data-testid={`select-tier-${user.id}`}>
                            {getTierBadge(user.subscriptionTier)}
                          </SelectTrigger>
                          <SelectContent className="bg-slate-800 border-slate-700">
                            <SelectItem value="free">Free</SelectItem>
                            <SelectItem value="advanced">Advanced</SelectItem>
                            <SelectItem value="pro">Pro</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {user.hasBetaAccess ? (
                          <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/20">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-slate-500/10 text-slate-400 border-slate-500/20">
                            <XCircle className="h-3 w-3 mr-1" />
                            No Access
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-slate-400 text-sm">
                          <Calendar className="h-3 w-3" />
                          {user.createdAt 
                            ? format(new Date(user.createdAt), 'MMM d, yyyy')
                            : 'Unknown'}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10"
                            onClick={() => setSelectedUserId(user.id)}
                            data-testid={`button-view-${user.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                            onClick={() => setDeleteUserId(user.id)}
                            data-testid={`button-delete-${user.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
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

      <Dialog open={!!deleteUserId} onOpenChange={() => setDeleteUserId(null)}>
        <DialogContent className="bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">Delete User</DialogTitle>
            <DialogDescription className="text-slate-400">
              Are you sure you want to delete this user? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {userToDelete && (
            <div className="p-4 bg-slate-800 rounded-lg">
              <p className="font-medium text-white">{userToDelete.email}</p>
              <p className="text-sm text-slate-400">{userToDelete.subscriptionTier} tier</p>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => setDeleteUserId(null)}
              className="border-slate-700 text-slate-300"
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => deleteUserId && deleteUserMutation.mutate(deleteUserId)}
              disabled={deleteUserMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteUserMutation.isPending ? "Deleting..." : "Delete User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={!!selectedUserId} onOpenChange={() => setSelectedUserId(null)}>
        <SheetContent className="bg-slate-900 border-slate-700 w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="text-white flex items-center gap-2">
              <User className="h-5 w-5 text-cyan-400" />
              User Details
            </SheetTitle>
            <SheetDescription className="text-slate-400">
              View complete user profile and activity
            </SheetDescription>
          </SheetHeader>
          
          {selectedUser && (
            <ScrollArea className="h-[calc(100vh-120px)] mt-6 pr-4">
              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="h-16 w-16 rounded-full bg-gradient-to-br from-cyan-500/20 to-cyan-400/10 border border-cyan-500/20 flex items-center justify-center">
                    <span className="text-2xl font-bold text-cyan-400">
                      {selectedUser.firstName?.[0] || selectedUser.email[0].toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-white">
                      {selectedUser.firstName && selectedUser.lastName 
                        ? `${selectedUser.firstName} ${selectedUser.lastName}` 
                        : selectedUser.email.split('@')[0]}
                    </h3>
                    <p className="text-slate-400 flex items-center gap-1 text-sm">
                      <Mail className="h-3 w-3" />
                      {selectedUser.email}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      {getTierBadge(selectedUser.subscriptionTier)}
                      {selectedUser.hasBetaAccess && (
                        <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/20">
                          Beta Access
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <Separator className="bg-slate-700" />

                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-cyan-400" />
                    Profile Information
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                      <p className="text-xs text-slate-500 mb-1">Occupation</p>
                      <p className="text-sm text-white">{selectedUser.occupation || "Not specified"}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                      <p className="text-xs text-slate-500 mb-1">Referral Source</p>
                      <p className="text-sm text-white">{selectedUser.referralSource || "Not specified"}</p>
                    </div>
                    {selectedUser.discordUsername && (
                      <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 col-span-2">
                        <p className="text-xs text-slate-500 mb-1">Discord</p>
                        <p className="text-sm text-white">{selectedUser.discordUsername}</p>
                      </div>
                    )}
                  </div>
                </div>

                <Separator className="bg-slate-700" />

                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-cyan-400" />
                    Trading Profile
                  </h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                      <span className="text-sm text-slate-400">Experience Level</span>
                      {getExperienceBadge(selectedUser.tradingExperienceLevel)}
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                      <span className="text-sm text-slate-400">Risk Tolerance</span>
                      {getRiskBadge(selectedUser.riskTolerance)}
                    </div>
                    <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                      <p className="text-xs text-slate-500 mb-2">Investment Goals</p>
                      <Badge variant="outline" className="bg-cyan-500/10 text-cyan-400 border-cyan-500/20">
                        <Target className="h-3 w-3 mr-1" />
                        {selectedUser.investmentGoals?.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()) || "Not specified"}
                      </Badge>
                    </div>
                    {selectedUser.knowledgeFocus && selectedUser.knowledgeFocus.length > 0 && (
                      <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                        <p className="text-xs text-slate-500 mb-2">Knowledge Focus</p>
                        <div className="flex flex-wrap gap-1">
                          {selectedUser.knowledgeFocus.map((focus) => (
                            <Badge key={focus} variant="outline" className="bg-slate-700/50 text-slate-300 border-slate-600 text-xs">
                              {focus.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <Separator className="bg-slate-700" />

                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <Clock className="h-4 w-4 text-cyan-400" />
                    Account Timeline
                  </h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-400 flex items-center gap-2">
                        <Calendar className="h-3 w-3" />
                        Joined
                      </span>
                      <span className="text-white">
                        {selectedUser.createdAt ? format(new Date(selectedUser.createdAt), 'MMM d, yyyy') : 'Unknown'}
                      </span>
                    </div>
                    {selectedUser.onboardingCompletedAt && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-400 flex items-center gap-2">
                          <CheckCircle2 className="h-3 w-3" />
                          Onboarding Completed
                        </span>
                        <span className="text-white">
                          {format(new Date(selectedUser.onboardingCompletedAt), 'MMM d, yyyy')}
                        </span>
                      </div>
                    )}
                    {selectedUser.updatedAt && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-400 flex items-center gap-2">
                          <Clock className="h-3 w-3" />
                          Last Updated
                        </span>
                        <span className="text-white">
                          {format(new Date(selectedUser.updatedAt), 'MMM d, yyyy')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {selectedUser.stripeCustomerId && (
                  <>
                    <Separator className="bg-slate-700" />
                    <div className="space-y-4">
                      <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                        <CreditCard className="h-4 w-4 text-cyan-400" />
                        Billing
                      </h4>
                      <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                        <p className="text-xs text-slate-500 mb-1">Stripe Customer ID</p>
                        <p className="text-xs font-mono text-slate-400">{selectedUser.stripeCustomerId}</p>
                      </div>
                    </div>
                  </>
                )}

                <div className="pt-4">
                  <Button 
                    variant="destructive" 
                    className="w-full"
                    onClick={() => {
                      setSelectedUserId(null);
                      setDeleteUserId(selectedUser.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete User
                  </Button>
                </div>
              </div>
            </ScrollArea>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default function AdminUsers() {
  return (
    <AdminLayout>
      <AdminUsersContent />
    </AdminLayout>
  );
}
