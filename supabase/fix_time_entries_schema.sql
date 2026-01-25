-- ============================================================
-- FIX: time_entries Schema für Travel/Break Support
-- ============================================================
-- Dieses Script prüft und repariert die Datenbankstruktur
-- Ausführen im Supabase Dashboard unter SQL Editor
-- ============================================================

-- 1. DIAGNOSE: Zeige aktuellen Zustand
DO $$
DECLARE
  entry_type_exists BOOLEAN;
  property_nullable TEXT;
  constraint_exists BOOLEAN;
BEGIN
  -- Prüfe entry_type Spalte
  SELECT EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'time_entries' AND column_name = 'entry_type'
  ) INTO entry_type_exists;

  -- Prüfe ob property_id nullable ist
  SELECT is_nullable FROM information_schema.columns
  WHERE table_name = 'time_entries' AND column_name = 'property_id'
  INTO property_nullable;

  -- Prüfe CHECK constraint
  SELECT EXISTS(
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'time_entries'::regclass
    AND conname = 'check_entry_type_property_id'
  ) INTO constraint_exists;

  RAISE NOTICE '========================================';
  RAISE NOTICE 'DIAGNOSE - Aktueller Zustand:';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'entry_type Spalte existiert: %', entry_type_exists;
  RAISE NOTICE 'property_id ist nullable: %', COALESCE(property_nullable, 'SPALTE FEHLT');
  RAISE NOTICE 'CHECK constraint existiert: %', constraint_exists;
  RAISE NOTICE '========================================';
END $$;

-- 2. ENUM TYPE: Erstelle falls nicht vorhanden
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'time_entry_type') THEN
    CREATE TYPE time_entry_type AS ENUM ('property', 'travel', 'break');
    RAISE NOTICE 'ERSTELLT: time_entry_type ENUM';
  ELSE
    RAISE NOTICE 'OK: time_entry_type ENUM existiert bereits';
  END IF;
END $$;

-- 3. ENTRY_TYPE SPALTE: Füge hinzu falls nicht vorhanden
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'time_entries' AND column_name = 'entry_type'
  ) THEN
    ALTER TABLE time_entries ADD COLUMN entry_type time_entry_type DEFAULT 'property';
    RAISE NOTICE 'ERSTELLT: entry_type Spalte';
  ELSE
    RAISE NOTICE 'OK: entry_type Spalte existiert bereits';
  END IF;
END $$;

-- 4. PROPERTY_ID NULLABLE: Mache nullable falls NOT NULL
DO $$
DECLARE
  is_nullable_val TEXT;
BEGIN
  SELECT is_nullable FROM information_schema.columns
  WHERE table_name = 'time_entries' AND column_name = 'property_id'
  INTO is_nullable_val;

  IF is_nullable_val = 'NO' THEN
    ALTER TABLE time_entries ALTER COLUMN property_id DROP NOT NULL;
    RAISE NOTICE 'GEÄNDERT: property_id ist jetzt nullable';
  ELSE
    RAISE NOTICE 'OK: property_id ist bereits nullable';
  END IF;
END $$;

-- 5. DATEN KORRIGIEREN: Bestehende Einträge mit NULL property_id als 'travel' markieren
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  -- Setze entry_type für bestehende Einträge ohne property_id
  UPDATE time_entries
  SET entry_type = 'travel'
  WHERE property_id IS NULL AND (entry_type IS NULL OR entry_type = 'property');

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  IF updated_count > 0 THEN
    RAISE NOTICE 'KORRIGIERT: % Einträge ohne property_id als travel markiert', updated_count;
  ELSE
    RAISE NOTICE 'OK: Keine inkonsistenten Daten gefunden';
  END IF;

  -- Stelle sicher dass alle Einträge mit property_id als 'property' markiert sind
  UPDATE time_entries
  SET entry_type = 'property'
  WHERE property_id IS NOT NULL AND entry_type IS NULL;

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  IF updated_count > 0 THEN
    RAISE NOTICE 'KORRIGIERT: % Einträge mit property_id als property markiert', updated_count;
  END IF;
END $$;

-- 6. CHECK CONSTRAINT: Entferne und erstelle neu
DO $$
BEGIN
  -- Erst löschen falls vorhanden (um sicher zu sein dass er korrekt ist)
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'time_entries'::regclass
    AND conname = 'check_entry_type_property_id'
  ) THEN
    ALTER TABLE time_entries DROP CONSTRAINT check_entry_type_property_id;
    RAISE NOTICE 'ENTFERNT: Alter CHECK constraint';
  END IF;
END $$;

-- Füge korrekten CHECK constraint hinzu
ALTER TABLE time_entries
ADD CONSTRAINT check_entry_type_property_id
CHECK (
  (entry_type = 'property' AND property_id IS NOT NULL) OR
  (entry_type IN ('travel', 'break') AND property_id IS NULL)
);

-- 7. INDEX: Erstelle falls nicht vorhanden
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'time_entries' AND indexname = 'idx_time_entries_entry_type'
  ) THEN
    CREATE INDEX idx_time_entries_entry_type ON time_entries(entry_type);
    RAISE NOTICE 'ERSTELLT: Index für entry_type';
  ELSE
    RAISE NOTICE 'OK: Index existiert bereits';
  END IF;
END $$;

-- 8. FINALE DIAGNOSE
DO $$
DECLARE
  entry_type_exists BOOLEAN;
  property_nullable TEXT;
  constraint_exists BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'time_entries' AND column_name = 'entry_type'
  ) INTO entry_type_exists;

  SELECT is_nullable FROM information_schema.columns
  WHERE table_name = 'time_entries' AND column_name = 'property_id'
  INTO property_nullable;

  SELECT EXISTS(
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'time_entries'::regclass
    AND conname = 'check_entry_type_property_id'
  ) INTO constraint_exists;

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'ERGEBNIS - Schema nach Fix:';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'entry_type Spalte: %', CASE WHEN entry_type_exists THEN 'OK' ELSE 'FEHLER' END;
  RAISE NOTICE 'property_id nullable: %', CASE WHEN property_nullable = 'YES' THEN 'OK' ELSE 'FEHLER' END;
  RAISE NOTICE 'CHECK constraint: %', CASE WHEN constraint_exists THEN 'OK' ELSE 'FEHLER' END;
  RAISE NOTICE '========================================';

  IF entry_type_exists AND property_nullable = 'YES' AND constraint_exists THEN
    RAISE NOTICE 'ERFOLG: Schema ist korrekt konfiguriert!';
    RAISE NOTICE 'Travel und Break Einträge sollten jetzt funktionieren.';
  ELSE
    RAISE NOTICE 'FEHLER: Schema-Probleme vorhanden. Bitte manuell prüfen.';
  END IF;
END $$;

-- 9. ZEIGE TABELLEN-STRUKTUR
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'time_entries'
ORDER BY ordinal_position;
