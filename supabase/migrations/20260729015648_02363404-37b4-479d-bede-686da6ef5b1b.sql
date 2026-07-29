
CREATE OR REPLACE FUNCTION public.mcp_run_readonly_sql(_query text, _limit integer DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  q text := btrim(coalesce(_query, ''));
  lim integer := least(greatest(coalesce(_limit, 200), 1), 1000);
  result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  q := regexp_replace(q, ';\s*$', '');

  IF q = '' THEN
    RAISE EXCEPTION 'Empty query';
  END IF;
  IF position(';' in q) > 0 THEN
    RAISE EXCEPTION 'Multiple statements are not allowed';
  END IF;
  IF q !~* '^(select|with)\s' THEN
    RAISE EXCEPTION 'Only a single SELECT (or WITH ... SELECT) statement is allowed';
  END IF;
  IF q ~* '(^|[^a-z_])(insert|update|delete|merge|alter|drop|create|grant|revoke|truncate|comment|vacuum|analyze|copy|call|do|set|reset|refresh|reindex|cluster|listen|notify|lock|prepare|execute|begin|commit|rollback|savepoint|security\s+label)([^a-z_]|$)' THEN
    RAISE EXCEPTION 'Query contains a disallowed keyword; only read-only SELECT queries are permitted';
  END IF;

  -- Hard enforcement: any write attempt aborts inside a read-only transaction.
  PERFORM set_config('transaction_read_only', 'on', true);
  PERFORM set_config('statement_timeout', '15000', true);

  EXECUTE format(
    'SELECT coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) FROM (SELECT * FROM (%s) AS q LIMIT %s) AS t',
    q, lim
  ) INTO result;

  RETURN jsonb_build_object('row_limit', lim, 'row_count', jsonb_array_length(result), 'rows', result);
END;
$fn$;

REVOKE ALL ON FUNCTION public.mcp_run_readonly_sql(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_run_readonly_sql(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_run_readonly_sql(text, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.mcp_describe_table(_table_name text, _schema text DEFAULT 'public')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  cols jsonb;
  fks_out jsonb;
  fks_in jsonb;
  rel oid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT c.oid INTO rel
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = _schema AND c.relname = _table_name AND c.relkind IN ('r','v','m','p','f');

  IF rel IS NULL THEN
    RAISE EXCEPTION 'Table %.% not found', _schema, _table_name;
  END IF;

  SELECT coalesce(jsonb_agg(x ORDER BY x->>'position'), '[]'::jsonb) INTO cols
  FROM (
    SELECT jsonb_build_object(
      'position', a.attnum,
      'column', a.attname,
      'data_type', format_type(a.atttypid, a.atttypmod),
      'is_nullable', NOT a.attnotnull,
      'default', pg_get_expr(d.adbin, d.adrelid),
      'is_identity', a.attidentity <> '',
      'enum_labels', (
        SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder)
        FROM pg_enum e WHERE e.enumtypid = a.atttypid
      )
    ) AS x
    FROM pg_attribute a
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE a.attrelid = rel AND a.attnum > 0 AND NOT a.attisdropped
  ) s;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'constraint', con.conname,
    'definition', pg_get_constraintdef(con.oid),
    'references', (SELECT n2.nspname || '.' || c2.relname FROM pg_class c2 JOIN pg_namespace n2 ON n2.oid = c2.relnamespace WHERE c2.oid = con.confrelid)
  )), '[]'::jsonb) INTO fks_out
  FROM pg_constraint con WHERE con.conrelid = rel AND con.contype = 'f';

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'constraint', con.conname,
    'definition', pg_get_constraintdef(con.oid),
    'from_table', (SELECT n2.nspname || '.' || c2.relname FROM pg_class c2 JOIN pg_namespace n2 ON n2.oid = c2.relnamespace WHERE c2.oid = con.conrelid)
  )), '[]'::jsonb) INTO fks_in
  FROM pg_constraint con WHERE con.confrelid = rel AND con.contype = 'f';

  RETURN jsonb_build_object(
    'schema', _schema,
    'table', _table_name,
    'columns', cols,
    'foreign_keys_out', fks_out,
    'foreign_keys_in', fks_in
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.mcp_describe_table(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_describe_table(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_describe_table(text, text) TO service_role;
