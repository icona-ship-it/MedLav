export interface PeriziaMetadataUI {
  tribunale?: string;
  sezione?: string;
  rgNumber?: string;
  judgeName?: string;
  ctuName?: string;
  ctuTitle?: string;
  ctpRicorrente?: string;
  ctpResistente?: string;
  parteRicorrente?: string;
  parteResistente?: string;
  dataIncarico?: string;
  dataOperazioni?: string;
  dataDeposito?: string;
  quesiti?: string[];
  speseMediche?: string;
  esameObiettivo?: string;
  fondoSpese?: string;
}

export interface CaseData {
  id: string;
  code: string;
  case_type: string;
  case_types?: string[];
  case_role: string;
  patient_initials: string | null;
  practice_reference: string | null;
  notes: string | null;
  status: string;
  perizia_metadata?: PeriziaMetadataUI | null;
}

export interface Document {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  processing_status: string;
  processing_error: string | null;
  created_at: string;
}

export interface EventRow {
  id: string;
  order_number: number;
  event_date: string;
  date_precision: string;
  event_type: string;
  title: string;
  description: string;
  source_type: string;
  document_id: string | null;
  diagnosis: string | null;
  doctor: string | null;
  facility: string | null;
  confidence: number;
  requires_verification: boolean;
  reliability_notes: string | null;
  expert_notes: string | null;
  source_text: string | null;
  source_pages: string | null;
  extraction_pass: string | null;
}

export interface AnomalyRow {
  id: string;
  anomaly_type: string;
  severity: string;
  description: string;
  involved_events: string | null;
  suggestion: string | null;
}

export interface MissingDocRow {
  id: string;
  document_name: string;
  reason: string;
  related_event: string | null;
}

export interface ReportRow {
  id: string;
  version: number;
  report_status: string;
  synthesis: string | null;
}
