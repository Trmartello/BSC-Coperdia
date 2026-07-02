-- Descrição automática para indicadores CALCULATED ainda sem descrição
-- (ex.: criados pelo usuário via formulário com fórmulas). Data-fix pontual:
-- monta a leitura da fórmula trocando cada alias pelo nome do indicador
-- e acrescenta a interpretação da direção. Não sobrescreve descrições existentes.
DO $$
DECLARE
  rec RECORD;
  v RECORD;
  expr TEXT;
BEGIN
  FOR rec IN
    SELECT i.id, i.direction, f.expression, f.variables
    FROM indicators i JOIN formulas f ON f."indicatorId" = i.id
    WHERE i.type = 'CALCULATED' AND (i.description IS NULL OR i.description = '')
  LOOP
    expr := rec.expression;
    FOR v IN
      SELECT t.key AS alias, ind.name AS name
      FROM jsonb_each_text(rec.variables::jsonb) AS t(key, val)
      JOIN indicators ind ON ind.id = t.val
      ORDER BY length(t.key) DESC
    LOOP
      expr := regexp_replace(expr, '\m' || v.alias || '\M', v.name, 'g');
    END LOOP;
    expr := replace(replace(expr, 'abs(', '('), '*', E'×');
    UPDATE indicators SET description =
      'Indicador calculado pela fórmula: ' || expr || '. ' ||
      CASE WHEN rec.direction = 'HIGHER_IS_BETTER'
        THEN 'Quanto maior o resultado, melhor para o negócio.'
        ELSE 'Quanto menor o resultado, melhor para o negócio.' END
    WHERE id = rec.id;
  END LOOP;
END $$;
