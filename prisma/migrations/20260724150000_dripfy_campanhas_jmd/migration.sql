-- CreateEnum
CREATE TYPE "DmCampanhaTipo" AS ENUM ('proprio', 'dripfy');

-- CreateEnum
CREATE TYPE "DmCampanhaPrioridade" AS ENUM ('baixa', 'media', 'alta');

-- CreateEnum
CREATE TYPE "DmFinanceiroStatus" AS ENUM ('pendente', 'pago');

-- CreateEnum
CREATE TYPE "DmMidiaTipo" AS ENUM ('nenhuma', 'imagem', 'video');

-- AlterEnum
ALTER TYPE "DmCampanhaStatus" ADD VALUE 'aguardando_pagamento';

-- AlterTable
ALTER TABLE "dm_campanhas" ADD COLUMN     "aprovado_em" TIMESTAMP(3),
ADD COLUMN     "aprovado_por" TEXT,
ADD COLUMN     "financeiro_status" "DmFinanceiroStatus",
ADD COLUMN     "foto_perfil_url" TEXT,
ADD COLUMN     "link_botao" TEXT,
ADD COLUMN     "mensagem_texto" TEXT,
ADD COLUMN     "midia_tipo" "DmMidiaTipo",
ADD COLUMN     "midia_url" TEXT,
ADD COLUMN     "prioridade" "DmCampanhaPrioridade" NOT NULL DEFAULT 'media',
ADD COLUMN     "tipo" "DmCampanhaTipo" NOT NULL DEFAULT 'proprio',
ALTER COLUMN "template_name" DROP NOT NULL;

-- CreateTable
CREATE TABLE "dm_modelos_mensagem" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "link_botao" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dm_modelos_mensagem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dm_modelos_mensagem_tenant_id_idx" ON "dm_modelos_mensagem"("tenant_id");

-- CreateIndex
CREATE INDEX "dm_campanhas_tipo_financeiro_status_idx" ON "dm_campanhas"("tipo", "financeiro_status");

-- AddForeignKey
ALTER TABLE "dm_modelos_mensagem" ADD CONSTRAINT "dm_modelos_mensagem_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
