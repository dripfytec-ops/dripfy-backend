-- Remove o antigo módulo de Campanhas/Canais (dados de teste, substituídos
-- pelo módulo "Disparo em Massa"). Mantém leads/messages, só solta as
-- referências que apontavam pro CampanhaFila/Canal antigos.

-- messages.canal_id deixa de referenciar "canais" (tabela será removida) —
-- fica como coluna solta, sem FK, apontando informalmente pro dm_canais novo.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT conname FROM pg_constraint WHERE conrelid = 'messages'::regclass AND contype = 'f' AND conname ILIKE '%canal%'
  LOOP
    EXECUTE 'ALTER TABLE "messages" DROP CONSTRAINT ' || quote_ident(r.conname);
  END LOOP;
END $$;

ALTER TABLE "messages" DROP COLUMN IF EXISTS "campanha_id";
ALTER TABLE "leads" DROP COLUMN IF EXISTS "campanha_id";

DROP TABLE IF EXISTS "campanhas_filas" CASCADE;
DROP TABLE IF EXISTS "canais" CASCADE;
DROP TYPE IF EXISTS "CampaignStatus";

-- Novos enums do módulo Disparo em Massa
CREATE TYPE "DmCampanhaStatus" AS ENUM ('rascunho', 'agendada', 'em_andamento', 'concluida', 'pausada');
CREATE TYPE "DmContatoStatus" AS ENUM ('pendente', 'enviando', 'enviado', 'entregue', 'lido', 'falha');

-- dm_canais
CREATE TABLE "dm_canais" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "waba_id" TEXT NOT NULL,
  "phone_number_id" TEXT NOT NULL,
  "access_token" TEXT NOT NULL,
  "bm_nome" TEXT,
  "lote_size" INTEGER,
  "delay_ms" INTEGER,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "dm_canais_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "dm_canais_tenant_id_idx" ON "dm_canais"("tenant_id");
CREATE INDEX "dm_canais_tenant_id_phone_number_id_idx" ON "dm_canais"("tenant_id", "phone_number_id");
ALTER TABLE "dm_canais" ADD CONSTRAINT "dm_canais_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- dm_campanhas
CREATE TABLE "dm_campanhas" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "canal_id" TEXT,
  "nome" TEXT NOT NULL,
  "template_name" TEXT NOT NULL,
  "template_params" JSONB DEFAULT '[]',
  "header_image_url" TEXT,
  "status" "DmCampanhaStatus" NOT NULL DEFAULT 'rascunho',
  "agendado_para" TIMESTAMP(3),
  "total_contatos" INTEGER NOT NULL DEFAULT 0,
  "enviados" INTEGER NOT NULL DEFAULT 0,
  "entregues" INTEGER NOT NULL DEFAULT 0,
  "falhas" INTEGER NOT NULL DEFAULT 0,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "iniciado_em" TIMESTAMP(3),
  CONSTRAINT "dm_campanhas_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "dm_campanhas_tenant_id_status_idx" ON "dm_campanhas"("tenant_id", "status");
ALTER TABLE "dm_campanhas" ADD CONSTRAINT "dm_campanhas_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dm_campanhas" ADD CONSTRAINT "dm_campanhas_canal_id_fkey" FOREIGN KEY ("canal_id") REFERENCES "dm_canais"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- dm_contatos
CREATE TABLE "dm_contatos" (
  "id" TEXT NOT NULL,
  "campanha_id" TEXT NOT NULL,
  "nome" TEXT,
  "telefone" TEXT NOT NULL,
  "status" "DmContatoStatus" NOT NULL DEFAULT 'pendente',
  "enviado_em" TIMESTAMP(3),
  "erro" TEXT,
  "message_id" TEXT,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "dm_contatos_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "dm_contatos_campanha_id_idx" ON "dm_contatos"("campanha_id");
CREATE INDEX "dm_contatos_campanha_id_status_idx" ON "dm_contatos"("campanha_id", "status");
CREATE INDEX "dm_contatos_message_id_idx" ON "dm_contatos"("message_id");
ALTER TABLE "dm_contatos" ADD CONSTRAINT "dm_contatos_campanha_id_fkey" FOREIGN KEY ("campanha_id") REFERENCES "dm_campanhas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
