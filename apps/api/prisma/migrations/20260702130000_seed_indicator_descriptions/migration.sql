-- Descrições (conceito) dos indicadores gerenciais e índices de análise.
-- Data-fix pontual: roda uma vez; atualiza pelo code.

UPDATE indicators SET description = v.descr FROM (VALUES
  -- Estratégicos
  ('RECEITA', 'Total das vendas da cooperativa no período, já descontados impostos, devoluções e abatimentos. É a principal medida do volume de negócios: quanto maior, mais a cooperativa está vendendo.'),
  ('CUSTOS', 'Custo dos Produtos Vendidos (CPV): quanto custou produzir ou adquirir o que foi vendido no período (matéria-prima, insumos, produção). Quanto menor em relação à receita, maior a margem da operação.'),
  ('DESPESAS', 'Gastos necessários para manter a empresa funcionando que não estão ligados diretamente à produção: administrativo, comercial, logística. Reduzi-las melhora o resultado sem afetar a capacidade de vender.'),
  ('EBITDA', 'Lucro gerado pela operação antes de juros, impostos, depreciação e amortização (Receita − Custos − Despesas). Mostra a capacidade do negócio de gerar caixa com a própria atividade, sem efeitos financeiros e contábeis.'),
  ('IMPOSTOS', 'Impostos incidentes sobre o lucro (IR e CSLL) do período. Reduzem o lucro que sobra para a cooperativa e seus associados.'),
  ('NOPAT', 'Lucro operacional líquido após impostos (EBITDA − Impostos). Representa o ganho efetivo da operação, sem considerar o resultado financeiro, e é a base do cálculo do ROIC.'),
  ('LUCRO_LIQUIDO', 'Resultado final do período depois de todos os custos, despesas e impostos. É o que efetivamente sobra para reinvestir ou distribuir aos associados.'),
  ('CONTAS_RECEBER', 'Valores que clientes ainda devem à cooperativa por vendas a prazo. Quanto maior o saldo, mais capital fica "parado" esperando o recebimento, pressionando a necessidade de capital de giro.'),
  ('ESTOQUES', 'Valor dos produtos, insumos e mercadorias armazenados. Estoque alto imobiliza dinheiro e gera custos de armazenagem; o ideal é o menor nível que não comprometa vendas e produção.'),
  ('ATIVO_IMOBILIZADO', 'Bens de longo prazo usados na operação: fábricas, máquinas, veículos, instalações. Base produtiva da cooperativa — cresce com investimentos e reduz com depreciação e baixas.'),
  ('CAPITAL_GIRO', 'Recursos presos no ciclo operacional (Contas a Receber + Estoques). Quanto maior, mais dinheiro a empresa precisa manter aplicado só para girar a operação, antes de investir ou reduzir dívida.'),
  ('CAPITAL_INVESTIDO', 'Total de recursos aplicados no negócio: Capital de Giro + Ativo Imobilizado. É a base sobre a qual se mede o retorno da operação (ROIC).'),
  ('PATRIMONIO', 'Riqueza própria da cooperativa: o que sobra dos ativos depois de pagar todas as obrigações. Representa o capital dos associados acumulado ao longo do tempo.'),
  ('DIVIDA', 'Total de empréstimos e financiamentos contratados, de curto e longo prazo. Dívida alta aumenta a despesa com juros e o risco financeiro.'),
  ('FLUXO_CAIXA', 'Caixa que sobra após pagar a operação e os investimentos do período. Positivo, permite reduzir dívida e distribuir resultados; negativo, exige financiamento.'),
  ('ENDIVIDAMENTO', 'Percentual da dívida bruta em relação ao patrimônio líquido. Mostra quanto a cooperativa depende de capital de terceiros: acima de 100%, deve-se mais do que se tem de capital próprio.'),
  ('ROE', 'Retorno sobre o Patrimônio Líquido (Lucro Líquido ÷ PL × 100). Indica quanto o capital dos associados rendeu no período — deve superar aplicações financeiras de risco comparável.'),
  ('ROIC', 'Retorno sobre o Capital Investido (NOPAT ÷ Capital Investido × 100). Mede a eficiência da operação em gerar lucro com os recursos aplicados; deve superar o custo de captação do dinheiro.'),
  -- Capital de Giro
  ('PMR', 'Prazo Médio de Recebimento: quantos dias, em média, a cooperativa leva para receber dos clientes após a venda. Quanto menor, mais rápido o dinheiro volta ao caixa.'),
  ('PME', 'Prazo Médio de Estoque: quantos dias, em média, os produtos ficam armazenados antes de serem vendidos. Quanto menor, menos capital fica imobilizado em estoque.'),
  ('PMP', 'Prazo Médio de Pagamento: quantos dias, em média, a cooperativa leva para pagar seus fornecedores. Quanto maior (sem gerar multas ou perder descontos), mais tempo o caixa fica disponível.'),
  ('NCG', 'Necessidade de Capital de Giro em dias (PMR + PME − PMP): tempo entre pagar fornecedores e receber dos clientes. Quanto menor, menos recursos são necessários para financiar a operação.'),
  -- Análise Financeira (índices do balancete)
  ('LC', 'Liquidez Corrente (Ativo Circulante ÷ Passivo Circulante): capacidade de pagar as dívidas de curto prazo com os recursos de curto prazo. Acima de 1,0 indica folga; abaixo, risco de aperto de caixa.'),
  ('LI', 'Liquidez Imediata (Disponibilidades ÷ Passivo Circulante): quanto das dívidas de curto prazo pode ser quitado imediatamente, só com caixa e aplicações. É a medida mais conservadora de liquidez.'),
  ('LG', 'Liquidez Geral ((AC + Realizável a LP) ÷ (PC + Exigível a LP)): capacidade de pagar todas as obrigações, de curto e longo prazo, com os recursos realizáveis. Visão de solvência no horizonte total.'),
  ('CCL', 'Capital Circulante Líquido (Ativo Circulante − Passivo Circulante): sobra (ou falta) de recursos de curto prazo após cobrir as obrigações de curto prazo. Positivo indica folga financeira na operação.'),
  ('EG', 'Endividamento Geral (Capital de Terceiros ÷ Ativo Total × 100): percentual do ativo financiado por terceiros. Quanto menor, maior a independência financeira da cooperativa.'),
  ('CEND', 'Composição do Endividamento (Passivo Circulante ÷ Capital de Terceiros × 100): parcela da dívida que vence no curto prazo. Quanto menor, mais tempo para honrar os compromissos.'),
  ('GE', 'Grau de Endividamento (Capital de Terceiros ÷ Patrimônio Líquido × 100): quanto há de dívida para cada real de capital próprio. Acima de 100%, os credores financiam mais o negócio que os associados.'),
  ('IPL', 'Imobilização do Patrimônio Líquido (Imobilizado ÷ PL × 100): parcela do capital próprio aplicada em bens fixos. Quanto maior, menos capital próprio sobra para girar a operação, aumentando a dependência de terceiros.')
) AS v(code, descr)
WHERE indicators.code = v.code;
