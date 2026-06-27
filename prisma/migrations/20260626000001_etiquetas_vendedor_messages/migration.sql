-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('entrada', 'saida');

-- CreateTable etiquetas
CREATE TABLE "etiquetas" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cor_hexadecimal" TEXT NOT NULL DEFAULT '#6B7280',
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "slug" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "etiquetas_pkey" PRIMARY KEY ("id")
);

-- FK e índices de etiquetas
ALTER TABLE "etiquetas" ADD CONSTRAINT "etiquetas_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "etiquetas_tenant_id_slug_key" ON "etiquetas"("tenant_id", "slug");
CREATE INDEX "etiquetas_tenant_id_ordem_idx" ON "etiquetas"("tenant_id", "ordem");

-- Seed etiquetas padrão para cada tenant existente
INSERT INTO "etiquetas" ("id","tenant_id","nome","cor_hexadecimal","ordem","slug","atualizado_em")
SELECT gen_random_uuid()::text, id, 'Balde Geral',          '#6B7280', 0, 'balde_geral',          NOW() FROM "tenants";
INSERT INTO "etiquetas" ("id","tenant_id","nome","cor_hexadecimal","ordem","slug","atualizado_em")
SELECT gen_random_uuid()::text, id, 'Aguardando Resposta',  '#F59E0B', 1, 'aguardando_resposta',  NOW() FROM "tenants";
INSERT INTO "etiquetas" ("id","tenant_id","nome","cor_hexadecimal","ordem","slug","atualizado_em")
SELECT gen_random_uuid()::text, id, 'Em Atendimento',       '#3B82F6', 2, 'em_atendimento',       NOW() FROM "tenants";
INSERT INTO "etiquetas" ("id","tenant_id","nome","cor_hexadecimal","ordem","slug","atualizado_em")
SELECT gen_random_uuid()::text, id, 'Finalizado',           '#10B981', 3, 'finalizado',           NOW() FROM "tenants";

-- AlterTable leads: adicionar etiqueta_id e vendedor_id
ALTER TABLE "leads" ADD COLUMN "etiqueta_id" TEXT;
ALTER TABLE "leads" ADD COLUMN "vendedor_id" TEXT;

-- FK de leads
ALTER TABLE "leads" ADD CONSTRAINT "leads_etiqueta_id_fkey"
  FOREIGN KEY ("etiqueta_id") REFERENCES "etiquetas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "leads" ADD CONSTRAINT "leads_vendedor_id_fkey"
  FOREIGN KEY ("vendedor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "leads_tenant_id_etiqueta_id_idx" ON "leads"("tenant_id", "etiqueta_id");

-- Popular etiqueta_id nos leads existentes baseado no status_atual
UPDATE "leads" l
SET "etiqueta_id" = e.id
FROM "etiquetas" e
WHERE e.tenant_id = l.tenant_id
  AND e.slug = l.status_atual::text;

-- AlterTable messages: direction, content, template_name nullable
ALTER TABLE "messages" ADD COLUMN "direction" "MessageDirection" NOT NULL DEFAULT 'saida';
ALTER TABLE "messages" ADD COLUMN "content" TEXT;
ALTER TABLE "messages" ALTER COLUMN "template_name" DROP NOT NULL;
