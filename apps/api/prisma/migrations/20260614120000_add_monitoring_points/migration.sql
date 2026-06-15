-- AlterTable
ALTER TABLE "indicators" ADD COLUMN "monitoringPoints" TEXT[] DEFAULT ARRAY[]::TEXT[];
