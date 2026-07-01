-- CreateTable: estruturas (containers) de mapas causais
CREATE TABLE "map_structures" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'Geral',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "map_structures_pkey" PRIMARY KEY ("id")
);

-- AddColumn: vínculo do mapa à estrutura
ALTER TABLE "indicator_maps" ADD COLUMN "structureId" TEXT;

-- CreateIndex
CREATE INDEX "indicator_maps_structureId_idx" ON "indicator_maps"("structureId");

-- AddForeignKey
ALTER TABLE "map_structures" ADD CONSTRAINT "map_structures_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "indicator_maps" ADD CONSTRAINT "indicator_maps_structureId_fkey" FOREIGN KEY ("structureId") REFERENCES "map_structures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: cria uma estrutura para cada categoria que já possua mapas
INSERT INTO "map_structures" ("id", "name", "description", "category", "createdBy", "createdAt", "updatedAt")
SELECT
    'struct_' || mc."id",
    mc."name",
    'Estrutura criada automaticamente a partir da categoria ' || mc."name",
    mc."name",
    mc."userId",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "map_categories" mc
WHERE EXISTS (SELECT 1 FROM "indicator_maps" im WHERE im."categoryId" = mc."id");

-- Backfill: vincula os mapas existentes à estrutura correspondente à sua categoria
UPDATE "indicator_maps" im
SET "structureId" = 'struct_' || im."categoryId"
WHERE im."structureId" IS NULL;
