-- CreateEnum
CREATE TYPE "CreditoTransacaoTipo" AS ENUM ('compra', 'consumo', 'ajuste');

-- CreateTable
CREATE TABLE "credito_transacoes" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "tipo" "CreditoTransacaoTipo" NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "saldo_apos" INTEGER NOT NULL,
    "descricao" TEXT NOT NULL,
    "campanha_id" TEXT,
    "invoice_id" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credito_transacoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "credito_transacoes_tenant_id_criado_em_idx" ON "credito_transacoes"("tenant_id", "criado_em");

-- AddForeignKey
ALTER TABLE "credito_transacoes" ADD CONSTRAINT "credito_transacoes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
