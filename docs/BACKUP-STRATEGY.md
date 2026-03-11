# Backup Strategy

## Supabase Point-in-Time Recovery (PITR)

MedLav utilizza Supabase PostgreSQL (EU, Francoforte) con PITR abilitato.

### Configurazione

- **Piano**: Supabase Pro
- **Retention**: 7 giorni di backup continuo
- **Granularita**: ripristino a qualsiasi secondo negli ultimi 7 giorni
- **Regione**: eu-central-1 (Francoforte, Germania)

### Come Ripristinare

1. Accedere alla [Supabase Dashboard](https://supabase.com/dashboard)
2. Selezionare il progetto MedLav
3. Navigare su **Settings > Database > Backups**
4. Selezionare **Point in Time** e scegliere data/ora desiderata
5. Confermare il ripristino — il database verra riportato allo stato selezionato

> **Attenzione**: il ripristino PITR sovrascrive lo stato corrente del database. Eseguire solo in caso di necessita reale.

### Backup Manuale (Admin)

L'admin puo esportare dati tramite:

- **JSON export**: dall'admin panel, sezione esportazione dati
- **pg_dump**: accesso diretto alla connection string (solo da IP autorizzati)
- **Supabase CLI**: `supabase db dump --project-ref <ref> > backup.sql`

### Cosa e Coperto

| Dato | Backup PITR | Export manuale |
|------|:-----------:|:--------------:|
| Casi e metadati | Si | Si |
| Eventi clinici | Si | Si |
| Report generati | Si | Si |
| Documenti (metadata) | Si | Si |
| File (Storage) | No* | No* |
| Auth users | Si | No |

\* I file su Supabase Storage hanno backup separato gestito da Supabase.

### Frequenza Consigliata

- **PITR**: automatico, continuo (nessuna azione richiesta)
- **Export manuale**: settimanale o prima di operazioni critiche (migrazioni, aggiornamenti schema)
