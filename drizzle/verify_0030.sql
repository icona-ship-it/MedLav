-- Verifica migration 0030: il bucket 'documents' ha file_size_limit = 100 MB.
-- Atteso: una riga con file_size_limit = 104857600.

SELECT id, name, file_size_limit,
       (file_size_limit = 104857600) AS limit_ok
FROM storage.buckets
WHERE id = 'documents';
