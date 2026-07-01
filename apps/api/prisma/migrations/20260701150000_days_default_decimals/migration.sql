-- Indicadores em DIAS são naturalmente inteiros → default 0 casas decimais
-- (evita exibir "28,00 dias"). Ajustável por indicador depois.
UPDATE "indicators" SET "decimalPlaces" = 0 WHERE "unit" = 'DAYS';
