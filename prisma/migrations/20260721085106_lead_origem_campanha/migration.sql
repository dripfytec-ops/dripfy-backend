ALTER TABLE "leads" ADD COLUMN "origem_campanha_id" TEXT;
ALTER TABLE "leads" ADD COLUMN "origem_campanha_nome" TEXT;

ALTER TABLE "leads" ADD CONSTRAINT "leads_origem_campanha_id_fkey" FOREIGN KEY ("origem_campanha_id") REFERENCES "dm_campanhas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
