-- Árvores de indicadores financeiros (data-fix pontual, roda uma vez).
-- Cria: 4 indicadores CALCULATED novos (DuPont), relações causais e a estrutura
-- "Árvores Financeiras" com 4 mapas em árvore. NÃO altera nada existente:
-- tudo é guardado por NOT EXISTS / ON CONFLICT DO NOTHING; mapas/estrutura têm
-- nomes próprios; relações novas nunca aparecem em mapas antigos (os pares
-- nunca coexistem como entries de um mapa existente).
DO $$
DECLARE
  admin_id TEXT;
  cat_id TEXT;
  struct_id TEXT;
  map_id TEXT;
  nodes JSONB;
  r RECORD;
  ind_id TEXT;
  m RECORD;
BEGIN
  SELECT id INTO admin_id FROM users WHERE email = 'admin@coperdia.com.br';
  IF admin_id IS NULL THEN SELECT id INTO admin_id FROM users WHERE role = 'ADMIN' LIMIT 1; END IF;
  IF admin_id IS NULL THEN SELECT id INTO admin_id FROM users LIMIT 1; END IF;
  IF admin_id IS NULL THEN RETURN; END IF;

  -- ── 1. Novos indicadores calculados (análise DuPont) ────────────────────────
  -- (code, name, unit, direction, expression, descr) — variables resolvidas por code.
  FOR r IN
    SELECT * FROM (VALUES
      ('MARGEM_LIQUIDA', 'Margem Líquida', 'PERCENTAGE', 'HIGHER_IS_BETTER',
       '(LUCRO_LIQUIDO / RECEITA) * 100', ARRAY['LUCRO_LIQUIDO','RECEITA'],
       'Percentual da receita que vira lucro (Lucro Líquido ÷ Receita × 100). Mostra a eficiência do negócio em transformar vendas em resultado: quanto maior, mais rentável cada real vendido.'),
      ('GIRO_ATIVO', 'Giro do Ativo', 'INDEX', 'HIGHER_IS_BETTER',
       'RECEITA / abs(AT)', ARRAY['RECEITA','AT'],
       'Quantas vezes a receita "gira" o ativo total (Receita ÷ Ativo Total). Mede a produtividade dos recursos aplicados: quanto maior, mais vendas são geradas com a mesma estrutura.'),
      ('ALAVANCAGEM', 'Alavancagem Financeira', 'INDEX', 'LOWER_IS_BETTER',
       'abs(AT) / abs(PL)', ARRAY['AT','PL'],
       'Relação entre o ativo total e o capital próprio (Ativo Total ÷ Patrimônio Líquido). Acima de 1,0 indica uso de capital de terceiros para ampliar a operação: amplia o retorno, mas também o risco.'),
      ('MARGEM_EBITDA', 'Margem EBITDA', 'PERCENTAGE', 'HIGHER_IS_BETTER',
       '(EBITDA / RECEITA) * 100', ARRAY['EBITDA','RECEITA'],
       'Percentual da receita que vira geração de caixa operacional (EBITDA ÷ Receita × 100). Quanto maior, mais eficiente a operação antes dos efeitos financeiros e contábeis.')
    ) AS t(code, name, unit, direction, expression, var_codes, descr)
  LOOP
    -- só cria se os insumos existem e o indicador ainda não existe
    IF EXISTS (SELECT 1 FROM indicators WHERE code = r.code) THEN CONTINUE; END IF;
    IF (SELECT count(*) FROM indicators WHERE code = ANY(r.var_codes)) <> array_length(r.var_codes, 1) THEN CONTINUE; END IF;

    ind_id := 'arvfin_ind_' || lower(r.code);
    INSERT INTO indicators (id, code, name, description, category, type, unit, periodicity,
                            direction, accumulation, "decimalPlaces", source, "updatedAt")
    VALUES (ind_id, r.code, r.name, r.descr, 'Análise Financeira', 'CALCULATED', r.unit::"MeasureUnit",
            'MONTHLY', r.direction::"IndicatorDirection", 'AVERAGE', 2, 'ARVORE_FINANCEIRA', now());

    INSERT INTO formulas (id, "indicatorId", expression, variables, "updatedAt")
    VALUES ('arvfin_for_' || lower(r.code), ind_id, r.expression,
            (SELECT jsonb_object_agg(i.code, i.id) FROM indicators i WHERE i.code = ANY(r.var_codes)), now());
  END LOOP;

  -- ── 2. Relações causais (pai → filho/causa) ────────────────────────────────
  FOR r IN
    SELECT * FROM (VALUES
      -- DuPont
      ('ROE','MARGEM_LIQUIDA'), ('ROE','GIRO_ATIVO'), ('ROE','ALAVANCAGEM'),
      ('MARGEM_LIQUIDA','LUCRO_LIQUIDO'), ('MARGEM_LIQUIDA','RECEITA'),
      ('GIRO_ATIVO','RECEITA'), ('GIRO_ATIVO','AT'),
      ('ALAVANCAGEM','AT'), ('ALAVANCAGEM','PL'),
      ('MARGEM_EBITDA','EBITDA'), ('MARGEM_EBITDA','RECEITA'),
      -- Liquidez (índices → contas do balancete)
      ('LC','AC'), ('LC','PC'),
      ('LI','DISP'), ('LI','PC'),
      ('LG','AC'), ('LG','ARLP'), ('LG','PC'), ('LG','PNC'),
      ('CCL','AC'), ('CCL','PC'),
      -- Endividamento
      ('EG','PC'), ('EG','PNC'), ('EG','AT'),
      ('CEND','PC'), ('CEND','PNC'),
      ('GE','PC'), ('GE','PNC'), ('GE','PL'),
      ('IPL','IMOB'), ('IPL','PL')
    ) AS t(pcode, ccode)
  LOOP
    INSERT INTO indicator_relations (id, "parentId", "childId")
    SELECT 'arvfin_rel_' || lower(r.pcode) || '_' || lower(r.ccode), p.id, c.id
    FROM indicators p, indicators c
    WHERE p.code = r.pcode AND c.code = r.ccode
    ON CONFLICT ("parentId", "childId") DO NOTHING;
  END LOOP;

  -- ── 3. Estrutura + categoria ────────────────────────────────────────────────
  SELECT id INTO cat_id FROM map_categories WHERE name = 'Financeiro';
  IF cat_id IS NULL THEN SELECT id INTO cat_id FROM map_categories ORDER BY "sortOrder" LIMIT 1; END IF;
  IF cat_id IS NULL THEN
    cat_id := 'arvfin_cat';
    INSERT INTO map_categories (id, name, "userId", "updatedAt") VALUES (cat_id, 'Financeiro', admin_id, now());
  END IF;

  SELECT id INTO struct_id FROM map_structures WHERE name = 'Árvores Financeiras';
  IF struct_id IS NULL THEN
    struct_id := 'arvfin_struct';
    INSERT INTO map_structures (id, name, description, category, "createdBy", "updatedAt")
    VALUES (struct_id, 'Árvores Financeiras',
            'Árvores de decomposição causal: DuPont (ROE), Rentabilidade (ROIC), Liquidez e Endividamento',
            'Financeiro', admin_id, now());
  END IF;

  -- ── 4. Mapas em árvore (nome, nodes = code|level|x|y) ───────────────────────
  FOR m IN
    SELECT * FROM (VALUES
      ('Árvore DuPont (ROE)',
       'ROE = Margem Líquida × Giro do Ativo × Alavancagem',
       ARRAY['ROE|1|0|270','MARGEM_LIQUIDA|2|380|90','GIRO_ATIVO|2|380|270','ALAVANCAGEM|2|380|450',
             'LUCRO_LIQUIDO|3|760|0','RECEITA|3|760|180','AT|3|760|360','PL|3|760|540']),
      ('Árvore de Rentabilidade (ROIC)',
       'ROIC = NOPAT / Capital Investido, decomposto até receita, custos e capital de giro',
       ARRAY['ROIC|1|0|360','NOPAT|2|380|180','CAPITAL_INVESTIDO|2|380|540',
             'EBITDA|3|760|90','IMPOSTOS|3|760|270','ESTOQUES|3|760|450','CONTAS_RECEBER|3|760|630','ATIVO_IMOBILIZADO|3|760|810',
             'RECEITA|4|1140|0','CUSTOS|4|1140|180','DESPESAS|4|1140|360']),
      ('Árvore de Liquidez',
       'Índices de liquidez decompostos nas contas do balancete',
       ARRAY['LC|1|0|0','LI|1|0|180','LG|1|0|360','CCL|1|0|540',
             'AC|2|380|90','DISP|2|380|270','ARLP|2|380|450','PC|2|380|630','PNC|2|380|810']),
      ('Árvore de Endividamento',
       'Índices de endividamento decompostos nas contas do balancete',
       ARRAY['EG|1|0|0','CEND|1|0|180','GE|1|0|360','IPL|1|0|540',
             'PC|2|380|90','PNC|2|380|270','AT|2|380|450','PL|2|380|630','IMOB|2|380|810'])
    ) AS t(name, descr, node_defs)
  LOOP
    IF EXISTS (SELECT 1 FROM indicator_maps WHERE name = m.name AND "structureId" = struct_id) THEN CONTINUE; END IF;

    map_id := 'arvfin_map_' || md5(m.name);
    INSERT INTO indicator_maps (id, name, description, "categoryId", "structureId", "userId", "updatedAt")
    VALUES (map_id, m.name, m.descr, cat_id, struct_id, admin_id, now());

    nodes := '[]'::jsonb;
    FOR r IN SELECT split_part(d, '|', 1) AS code, split_part(d, '|', 2)::int AS lvl,
                    split_part(d, '|', 3)::float AS x, split_part(d, '|', 4)::float AS y
             FROM unnest(m.node_defs) AS d
    LOOP
      SELECT id INTO ind_id FROM indicators WHERE code = r.code;
      IF ind_id IS NULL THEN CONTINUE; END IF;
      INSERT INTO indicator_map_entries (id, "mapId", "indicatorId", "positionX", "positionY")
      VALUES ('arvfin_ent_' || md5(m.name || r.code), map_id, ind_id, r.x, r.y)
      ON CONFLICT ("mapId", "indicatorId") DO NOTHING;
      nodes := nodes || jsonb_build_array(jsonb_build_object(
        'id', ind_id,
        'position', jsonb_build_object('x', r.x, 'y', r.y),
        'data', jsonb_build_object('level', r.lvl)));
    END LOOP;

    UPDATE indicator_maps SET "flowData" = jsonb_build_object('nodes', nodes, 'edges', '[]'::jsonb)
    WHERE id = map_id;
  END LOOP;
END $$;
