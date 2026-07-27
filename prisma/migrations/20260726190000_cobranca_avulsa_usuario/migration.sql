-- CreateEnum
CREATE TYPE "CobrancaAvulsaStatus" AS ENUM ('pendente', 'pago', 'cancelado');

-- CreateTable
CREATE TABLE "cobrancas_avulsas_usuario" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "status" "CobrancaAvulsaStatus" NOT NULL DEFAULT 'pendente',
    "pix_copia_cola" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pago_em" TIMESTAMP(3),

    CONSTRAINT "cobrancas_avulsas_usuario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cobrancas_avulsas_usuario_tenant_id_criado_em_idx" ON "cobrancas_avulsas_usuario"("tenant_id", "criado_em");

-- AddForeignKey
ALTER TABLE "cobrancas_avulsas_usuario" ADD CONSTRAINT "cobrancas_avulsas_usuario_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cobrancas_avulsas_usuario" ADD CONSTRAINT "cobrancas_avulsas_usuario_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
