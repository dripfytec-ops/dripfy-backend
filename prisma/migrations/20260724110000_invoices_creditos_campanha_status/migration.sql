-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('pendente', 'pago', 'expirado', 'cancelado');

-- AlterEnum
ALTER TYPE "DmCampanhaStatus" ADD VALUE 'aguardando_recarga';

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "creditos_saldo" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "quantidade_creditos" INTEGER NOT NULL,
    "valor_total" DECIMAL(10,2) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'pendente',
    "gateway" TEXT NOT NULL,
    "gateway_payment_id" TEXT,
    "pix_qrcode_base64" TEXT,
    "pix_copia_cola" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pago_em" TIMESTAMP(3),

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invoices_gateway_payment_id_key" ON "invoices"("gateway_payment_id");

-- CreateIndex
CREATE INDEX "invoices_tenant_id_idx" ON "invoices"("tenant_id");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
