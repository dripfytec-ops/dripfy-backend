-- CreateEnum
CREATE TYPE "EnriquecimentoStatus" AS ENUM ('pendente', 'concluido');

-- CreateTable
CREATE TABLE "enriquecimento_solicitacoes" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "nome_arquivo_original" TEXT NOT NULL,
    "arquivo_original_url" TEXT NOT NULL,
    "observacoes" TEXT,
    "status" "EnriquecimentoStatus" NOT NULL DEFAULT 'pendente',
    "arquivo_processado_url" TEXT,
    "concluido_em" TIMESTAMP(3),
    "concluido_por" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enriquecimento_solicitacoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "enriquecimento_solicitacoes_tenant_id_criado_em_idx" ON "enriquecimento_solicitacoes"("tenant_id", "criado_em");

-- AddForeignKey
ALTER TABLE "enriquecimento_solicitacoes" ADD CONSTRAINT "enriquecimento_solicitacoes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
