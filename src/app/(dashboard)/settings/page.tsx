'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { getProfile, updateProfile, changePassword, updateRetentionPolicy, updateEmailNotifications, exportMyData, deleteMyAccount, uploadSignature, deleteSignature } from './actions';
import type { ProfileData } from './actions';
import { AlertTriangle, Download, CreditCard, Clock, Sparkles, Loader2, Mail, Pen, Trash2, Upload, Coins, ShoppingCart } from 'lucide-react';
import { csrfHeaders } from '@/lib/csrf-client';
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
      const res = await fetch('/api/stripe/portal', { method: 'POST', headers: { ...csrfHeaders() } });
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

function SignatureCard({
  signaturePath,
  onUploaded,
  onDeleted,
}: {
  signaturePath: string | null;
  onUploaded: (path: string) => void;
  onDeleted: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMessage(null);
    const formData = new FormData();
    formData.set('signature', file);
    const result = await uploadSignature(formData);
    if (result.error) {
      setMessage({ type: 'error', text: result.error });
    } else if (result.path) {
      onUploaded(result.path);
      setMessage({ type: 'success', text: 'Firma caricata' });
    }
    setUploading(false);
    e.target.value = '';
  }

  async function handleDelete() {
    setDeleting(true);
    setMessage(null);
    const result = await deleteSignature();
    if (result.error) {
      setMessage({ type: 'error', text: result.error });
    } else {
      onDeleted();
      setMessage({ type: 'success', text: 'Firma rimossa' });
    }
    setDeleting(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Firma digitale</CardTitle>
        <CardDescription>
          Carica un&apos;immagine della tua firma per includerla automaticamente nei report esportati (DOCX/HTML)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {message && (
          <div className={`rounded-md p-3 text-sm ${message.type === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-green-500/10 text-green-700 dark:text-green-400'}`}>
            {message.text}
          </div>
        )}
        <div className="flex items-center justify-between rounded-md border p-4">
          <div className="flex items-center gap-3">
            <Pen className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">
                {signaturePath ? 'Firma caricata' : 'Nessuna firma caricata'}
              </p>
              <p className="text-xs text-muted-foreground">
                PNG, JPG o WEBP — max 500KB
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {signaturePath && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />}
                Rimuovi
              </Button>
            )}
            <Button variant="outline" size="sm" disabled={uploading} asChild>
              <label className="cursor-pointer">
                {uploading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}
                {signaturePath ? 'Sostituisci' : 'Carica'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleUpload}
                  className="hidden"
                />
              </label>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// --- Credits Section ---

interface CreditBalance {
  purchased: number;
  monthlyRemaining: number;
  total: number;
  monthlyAllowance: number;
}

interface CreditTransaction {
  id: string;
  amount: number;
  balance_after: number;
  type: string;
  operation: string | null;
  created_at: string;
}

const TRANSACTION_LABELS: Record<string, string> = {
  consumption: 'Consumo',
  refund: 'Rimborso',
  purchase: 'Acquisto',
  monthly_grant: 'Crediti mensili',
  trial_grant: 'Crediti trial',
};

const OPERATION_LABELS: Record<string, string> = {
  elaborazione: 'Elaborazione caso',
  categorizzazione: 'Categorizzazione AI',
  rigenerazione_sezione: 'Rigenerazione sezione',
  rigenerazione_report: 'Rigenerazione report',
  split_pdf: 'Divisione PDF',
  acquisto: 'Acquisto crediti',
  registrazione: 'Registrazione',
  subscription: 'Abbonamento Pro',
};

function CreditsSection() {
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [history, setHistory] = useState<CreditTransaction[]>([]);
  const [purchasing, setPurchasing] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      const [balRes, histRes] = await Promise.all([
        fetch('/api/credits/balance').then((r) => r.json() as Promise<{ success: boolean; data?: CreditBalance }>),
        fetch('/api/credits/history?limit=20').then((r) => r.json() as Promise<{ success: boolean; data?: CreditTransaction[] }>),
      ]);
      if (balRes.success && balRes.data) setBalance(balRes.data);
      if (histRes.success && histRes.data) setHistory(histRes.data);
    }
    load();
  }, []);

  async function handlePurchase(credits: number) {
    setPurchasing(credits);
    try {
      const res = await fetch('/api/credits/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ credits }),
      });
      const data = await res.json() as { success: boolean; data?: { url: string }; error?: string };
      if (data.success && data.data?.url) {
        window.location.href = data.data.url;
      }
    } catch {
      // silently fail
    } finally {
      setPurchasing(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Coins className="h-5 w-5" />
          Crediti
        </CardTitle>
        <CardDescription>Il tuo saldo crediti e storico utilizzo</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Balance display */}
        {balance && (
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-md border p-4 text-center">
              <p className="text-2xl font-bold">{balance.total}</p>
              <p className="text-xs text-muted-foreground">Totale disponibile</p>
            </div>
            <div className="rounded-md border p-4 text-center">
              <p className="text-2xl font-bold">{balance.monthlyRemaining}</p>
              <p className="text-xs text-muted-foreground">Mensili rimanenti</p>
            </div>
            <div className="rounded-md border p-4 text-center">
              <p className="text-2xl font-bold">{balance.purchased}</p>
              <p className="text-xs text-muted-foreground">Acquistati</p>
            </div>
          </div>
        )}

        {/* Buy credits */}
        <div>
          <p className="text-sm font-medium mb-3">Acquista crediti extra</p>
          <div className="grid grid-cols-3 gap-3">
            {[
              { credits: 100, price: 9 },
              { credits: 300, price: 24 },
              { credits: 1000, price: 69 },
            ].map((pack) => (
              <Button
                key={pack.credits}
                variant="outline"
                className="flex flex-col h-auto py-3"
                onClick={() => handlePurchase(pack.credits)}
                disabled={purchasing !== null}
              >
                {purchasing === pack.credits ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShoppingCart className="h-4 w-4" />
                )}
                <span className="font-bold">{pack.credits} crediti</span>
                <span className="text-xs text-muted-foreground">&euro;{pack.price}</span>
              </Button>
            ))}
          </div>
        </div>

        {/* Transaction history */}
        {history.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-3">Ultime operazioni</p>
            <div className="space-y-1 max-h-[300px] overflow-y-auto">
              {history.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between text-sm rounded-md px-3 py-2 border-l-4 border-l-muted-foreground/20">
                  <div>
                    <span className="font-medium">
                      {TRANSACTION_LABELS[tx.type] ?? tx.type}
                    </span>
                    {tx.operation && (
                      <span className="text-muted-foreground ml-1">
                        — {OPERATION_LABELS[tx.operation] ?? tx.operation}
                      </span>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {new Date(tx.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <span className={`font-mono font-bold ${tx.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {tx.amount > 0 ? '+' : ''}{tx.amount}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
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
  const [deletePassword, setDeletePassword] = useState('');
  const [deletePasswordError, setDeletePasswordError] = useState('');

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

      {/* Digital Signature */}
      <SignatureCard
        signaturePath={profile?.signatureImagePath ?? null}
        onUploaded={(path) => setProfile((prev) => prev ? { ...prev, signatureImagePath: path } : prev)}
        onDeleted={() => setProfile((prev) => prev ? { ...prev, signatureImagePath: null } : prev)}
      />

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
                      : 'Piano gratuito — 30 crediti inclusi'}
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
                    <li>900 crediti/mese (~25 casi medi)</li>
                    <li>RAG linee guida cliniche</li>
                    <li>Rigenerazione sezioni report</li>
                    <li>Calcoli medico-legali automatici (ITT/ITP)</li>
                    <li>Supporto prioritario</li>
                  </ul>
                  <p className="mt-3 text-sm font-semibold">
                    &euro;69/mese o &euro;55/mese (annuale)
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

      {/* Credits */}
      <CreditsSection />

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
                  a.download = `legmed-export-${new Date().toISOString().slice(0, 10)}.json`;
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
                  <div className="mt-3 space-y-3">
                    <p className="text-sm font-semibold text-destructive">
                      Sei sicuro? Tutti i dati verranno eliminati permanentemente.
                    </p>
                    <div className="space-y-2">
                      <label htmlFor="delete-password" className="text-sm text-muted-foreground">
                        Inserisci la tua password per confermare:
                      </label>
                      <input
                        id="delete-password"
                        type="password"
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                        value={deletePassword}
                        onChange={(e) => { setDeletePassword(e.target.value); setDeletePasswordError(''); }}
                        placeholder="La tua password"
                      />
                      {deletePasswordError && (
                        <p className="text-xs text-destructive">{deletePasswordError}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={deleting || !deletePassword}
                        onClick={async () => {
                          setDeleting(true);
                          setDeletePasswordError('');
                          // Verify password by attempting sign-in
                          const { createClient: createBrowserClient } = await import('@/lib/supabase/client');
                          const supabase = createBrowserClient();
                          const { error: signInError } = await supabase.auth.signInWithPassword({
                            email: profile?.email ?? '',
                            password: deletePassword,
                          });
                          if (signInError) {
                            setDeletePasswordError('Password non corretta.');
                            setDeleting(false);
                            return;
                          }
                          await deleteMyAccount();
                        }}
                      >
                        {deleting ? 'Eliminazione...' : 'Conferma eliminazione'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setShowDeleteConfirm(false); setDeletePassword(''); setDeletePasswordError(''); }}
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
