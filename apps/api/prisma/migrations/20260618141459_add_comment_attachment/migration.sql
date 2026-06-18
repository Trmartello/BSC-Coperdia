-- AlterTable
ALTER TABLE "plan_comments" ADD COLUMN     "attachmentMime" TEXT,
ADD COLUMN     "attachmentName" TEXT,
ADD COLUMN     "attachmentSize" INTEGER,
ADD COLUMN     "attachmentUrl" TEXT,
ALTER COLUMN "content" SET DEFAULT '';
