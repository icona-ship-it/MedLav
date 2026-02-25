'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { getProfile, updateProfile, changePassword } from './actions';
import type { ProfileData } from './actions';

export default function SettingsPage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);

  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
                L&apos;email non puo essere modificata
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
    </div>
  );
}
