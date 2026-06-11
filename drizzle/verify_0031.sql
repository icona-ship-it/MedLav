-- Verifica 0031: la allowlist MIME del bucket 'documents' include i formati testo.
-- Atteso: una riga con ok_text_xml = true, ok_app_xml = true, ok_plain = true, ok_webp = true.

SELECT
  id,
  allowed_mime_types @> ARRAY['text/xml']        AS ok_text_xml,
  allowed_mime_types @> ARRAY['application/xml'] AS ok_app_xml,
  allowed_mime_types @> ARRAY['text/plain']      AS ok_plain,
  allowed_mime_types @> ARRAY['image/webp']      AS ok_webp
FROM storage.buckets
WHERE id = 'documents';
