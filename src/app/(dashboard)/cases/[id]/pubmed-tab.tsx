'use client';

import { ExternalLink, BookOpen, Stethoscope, Scale } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export interface PubMedArticle {
  pmid: string;
  title: string;
  authors: string;
  journal: string;
  year: string;
  doi?: string;
}

export interface PubMedReference {
  query: string;
  category: 'diagnosis' | 'treatment' | 'causal_nexus';
  articles: PubMedArticle[];
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  diagnosis: { label: 'Diagnosi e linee guida', icon: BookOpen, color: 'text-blue-600' },
  treatment: { label: 'Trattamento e outcomes', icon: Stethoscope, color: 'text-green-600' },
  causal_nexus: { label: 'Nesso causale', icon: Scale, color: 'text-amber-600' },
};

interface PubMedTabProps {
  references: PubMedReference[];
}

export function PubMedTab({ references }: PubMedTabProps) {
  if (references.length === 0) {
    return (
      <Card className="rounded-xl">
        <CardContent className="py-12 text-center">
          <BookOpen className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground">
            Nessuna evidenza scientifica trovata per questo caso.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Le ricerche PubMed vengono effettuate automaticamente in base alle diagnosi estratte.
          </p>
        </CardContent>
      </Card>
    );
  }

  const totalArticles = references.reduce((sum, r) => sum + r.articles.length, 0);

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="flex items-center gap-3">
        <BookOpen className="h-5 w-5 text-primary" />
        <div>
          <p className="font-semibold">
            {totalArticles} {totalArticles === 1 ? 'articolo' : 'articoli'} trovati su PubMed
          </p>
          <p className="text-sm text-muted-foreground">
            Evidenze scientifiche a supporto dell&apos;analisi medico-legale
          </p>
        </div>
      </div>

      {/* References grouped by category */}
      {references.map((ref, refIdx) => {
        const config = CATEGORY_CONFIG[ref.category] ?? CATEGORY_CONFIG.diagnosis;
        const Icon = config.icon;

        return (
          <Card key={refIdx} className="rounded-xl">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Icon className={`h-4 w-4 ${config.color}`} />
                {config.label}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Ricerca: &quot;{ref.query}&quot;
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {ref.articles.map((article, artIdx) => (
                <div
                  key={article.pmid || artIdx}
                  className="rounded-lg border p-4 space-y-2 hover:bg-muted/30 transition-colors"
                >
                  <p className="font-medium text-sm leading-snug">{article.title}</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{article.authors}</span>
                    <span>&mdash;</span>
                    <span className="font-medium">{article.journal}</span>
                    <Badge variant="outline" className="text-[10px]">{article.year}</Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    {article.pmid && (
                      <a
                        href={`https://pubmed.ncbi.nlm.nih.gov/${article.pmid}/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        PubMed
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {article.doi && (
                      <a
                        href={`https://doi.org/${article.doi}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        DOI
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}

      <p className="text-xs text-muted-foreground text-center">
        Fonte: NCBI PubMed — National Library of Medicine
      </p>
    </div>
  );
}
