-- CreateEnum
CREATE TYPE "AccumulationMethod" AS ENUM ('SUM', 'AVERAGE', 'LAST');

-- AlterTable
ALTER TABLE "indicators" ADD COLUMN "accumulation" "AccumulationMethod" NOT NULL DEFAULT 'SUM';

-- Backfill: defaults inteligentes por unidade (consolidação YTD do modo "Acumular")
-- Prazos e taxas → média (somar dias/percentuais não faz sentido)
UPDATE "indicators" SET "accumulation" = 'AVERAGE' WHERE "unit" IN ('DAYS', 'PERCENTAGE', 'INDEX');

-- Saldos de balanço (itens de estoque/posição) → último saldo do período
UPDATE "indicators"
  SET "accumulation" = 'LAST'
  WHERE "code" IN ('ESTOQUES', 'CONTAS_RECEBER', 'ATIVO_IMOBILIZADO', 'PATRIMONIO', 'DIVIDA');
