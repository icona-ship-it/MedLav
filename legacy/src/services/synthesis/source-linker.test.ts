import { describe, it, expect } from 'vitest';
import { linkReportToEvents, type EventRef } from './source-linker';

const events: EventRef[] = [
  { orderNumber: 1, title: 'Prima visita ortopedica', eventDate: '2024-06-15' },
  { orderNumber: 2, title: 'RMN ginocchio destro', eventDate: '2024-06-28' },
  { orderNumber: 3, title: 'Intervento chirurgico meniscectomia', eventDate: '2024-07-22' },
  { orderNumber: 4, title: 'Controllo post-operatorio', eventDate: '2024-08-05' },
];

describe('linkReportToEvents', () => {
  it('should match explicit [Ev.N] references', () => {
    const sections = [
      { id: 'nesso', content: 'Come documentato [Ev.1] e confermato [Ev.3], il nesso causale...' },
    ];
    const result = linkReportToEvents(sections, events);
    const matches = result.sectionToEvents.get('nesso');
    expect(matches).toBeDefined();
    expect(matches).toHaveLength(2);
    expect(matches![0]).toEqual({ eventOrderNumber: 1, matchType: 'explicit', matchConfidence: 1.0 });
    expect(matches![1]).toEqual({ eventOrderNumber: 3, matchType: 'explicit', matchConfidence: 1.0 });
  });

  it('should match date references in DD.MM.YYYY format', () => {
    const sections = [
      { id: 'crono', content: 'In data 15.06.2024 il paziente si presentava alla prima visita.' },
    ];
    const result = linkReportToEvents(sections, events);
    const matches = result.sectionToEvents.get('crono');
    expect(matches).toBeDefined();
    expect(matches![0]).toEqual({ eventOrderNumber: 1, matchType: 'date', matchConfidence: 0.8 });
  });

  it('should match date references in DD/MM/YYYY format', () => {
    const sections = [
      { id: 'crono', content: 'In data 22/07/2024 veniva eseguito l\'intervento.' },
    ];
    const result = linkReportToEvents(sections, events);
    const matches = result.sectionToEvents.get('crono');
    expect(matches).toBeDefined();
    expect(matches![0].eventOrderNumber).toBe(3);
  });

  it('should match event titles via substring (4+ words)', () => {
    const longTitleEvents: EventRef[] = [
      { orderNumber: 10, title: 'Meniscectomia selettiva artroscopica ginocchio destro', eventDate: '2024-07-22' },
    ];
    const sections = [
      { id: 'analisi', content: 'La meniscectomia selettiva artroscopica ginocchio destro è stata eseguita...' },
    ];
    const result = linkReportToEvents(sections, longTitleEvents);
    const matches = result.sectionToEvents.get('analisi');
    expect(matches).toBeDefined();
    expect(matches![0]).toEqual({ eventOrderNumber: 10, matchType: 'title', matchConfidence: 0.6 });
  });

  it('should not match short titles (less than 4 words)', () => {
    const sections = [
      { id: 'sec', content: 'Il Controllo post-operatorio ha mostrato miglioramenti.' },
    ];
    const result = linkReportToEvents(sections, events);
    const matches = result.sectionToEvents.get('sec');
    // "Controllo post-operatorio" is only 2 words — should NOT match
    expect(matches).toBeUndefined();
  });

  it('should deduplicate matches across strategies', () => {
    const sections = [
      { id: 'sec', content: 'Come da [Ev.1], in data 15.06.2024 la Prima visita ortopedica...' },
    ];
    const result = linkReportToEvents(sections, events);
    const matches = result.sectionToEvents.get('sec');
    // Should match only once (explicit wins)
    expect(matches).toBeDefined();
    expect(matches).toHaveLength(1);
    expect(matches![0].matchType).toBe('explicit');
  });

  it('should build reverse map (event to sections)', () => {
    const sections = [
      { id: 'crono', content: 'In data 15.06.2024 il paziente...' },
      { id: 'nesso', content: 'Come documentato [Ev.1]...' },
    ];
    const result = linkReportToEvents(sections, events);
    const sections1 = result.eventToSections.get(1);
    expect(sections1).toEqual(['crono', 'nesso']);
  });

  it('should handle no matches', () => {
    const sections = [
      { id: 'intro', content: 'Questo è un testo generico senza riferimenti.' },
    ];
    const result = linkReportToEvents(sections, events);
    expect(result.sectionToEvents.size).toBe(0);
    expect(result.eventToSections.size).toBe(0);
  });

  it('should handle invalid [Ev.N] references gracefully', () => {
    const sections = [
      { id: 'sec', content: 'Come da [Ev.99], questo evento non esiste.' },
    ];
    const result = linkReportToEvents(sections, events);
    expect(result.sectionToEvents.size).toBe(0);
  });
});
