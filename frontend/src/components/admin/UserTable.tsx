'use client';

import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { fetchUsers, createUser } from '@/lib/api';
import { toast } from '@/components/ui/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import type { UserRole } from '@/types';

export function UserTable() {
  const qc = useQueryClient();
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: fetchUsers,
  });

  const { mutateAsync: addUser, isPending } = useMutation({
    mutationFn: createUser,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    email: '', password: '', full_name: '', role: 'ap_clerk' as UserRole,
    assigned_company: '', approval_limit: '', status: 'active' as const,
  });

  const handleCreate = async () => {
    try {
      await addUser({
        ...form,
        approval_limit: form.approval_limit ? Number(form.approval_limit) : null,
        assigned_company: form.approval_limit || null,
      } as Parameters<typeof createUser>[0]);
      toast({ title: 'User created', variant: 'success' as never });
      setOpen(false);
      setForm({ email: '', password: '', full_name: '', role: 'ap_clerk', assigned_company: '', approval_limit: '', status: 'active' });
    } catch {
      toast({ title: 'Failed to create user', variant: 'destructive' });
    }
  };

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpen(true)}>
          <UserPlus className="mr-2 h-4 w-4" />
          Add User
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Company</TableHead>
            <TableHead>Approval Limit</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => (
            <TableRow key={u.user_id}>
              <TableCell className="font-medium">{u.full_name}</TableCell>
              <TableCell>{u.email}</TableCell>
              <TableCell className="capitalize">{u.role.replace('_', ' ')}</TableCell>
              <TableCell>{u.assigned_company ?? '—'}</TableCell>
              <TableCell>{u.approval_limit ? `$${u.approval_limit.toLocaleString()}` : '—'}</TableCell>
              <TableCell>
                <Badge variant={u.status === 'active' ? 'success' : 'secondary'}>
                  {u.status}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
          {users.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No users</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add User</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2 space-y-1.5">
              <Label>Full Name</Label>
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Password</Label>
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as UserRole })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ap_clerk">AP Clerk</SelectItem>
                  <SelectItem value="finance_manager">Finance Manager</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Approval Limit ($)</Label>
              <Input type="number" value={form.approval_limit} onChange={(e) => setForm({ ...form, approval_limit: e.target.value })} placeholder="Unlimited" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Company Code</Label>
              <Input value={form.assigned_company} onChange={(e) => setForm({ ...form, assigned_company: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={isPending || !form.email || !form.password || !form.full_name}>
              {isPending ? 'Creating…' : 'Create User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
