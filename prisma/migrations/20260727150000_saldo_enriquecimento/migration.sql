-- CreateEnum
CREATE TYPE "EnriquecimentoTransacaoTipo" AS ENUM ('compra', 'consumo', 'ajuste');

-- CreateEnum
CREATE TYPE "EnriquecimentoCompraStatus" AS ENUM ('pendente', 'pago', 'cancelado');

-- AlterTable
ALTER TABLE "enriquecimento_solicitacoes" ADD COLUMN     "quantidade_leads" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "creditos_enriquecimento_saldo" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "valor_credito_enriquecimento" DECIMAL(10,2) NOT NULL DEFAULT 0.07;

-- CreateTable
CREATE TABLE "enriquecimento_transacoes" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "tipo" "EnriquecimentoTransacaoTipo" NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "saldo_apos" INTEGER NOT NULL,
    "descricao" TEXT NOT NULL,
    "solicitacao_id" TEXT,
    "compra_id" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enriquecimento_transacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enriquecimento_compras_credito" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "quantidade_creditos" INTEGER NOT NULL,
    "valor_total" DECIMAL(10,2) NOT NULL,
    "status" "EnriquecimentoCompraStatus" NOT NULL DEFAULT 'pendente',
    "pix_copia_cola" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pago_em" TIMESTAMP(3),

    CONSTRAINT "enriquecimento_compras_credito_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "enriquecimento_transacoes_tenant_id_criado_em_idx" ON "enriquecimento_transacoes"("tenant_id", "criado_em");

-- CreateIndex
CREATE INDEX "enriquecimento_compras_credito_tenant_id_criado_em_idx" ON "enriquecimento_compras_credito"("tenant_id", "criado_em");

-- AddForeignKey
ALTER TABLE "enriquecimento_transacoes" ADD CONSTRAINT "enriquecimento_transacoes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enriquecimento_compras_credito" ADD CONSTRAINT "enriquecimento_compras_credito_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
