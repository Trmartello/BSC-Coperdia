-- Casas decimais exibidas por indicador (default 2)
ALTER TABLE "indicators" ADD COLUMN "decimalPlaces" INTEGER NOT NULL DEFAULT 2;
