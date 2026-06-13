-- 20260615000002_post_images_members.sql
--
-- El muro abre la subida de imágenes a TODOS los socios (antes era solo-admin:
-- "fotos de premios"). Ahora cualquier member puede adjuntar una foto a su post.
-- Para que sea seguro:
--   1. Subida: cualquier autenticado, pero SOLO a su propia carpeta {uid}/...
--      (el path que arma PostComposer es `${userId}/${uuid}.${ext}`).
--   2. Borrado: el dueño de la carpeta o un admin (moderación).
--   3. Límite de tamaño (5 MB) y MIME (jpg/png/webp) a nivel bucket — antes el
--      tope de 5 MB vivía solo en el cliente (sorteable).
--   4. Lectura pública: se mantiene.

-- ─── 1. Subida: autenticado, en su propia carpeta ─────────────────────
DROP POLICY IF EXISTS "post-images subida admin" ON storage.objects;
DROP POLICY IF EXISTS "post-images subida socio" ON storage.objects;
CREATE POLICY "post-images subida socio"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'post-images'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ─── 2. Borrado: dueño de la carpeta o admin ──────────────────────────
DROP POLICY IF EXISTS "post-images borrado admin" ON storage.objects;
DROP POLICY IF EXISTS "post-images borrado dueño o admin" ON storage.objects;
CREATE POLICY "post-images borrado dueño o admin"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'post-images'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin()
    )
  );

-- ─── 3. Límite de tamaño + MIME a nivel bucket ────────────────────────
UPDATE storage.buckets
   SET file_size_limit = 5242880,  -- 5 MB
       allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
 WHERE id = 'post-images';

-- ─── 4. Lectura pública (idempotente, se mantiene) ────────────────────
DROP POLICY IF EXISTS "post-images lectura pública" ON storage.objects;
CREATE POLICY "post-images lectura pública"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'post-images');
