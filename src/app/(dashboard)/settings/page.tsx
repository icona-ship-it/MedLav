'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { getProfile, updateProfile, changePassword, updateRetentionPolicy, updateEmailNotifications, exportMyData, deleteMyAccount } from './actions';
import type { ProfileData } from './actions';
import { AlertTriangle, Download, CreditCard, Clock, Sparkles, Loader2, Mail } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';

interface PortalResponse {
  success: boolean;
  data?: { url: string };
  error?: string;
}

function SubscriptionButton({
  hasStripeCustomer,
  isActive,
}: {
  hasStripeCustomer: boolean;
  isActive: boolean;
}) {
  const [isLoading, setIsLoading] = useState(false);

  if (!hasStripeCustomer) {
    return (
      <Button size="sm" asChild>
        <a href="/pricing">Passa a Pro</a>
      </Button>
    );
  }

  async function handlePortal() {
    setIsLoading(true);
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = (await res.json()) as PortalResponse;
      if (data.success && data.data?.url) {
        window.location.href = data.data.url;
      } else {
        setIsLoading(false);
      }
    } catch {
      setIsLoading(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isLoading}
      onClick={handlePortal}
    >
      {isLoading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Caricamento...
        </>
      ) : (
        isActive ? 'Gestisci abbonamento' : 'Gestisci pagamento'
      )}
    </Button>
  );
}

export default function SettingsPage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);

  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [retentionSaving, setRetentionSaving] = useState(false);
  const [retentionMessage, setRetentionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [notifSaving, setNotifSaving] = useState(false);
  const [notifMessage, setNotifMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

  async function handleRetentionChange(value: string) {
    setRetentionSaving(true);
    setRetentionMessage(null);

    const formData = new FormData();
    formData.set('retentionDays', value);
    const result = await updateRetentionPolicy(formData);

    if (result.error) {
      setRetentionMessage({ type: 'error', text: result.error });
    } else {
      setProfile((prev) => prev ? {
        ...prev,
        dataRetentionDays: value === 'null' ? null : Number(value),
      } : prev);
      setRetentionMessage({ type: 'success', text: 'Policy di conservazione aggiornata' });
    }
    setRetentionSaving(false);
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

      {/* Subscription */}
      <Card>
        <CardHeader>
          <CardTitle>Abbonamento</CardTitle>
          <CardDescription>Il tuo piano attuale e gestione abbonamento</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-md border p-4">
            <div className="flex items-center gap-3">
              <CreditCard className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">
                    Piano: {profile?.subscriptionPlan === 'pro' ? 'Pro' : 'Trial'}
                  </p>
                  {profile?.subscriptionStatus === 'active' && (
                    <Badge variant="success">Attivo</Badge>
                  )}
                  {profile?.subscriptionStatus === 'past_due' && (
                    <Badge variant="warning">Pagamento in ritardo</Badge>
                  )}
                  {!profile?.subscriptionStatus && (
                    <Badge variant="secondary">Gratuito</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {profile?.subscriptionStatus === 'active'
                    ? 'Accesso completo a tutte le funzionalità Pro'
                    : profile?.subscriptionStatus === 'past_due'
                      ? 'Aggiorna il metodo di pagamento per continuare'
                      : 'Piano gratuito — 5 casi inclusi'}
                </p>
              </div>
            </div>
            <SubscriptionButton
              hasStripeCustomer={!!profile?.stripeCustomerId}
              isActive={profile?.subscriptionStatus === 'active' || profile?.subscriptionStatus === 'past_due'}
            />
          </div>

          {/* Upgrade prompt for trial users */}
          {(!profile?.subscriptionPlan || profile?.subscriptionPlan === 'trial') && !profile?.stripeCustomerId && (
            <div className="rounded-md border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-start gap-3">
                <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Passa a Pro per sbloccare tutto</p>
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    <li>Casi illimitati (invece di 5)</li>
                    <li>RAG linee guida cliniche</li>
                    <li>Calcoli medico-legali automatici (ITT/ITP)</li>
                    <li>Export PCT per tribunale</li>
                    <li>Supporto prioritario</li>
                  </ul>
                  <p className="mt-3 text-sm font-semibold">
                    A partire da &euro;39/mese (annuale) o &euro;49/mese
                  </p>
                  <p className="text-xs text-muted-foreground">IVA esclusa</p>
                  <Button size="sm" className="mt-3" asChild>
                    <a href="/pricing">Vedi i piani</a>
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Data Retention */}
      <Card>
        <CardHeader>
          <CardTitle>Conservazione dati</CardTitle>
          <CardDescription>
            Periodo di conservazione automatica dei casi archiviati. I casi archiviati oltre questo periodo verranno eliminati automaticamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {retentionMessage && (
            <div
              className={`rounded-md p-3 text-sm ${
                retentionMessage.type === 'error'
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-green-500/10 text-green-700 dark:text-green-400'
              }`}
            >
              {retentionMessage.text}
            </div>
          )}
          <div className="flex items-center justify-between rounded-md border p-4">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Periodo di conservazione</p>
                <p className="text-xs text-muted-foreground">
                  Solo i casi con stato &quot;archiviato&quot; verranno eliminati automaticamente
                </p>
              </div>
            </div>
            <Select
              value={profile?.dataRetentionDays?.toString() ?? 'null'}
              onValueChange={handleRetentionChange}
              disabled={retentionSaving}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Seleziona periodo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="90">90 giorni</SelectItem>
                <SelectItem value="180">180 giorni</SelectItem>
                <SelectItem value="365">365 giorni</SelectItem>
                <SelectItem value="730">730 giorni</SelectItem>
                <SelectItem value="null">Mai</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Email Notifications */}
      <Card>
        <CardHeader>
          <CardTitle>Notifiche email</CardTitle>
          <CardDescription>
            Gestisci le notifiche via email per aggiornamenti sui tuoi casi
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {notifMessage && (
            <div
              className={`rounded-md p-3 text-sm ${
                notifMessage.type === 'error'
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-green-500/10 text-green-700 dark:text-green-400'
              }`}
            >
              {notifMessage.text}
            </div>
          )}
          <div className="flex items-center justify-between rounded-md border p-4">
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Notifiche email</p>
                <p className="text-xs text-muted-foreground">
                  Ricevi email quando un caso viene elaborato o si verifica un errore
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {notifSaving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              <Checkbox
                id="emailNotifications"
                checked={profile?.emailNotifications ?? true}
                disabled={notifSaving}
                onCheckedChange={async (checked) => {
                  const enabled = checked === true;
                  setNotifSaving(true);
                  setNotifMessage(null);
                  const result = await updateEmailNotifications(enabled);
                  if (result.error) {
                    setNotifMessage({ type: 'error', text: result.error });
                  } else {
                    setProfile((prev) => prev ? { ...prev, emailNotifications: enabled } : prev);
                    setNotifMessage({ type: 'success', text: enabled ? 'Notifiche attivate' : 'Notifiche disattivate' });
                  }
                  setNotifSaving(false);
                }}
              />
            </div>
          </div>
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
