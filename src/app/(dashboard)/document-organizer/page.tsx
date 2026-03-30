import { redirect } from 'next/navigation';
import { FolderSearch, Crown, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';
import { checkFeatureAccess } from '@/lib/subscription';
import Link from 'next/link';

export default async function DocumentOrganizerPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const access = await checkFeatureAccess(user.id, 'document_organizer');

  // Fetch user's draft cases (to show as options)
  const { data: cases } = await supabase
    .from('cases')
    .select('id, code, case_type, created_at, processing_stage')
    .eq('user_id', user.id)
    .in('processing_stage', ['idle', 'errore'])
    .order('created_at', { ascending: false })
    .limit(20);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">Organizza Documenti</h1>
          <Badge variant="secondary" className="gap-1">
            <Crown className="h-3 w-3" />
            Pro
          </Badge>
        </div>
        <p className="text-muted-foreground mt-1">
          Analizza, classifica e separa automaticamente i tuoi PDF misti in documenti singoli organizzati per tipo.
        </p>
      </div>

      {!access.allowed ? (
        /* Paywall */
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4 text-center py-8">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/20">
                <Crown className="h-8 w-8 text-amber-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Funzionalita Pro</h3>
                <p className="mt-1 text-sm text-muted-foreground max-w-md">
                  L&apos;organizzatore documenti analizza i tuoi PDF, li divide per tipo di documento
                  (cartelle cliniche, referti, atti legali) e li riordina cronologicamente.
                  Passa al piano Pro per accedere.
                </p>
              </div>
              <Button asChild>
                <Link href="/settings">
                  Passa a Pro
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* Main content — accessible to Pro users */
        <div className="space-y-4">
          {/* Select a case */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="text-center space-y-1">
                <p className="text-sm font-medium">Seleziona un caso da organizzare</p>
                <p className="text-xs text-muted-foreground">
                  Scegli un caso in bozza con documenti gia caricati. Il sistema analizzerà ogni PDF e lo organizzerà automaticamente.
                </p>
              </div>

              {(!cases || cases.length === 0) ? (
                <div className="text-center py-6">
                  <FolderSearch className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">Nessun caso in bozza trovato.</p>
                  <p className="text-xs text-muted-foreground mt-1">Crea un nuovo caso e carica i documenti prima di organizzarli.</p>
                  <Button asChild variant="outline" className="mt-3">
                    <Link href="/cases/new">Nuovo Caso</Link>
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {cases.map((c) => (
                    <Link
                      key={c.id as string}
                      href={`/cases/${c.id as string}`}
                      className="rounded-lg border p-3 hover:bg-muted/50 transition-colors flex items-center gap-3"
                    >
                      <FolderSearch className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{c.code as string}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.case_type as string} &middot; {c.processing_stage as string}
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* How it works */}
          <Card>
            <CardContent className="pt-6 space-y-3">
              <p className="text-sm font-medium text-center">Come funziona</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-lg border p-3 text-center space-y-1">
                  <div className="text-2xl">1</div>
                  <p className="text-sm font-medium">Analisi</p>
                  <p className="text-xs text-muted-foreground">L&apos;AI analizza ogni pagina dei PDF e identifica il tipo di documento</p>
                </div>
                <div className="rounded-lg border p-3 text-center space-y-1">
                  <div className="text-2xl">2</div>
                  <p className="text-sm font-medium">Separazione</p>
                  <p className="text-xs text-muted-foreground">I PDF misti vengono divisi in documenti singoli per tipo</p>
                </div>
                <div className="rounded-lg border p-3 text-center space-y-1">
                  <div className="text-2xl">3</div>
                  <p className="text-sm font-medium">Ordinamento</p>
                  <p className="text-xs text-muted-foreground">Tutti i documenti vengono riordinati cronologicamente</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
