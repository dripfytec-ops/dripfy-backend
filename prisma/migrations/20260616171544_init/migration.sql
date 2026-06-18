-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin_master', 'lojista_admin', 'atendente');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('balde_geral', 'aguardando_resposta', 'em_atendimento', 'finalizado');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('pausado', 'rodando', 'concluido');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ativo', 'inativo', 'trial');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "nome_empresa" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status_assinatura" "SubscriptionStatus" NOT NULL DEFAULT 'trial',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'atendente',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_configs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "phone_number_id" TEXT NOT NULL,
    "waba_id" TEXT NOT NULL,
    "meta_access_token" TEXT NOT NULL,
    "template_boas_vindas" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meta_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatwoot_configs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "chatwoot_url" TEXT NOT NULL,
    "chatwoot_api_token" TEXT NOT NULL,
    "inbox_id" INTEGER,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chatwoot_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id_number" SERIAL NOT NULL,
    "id_uuid" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "cpf" TEXT,
    "nome" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "status_atual" "LeadStatus" NOT NULL DEFAULT 'balde_geral',
    "disparado" BOOLEAN NOT NULL DEFAULT false,
    "campanha_id" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id_number")
);

-- CreateTable
CREATE TABLE "campanhas_filas" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "nome_campanha" TEXT NOT NULL,
    "template_name" TEXT NOT NULL,
    "template_params" JSONB,
    "delay_segundos" INTEGER NOT NULL DEFAULT 60,
    "status" "CampaignStatus" NOT NULL DEFAULT 'pausado',
    "total_leads" INTEGER NOT NULL DEFAULT 0,
    "enviados" INTEGER NOT NULL DEFAULT 0,
    "erros" INTEGER NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campanhas_filas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_email_key" ON "users"("tenant_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "meta_configs_tenant_id_key" ON "meta_configs"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "chatwoot_configs_tenant_id_key" ON "chatwoot_configs"("tenant_id");

-- CreateIndex
CREATE INDEX "leads_tenant_id_status_atual_idx" ON "leads"("tenant_id", "status_atual");

-- CreateIndex
CREATE INDEX "leads_tenant_id_disparado_idx" ON "leads"("tenant_id", "disparado");

-- CreateIndex
CREATE UNIQUE INDEX "leads_tenant_id_cpf_key" ON "leads"("tenant_id", "cpf");

-- CreateIndex
CREATE INDEX "campanhas_filas_tenant_id_status_idx" ON "campanhas_filas"("tenant_id", "status");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_configs" ADD CONSTRAINT "meta_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatwoot_configs" ADD CONSTRAINT "chatwoot_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_campanha_id_fkey" FOREIGN KEY ("campanha_id") REFERENCES "campanhas_filas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campanhas_filas" ADD CONSTRAINT "campanhas_filas_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
