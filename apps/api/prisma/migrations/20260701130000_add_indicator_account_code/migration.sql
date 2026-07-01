-- Balancete import: chave estável para upsert idempotente + origem
ALTER TABLE "indicators" ADD COLUMN "accountCode" TEXT;
ALTER TABLE "indicators" ADD COLUMN "source" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "indicators_accountCode_key" ON "indicators"("accountCode");
