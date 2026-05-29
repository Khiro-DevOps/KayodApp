-- Fix inconsistent employment_type enum labels (hyphenated vs underscored)
-- Safe migration: create repair enum, copy string values, alter columns, drop old type, rename repair

DO $$
DECLARE
  desired_labels text[] := array['full_time','part_time','contract','intern'];
  tbl text[][] := ARRAY[ARRAY['public','job_postings','employment_type'], ARRAY['public','employees','employment_type']];
  i int;
BEGIN
  -- If type doesn't exist, create it with desired labels and exit
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'employment_type') THEN
    EXECUTE format('CREATE TYPE employment_type AS ENUM (''%s'')', array_to_string(desired_labels, ''','''));
    RAISE NOTICE 'Created employment_type with desired labels';
    RETURN;
  END IF;

  -- Ensure repair type exists
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'employment_type_repair') THEN
    EXECUTE format('CREATE TYPE employment_type_repair AS ENUM (''%s'')', array_to_string(desired_labels, ''','''));
    RAISE NOTICE 'Created employment_type_repair';
  END IF;

  -- For each known table.column, if present, convert column type to employment_type_repair using mapping
  FOR i IN array_lower(tbl,1)..array_upper(tbl,1) LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = tbl[i][1] AND table_name = tbl[i][2] AND column_name = tbl[i][3]
    ) THEN
      -- Fetch existing default expression (if any)
      DECLARE
        default_expr text;
        new_default text;
      BEGIN
        SELECT pg_get_expr(ad.adbin, ad.adrelid)
        INTO default_expr
        FROM pg_attrdef ad
        JOIN pg_attribute at ON at.attrelid = ad.adrelid AND at.attnum = ad.adnum
        JOIN pg_class c ON c.oid = ad.adrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = tbl[i][1] AND c.relname = tbl[i][2] AND at.attname = tbl[i][3]
        LIMIT 1;

        -- Drop default if present to allow type change
        IF default_expr IS NOT NULL THEN
          EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN %I DROP DEFAULT', tbl[i][1], tbl[i][2], tbl[i][3]);
        END IF;

        -- Alter column using CASE mapping; map legacy labels to repair values
        EXECUTE format(
          'ALTER TABLE %I.%I ALTER COLUMN %I TYPE employment_type_repair USING (CASE %I::text WHEN %L THEN %L WHEN %L THEN %L WHEN %L THEN %L ELSE %I::text END)::employment_type_repair',
          tbl[i][1], tbl[i][2], tbl[i][3], tbl[i][3],
          'full-time', 'full_time',
          'part-time', 'part_time',
          'internship', 'intern',
          tbl[i][3]
        );

        -- Restore default if it existed, mapping legacy values
        IF default_expr IS NOT NULL THEN
          IF default_expr LIKE '%full-time%' THEN
            new_default := '''full_time''::employment_type_repair';
          ELSIF default_expr LIKE '%part-time%' THEN
            new_default := '''part_time''::employment_type_repair';
          ELSIF default_expr LIKE '%internship%' THEN
            new_default := '''intern''::employment_type_repair';
          ELSE
            -- fallback: try to reuse same literal (may fail if not in enum)
            new_default := default_expr;
          END IF;

          -- Set the new default
          EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN %I SET DEFAULT %s', tbl[i][1], tbl[i][2], tbl[i][3], new_default);
        END IF;

        RAISE NOTICE 'Converted %I.%I.%I to employment_type_repair', tbl[i][1], tbl[i][2], tbl[i][3];
      END;
    END IF;
  END LOOP;

  RAISE NOTICE 'Converted columns to employment_type_repair. Please run any follow-up steps to rename types if desired.';
END
$$;
