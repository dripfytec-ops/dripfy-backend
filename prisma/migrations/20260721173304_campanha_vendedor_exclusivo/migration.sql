ALTER TABLE "dm_campanhas" ADD COLUMN "vendedor_id" TEXT;

ALTER TABLE "dm_campanhas" ADD CONSTRAINT "dm_campanhas_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
