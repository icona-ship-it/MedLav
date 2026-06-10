'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, Smartphone, Loader2 } from 'lucide-react';
import {
  listMfaFactors,
  enrollMfaFactor,
  verifyMfaEnrollment,
  unenrollMfaFactor,
  type MfaFactorInfo,
  type MfaEnrollData,
} from './mfa-actions';

type Message = { type: 'success' | 'error'; text: string } | null;

/**
 * Settings card: two-factor authentication (TOTP) — opt-in.
 * Flow: Attiva → QR + secret → codice a 6 cifre → attiva.
 * Manual browser testing required (enroll/challenge need a real authenticator app).
 */
export function MfaSection() {
  const [loading, setLoading] = useState(true);
  const [verifiedFactor, setVerifiedFactor] = useState<MfaFactorInfo | null>(null);
  const [enrollment, setEnrollment] = useState<MfaEnrollData | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [confirmDisable, setConfirmDisable] = useState(false);

  const refreshFactors = useCallback(async () => {
    const result = await listMfaFactors();
    if (result.factors) {
      setVerifiedFactor(result.factors.find((f) => f.status === 'verified') ?? null);
    }
  }, []);

  useEffect(() => {
    listMfaFactors()
      .then((result) => {
        if (result.factors) {
          setVerifiedFactor(result.factors.find((f) => f.status === 'verified') ?? null);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleStartEnrollment() {
    setBusy(true);
    setMessage(null);
    const result = await enrollMfaFactor();
    if (result.error) {
      setMessage({ type: 'error', text: result.error });
    } else if (result.data) {
      setEnrollment(result.data);
    }
    setBusy(false);
  }

  async function handleVerifyEnrollment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!enrollment) return;
    setBusy(true);
    setMessage(null);
    const result = await verifyMfaEnrollment(enrollment.factorId, code);
    if (result.error) {
      setMessage({ type: 'error', text: result.error });
    } else {
      setEnrollment(null);
      setCode('');
      setMessage({ type: 'success', text: 'Verifica in due passaggi attivata. Da ora, a ogni accesso ti verrà chiesto il codice dell\'app.' });
      await refreshFactors();
    }
    setBusy(false);
  }

  async function handleCancelEnrollment() {
    if (!enrollment) return;
    setBusy(true);
    await unenrollMfaFactor(enrollment.factorId);
    setEnrollment(null);
    setCode('');
    setMessage(null);
    setBusy(false);
  }

  async function handleDisable() {
    if (!verifiedFactor) return;
    setBusy(true);
    setMessage(null);
    const result = await unenrollMfaFactor(verifiedFactor.id);
    if (result.error) {
      setMessage({ type: 'error', text: result.error });
    } else {
      setConfirmDisable(false);
      setMessage({ type: 'success', text: 'Verifica in due passaggi disattivata.' });
      await refreshFactors();
    }
    setBusy(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Verifica in due passaggi (2FA)
        </CardTitle>
        <CardDescription>
          Protezione aggiuntiva per il tuo account: oltre alla password, a ogni accesso ti verrà chiesto un codice a 6 cifre generato da un&apos;app di autenticazione (es. Google Authenticator, Microsoft Authenticator, 1Password).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {message && (
          <div
            role="alert"
            className={`rounded-md p-3 text-sm ${
              message.type === 'error'
                ? 'bg-destructive/10 text-destructive'
                : 'bg-green-500/10 text-green-700 dark:text-green-400'
            }`}
          >
            {message.text}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Caricamento...
          </div>
        ) : enrollment ? (
          /* Enrollment in progress: QR + code verification */
          <div className="space-y-4 rounded-md border p-4">
            <p className="text-sm font-medium">1. Inquadra questo codice QR con la tua app di autenticazione</p>
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`data:image/svg+xml;utf8,${encodeURIComponent(enrollment.qrCodeSvg)}`}
                alt="Codice QR per l'app di autenticazione"
                width={180}
                height={180}
                className="rounded-md border bg-white p-2"
              />
            </div>
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Non riesci a inquadrare il QR? Inserisci il codice manualmente</summary>
              <p className="mt-2 break-all rounded bg-muted p-2 font-mono select-all">{enrollment.secret}</p>
            </details>
            <form onSubmit={handleVerifyEnrollment} className="space-y-2">
              <label htmlFor="mfa-enroll-code" className="text-sm font-medium">
                2. Inserisci il codice a 6 cifre mostrato dall&apos;app
              </label>
              <div className="flex gap-2">
                <Input
                  id="mfa-enroll-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  maxLength={7}
                  className="w-32 font-mono tracking-widest"
                  required
                />
                <Button type="submit" disabled={busy}>
                  {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                  Attiva
                </Button>
                <Button type="button" variant="outline" disabled={busy} onClick={handleCancelEnrollment}>
                  Annulla
                </Button>
              </div>
            </form>
          </div>
        ) : verifiedFactor ? (
          /* MFA active */
          <div className="flex items-center justify-between rounded-md border p-4">
            <div className="flex items-center gap-3">
              <Smartphone className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">App di autenticazione</p>
                  <Badge variant="success">Attiva</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Attivata il {new Date(verifiedFactor.createdAt).toLocaleDateString('it-IT')}
                </p>
              </div>
            </div>
            {!confirmDisable ? (
              <Button variant="outline" size="sm" onClick={() => setConfirmDisable(true)}>
                Disattiva
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-destructive">Sicuro?</span>
                <Button variant="destructive" size="sm" disabled={busy} onClick={handleDisable}>
                  {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                  Conferma
                </Button>
                <Button variant="outline" size="sm" onClick={() => setConfirmDisable(false)}>
                  Annulla
                </Button>
              </div>
            )}
          </div>
        ) : (
          /* MFA not enabled */
          <div className="flex items-center justify-between rounded-md border p-4">
            <div className="flex items-center gap-3">
              <Smartphone className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Verifica in due passaggi non attiva</p>
                <p className="text-xs text-muted-foreground">
                  Consigliata: i tuoi casi contengono dati sanitari di terzi
                </p>
              </div>
            </div>
            <Button size="sm" disabled={busy} onClick={handleStartEnrollment}>
              {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Attiva 2FA
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
