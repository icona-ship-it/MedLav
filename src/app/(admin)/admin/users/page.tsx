'use client';

import { useEffect, useState, useTransition } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getUsers, toggleUserActive } from '../actions';
import type { AdminUser } from '../actions';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    loadUsers();
  }, []);

  function loadUsers() {
    setLoading(true);
    startTransition(async () => {
      try {
        const data = await getUsers();
        setUsers(data);
      } finally {
        setLoading(false);
      }
    });
  }

  function handleToggleActive(userId: string) {
    setTogglingId(userId);
    startTransition(async () => {
      try {
        const result = await toggleUserActive(userId);
        setUsers((prev) =>
          prev.map((u) =>
            u.id === userId ? { ...u, isActive: result.isActive } : u,
          ),
        );
      } finally {
        setTogglingId(null);
      }
    });
  }

  const planLabel = (plan: string | null): string => {
    if (!plan) return 'Nessuno';
    const labels: Record<string, string> = {
      trial: 'Trial',
      base: 'Base',
      pro: 'Pro',
      enterprise: 'Enterprise',
    };
    return labels[plan] ?? plan;
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Gestione Utenti</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Utenti registrati {!loading && `(${users.length})`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Caricamento...</p>
          ) : users.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessun utente registrato.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Email</th>
                    <th className="px-4 py-2 text-left font-medium">Nome</th>
                    <th className="px-4 py-2 text-left font-medium">Casi</th>
                    <th className="px-4 py-2 text-left font-medium">Piano</th>
                    <th className="px-4 py-2 text-left font-medium">Stato</th>
                    <th className="px-4 py-2 text-left font-medium">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b last:border-b-0">
                      <td className="px-4 py-3">{user.email}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {user.fullName ?? '-'}
                      </td>
                      <td className="px-4 py-3">{user.casesCount}</td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary">
                          {planLabel(user.subscriptionPlan)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {user.isActive ? (
                          <Badge variant="success">Attivo</Badge>
                        ) : (
                          <Badge variant="destructive">Disattivato</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          variant={user.isActive ? 'outline' : 'default'}
                          size="sm"
                          disabled={isPending && togglingId === user.id}
                          onClick={() => handleToggleActive(user.id)}
                        >
                          {isPending && togglingId === user.id
                            ? 'Aggiornamento...'
                            : user.isActive
                              ? 'Disattiva'
                              : 'Attiva'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
