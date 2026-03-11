'use client';

import { useState, useCallback, useTransition } from 'react';
import { Star, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface ReportRatingProps {
  reportId: string;
  existingRating: number | null;
  existingComment: string | null;
  onRated: () => void;
}

export function ReportRating({
  reportId,
  existingRating,
  existingComment,
  onRated,
}: ReportRatingProps) {
  const [rating, setRating] = useState(existingRating ?? 0);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [comment, setComment] = useState(existingComment ?? '');
  const [showComment, setShowComment] = useState(!!existingComment);
  const [isSaving, startSave] = useTransition();
  const [hasChanges, setHasChanges] = useState(false);

  const handleStarClick = useCallback((star: number) => {
    setRating(star);
    setHasChanges(true);
  }, []);

  const handleSave = useCallback(() => {
    if (rating === 0) {
      toast.error('Seleziona almeno una stella');
      return;
    }
    startSave(async () => {
      try {
        const response = await fetch('/api/report-ratings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reportId,
            rating,
            comment: comment.trim() || null,
          }),
        });
        const result = await response.json() as { success: boolean; error?: string };
        if (!result.success) {
          toast.error(result.error ?? 'Errore salvataggio valutazione');
          return;
        }
        toast.success('Valutazione salvata');
        setHasChanges(false);
        onRated();
      } catch {
        toast.error('Errore di rete');
      }
    });
  }, [reportId, rating, comment, onRated]);

  const displayRating = hoveredStar > 0 ? hoveredStar : rating;

  return (
    <div className="mt-6 border-t pt-4">
      <p className="text-sm font-medium mb-2">
        {existingRating ? 'La tua valutazione' : 'Valuta questo report'}
      </p>
      <div className="flex items-center gap-1 mb-2">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => handleStarClick(star)}
            onMouseEnter={() => setHoveredStar(star)}
            onMouseLeave={() => setHoveredStar(0)}
            className="p-0.5 transition-transform hover:scale-110"
            aria-label={`${star} stelle`}
          >
            <Star
              className={`h-5 w-5 ${
                star <= displayRating
                  ? 'fill-yellow-400 text-yellow-400'
                  : 'text-muted-foreground/40'
              }`}
            />
          </button>
        ))}
        {rating > 0 && (
          <span className="ml-2 text-sm text-muted-foreground">{rating}/5</span>
        )}
      </div>
      {!showComment && (
        <button
          type="button"
          onClick={() => setShowComment(true)}
          className="text-xs text-muted-foreground hover:text-foreground underline"
        >
          Aggiungi commento
        </button>
      )}
      {showComment && (
        <Textarea
          placeholder="Commento opzionale sulla qualità del report..."
          value={comment}
          onChange={(e) => { setComment(e.target.value); setHasChanges(true); }}
          className="mt-2 min-h-[60px] text-sm"
          maxLength={1000}
        />
      )}
      {hasChanges && rating > 0 && (
        <Button
          size="sm"
          className="mt-2"
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <><Loader2 className="mr-1 h-3 w-3 animate-spin" />Salvataggio...</>
          ) : (
            'Salva valutazione'
          )}
        </Button>
      )}
    </div>
  );
}
