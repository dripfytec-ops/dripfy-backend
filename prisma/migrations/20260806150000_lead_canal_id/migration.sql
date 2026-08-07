ALTER TABLE "leads" ADD COLUMN "canal_id" TEXT;
ALTER TABLE "leads" ADD CONSTRAINT "leads_canal_id_fkey" FOREIGN KEY ("canal_id") REFERENCES "dm_canais"("id") ON DELETE SET NULL ON UPDATE CASCADE;
