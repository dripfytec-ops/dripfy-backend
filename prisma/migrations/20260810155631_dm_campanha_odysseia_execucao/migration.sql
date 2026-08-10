-- CreateEnum
CREATE TYPE "DmExecucaoDripfy" AS ENUM ('jmd', 'odysseia_whatsapp');

-- AlterTable
ALTER TABLE "dm_campanhas" ADD COLUMN     "execucao" "DmExecucaoDripfy" DEFAULT 'jmd',
ADD COLUMN     "odysseia_job_id" TEXT,
ADD COLUMN     "odysseia_status" TEXT,
ADD COLUMN     "odysseia_template_id" TEXT,
ADD COLUMN     "odysseia_receptive_fonte" TEXT;
