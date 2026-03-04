'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { getProfile, updateProfile, changePassword, exportMyData, deleteMyAccount } from './actions';
import type { ProfileData } from './actions';
import { AlertTriangle, Download } from 'lucide-react';

export default function SettingsPage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);

  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    getProfile()
      .then(setProfile)
      .finally(() => setIsLoadingProfile(false));
  }, []);

  async function handleProfileSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setProfileSaving(true);
    setProfileMessage(null);

    const formData = new FormData(e.currentTarget);
    const result = await updateProfile(formData);

    if (result.error) {
      setProfileMessage({ type: 'error', text: result.error });
    } else {
      setProfileMessage({ type: 'success', text: 'Profilo aggiornato' });
    }
    setProfileSaving(false);
  }

  async function handlePasswordSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPasswordSaving(true);
    setPasswordMessage(null);

    const formData = new FormData(e.currentTarget);
    const result = await changePassword(formData);

    if (result.error) {
      setPasswordMessage({ type: 'error', text: result.error });
    } else {
      setPasswordMessage({ type: 'success', text: 'Password aggiornata' });
      e.currentTarget.reset();
    }
    setPasswordSaving(false);
  }

  if (isLoadingProfile) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Impostazioni</h1>
          <p className="text-muted-foreground">Gestisci il tuo profilo e la sicurezza</p>
        </div>
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">Caricamento...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Impostazioni</h1>
        <p className="text-muted-foreground">Gestisci il tuo profilo e la sicurezza</p>
      </div>

      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle>Profilo</CardTitle>
          <CardDescription>Le tue informazioni personali e professionali</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleProfileSubmit} className="space-y-4">
            {profileMessage && (
              <div
                className={`rounded-md p-3 text-sm ${
                  profileMessage.type === 'error'
                    ? 'bg-destructive/10 text-destructive'
                    : 'bg-green-500/10 text-green-700 dark:text-green-400'
                }`}
              >
                {profileMessage.text}
              </div>
            )}
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <Input
                id="email"
                type="email"
                value={profile?.email ?? ''}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                L&apos;email non può essere modificata
              </p>
            </div>
            <div className="space-y-2">
              <label htmlFor="fullName" className="text-sm font-medium">
                Nome completo
              </label>
              <Input
                id="fullName"
                name="fullName"
                type="text"
                defaultValue={profile?.fullName ?? ''}
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="studio" className="text-sm font-medium">
                Studio medico-legale
              </label>
              <Input
                id="studio"
                name="studio"
                type="text"
                defaultValue={profile?.studio ?? ''}
                placeholder="Es. Studio Medico-Legale Rossi"
              />
            </div>
            <Button type="submit" disabled={profileSaving}>
              {profileSaving ? 'Salvataggio...' : 'Salva profilo'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader>
          <CardTitle>Cambia password</CardTitle>
          <CardDescription>Aggiorna la tua password di accesso</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            {passwordMessage && (
              <div
                className={`rounded-md p-3 text-sm ${
                  passwordMessage.type === 'error'
                    ? 'bg-destructive/10 text-destructive'
                    : 'bg-green-500/10 text-green-700 dark:text-green-400'
                }`}
              >
                {passwordMessage.text}
              </div>
            )}
            <div className="space-y-2">
              <label htmlFor="currentPassword" className="text-sm font-medium">
                Password attuale
              </label>
              <Input
                id="currentPassword"
                name="currentPassword"
                type="password"
                required
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="newPassword" className="text-sm font-medium">
                Nuova password
              </label>
              <Input
                id="newPassword"
                name="newPassword"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
              />
              <p className="text-xs text-muted-foreground">
                Minimo 8 caratteri
              </p>
            </div>
            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="text-sm font-medium">
                Conferma nuova password
              </label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <Button type="submit" disabled={passwordSaving}>
              {passwordSaving ? 'Aggiornamento...' : 'Cambia password'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* GDPR Data Rights */}
      <Card>
        <CardHeader>
          <CardTitle>I tuoi dati (GDPR)</CardTitle>
          <CardDescription>
            Diritto di accesso, portabilità e cancellazione dei tuoi dati (Art. 15, 17, 20 GDPR)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-md border p-4">
            <div>
              <p className="text-sm font-medium">Esporta tutti i tuoi dati</p>
              <p className="text-xs text-muted-foreground">
                Scarica una copia completa di tutti i tuoi dati in formato JSON
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={exporting}
              onClick={async () => {
                setExporting(true);
                const result = await exportMyData();
                if (result.data) {
                  const blob = new Blob([result.data], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `medlav-export-${new Date().toISOString().slice(0, 10)}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }
                setExporting(false);
              }}
            >
              <Download className="mr-1 h-4 w-4" />
              {exporting ? 'Esportazione...' : 'Esporta dati'}
            </Button>
          </div>

          <div className="rounded-md border border-destructive/30 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-destructive">Elimina account e tutti i dati</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Questa azione è irreversibile. Tutti i tuoi casi, documenti, report e dati personali verranno eliminati permanentemente.
                </p>
                {!showDeleteConfirm ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="mt-3"
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    Elimina il mio account
                  </Button>
                ) : (
                  <div className="mt-3 space-y-2">
                    <p className="text-sm font-semibold text-destructive">
                      Sei sicuro? Tutti i dati verranno eliminati permanentemente.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={deleting}
                        onClick={async () => {
                          setDeleting(true);
                          await deleteMyAccount();
                        }}
                      >
                        {deleting ? 'Eliminazione...' : 'Conferma eliminazione'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowDeleteConfirm(false)}
                      >
                        Annulla
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
