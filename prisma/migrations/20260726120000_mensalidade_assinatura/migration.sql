-- CreateEnum
CREATE TYPE "MensalidadeFaturaStatus" AS ENUM ('pendente', 'pago', 'cancelado');

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "assinatura_bloqueada" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "proxima_cobranca_em" TIMESTAMP(3),
ADD COLUMN     "usuarios_inclusos" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "valor_mensalidade_base" DECIMAL(10,2) NOT NULL DEFAULT 300.00,
ADD COLUMN     "valor_usuario_adicional" DECIMAL(10,2) NOT NULL DEFAULT 50.00;

-- CreateTable
CREATE TABLE "mensalidade_faturas" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "usuarios_cobrados" INTEGER NOT NULL,
    "usuarios_extras" INTEGER NOT NULL,
    "valor_total" DECIMAL(10,2) NOT NULL,
    "status" "MensalidadeFaturaStatus" NOT NULL DEFAULT 'pendente',
    "vencimento" TIMESTAMP(3) NOT NULL,
    "pago_em" TIMESTAMP(3),
    "pix_qrcode_base64" TEXT,
    "pix_copia_cola" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensalidade_faturas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mensalidade_faturas_tenant_id_criado_em_idx" ON "mensalidade_faturas"("tenant_id", "criado_em");

-- CreateIndex
CREATE UNIQUE INDEX "mensalidade_faturas_tenant_id_competencia_key" ON "mensalidade_faturas"("tenant_id", "competencia");

-- AddForeignKey
ALTER TABLE "mensalidade_faturas" ADD CONSTRAINT "mensalidade_faturas_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: tenants já existentes ganham 30 dias de carência antes da
-- primeira cobrança de mensalidade, pra não cair inadimplente no ar.
UPDATE "tenants" SET "proxima_cobranca_em" = NOW() + INTERVAL '30 days' WHERE "proxima_cobranca_em" IS NULL;
