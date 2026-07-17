CREATE TABLE "bm_tokens" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bm_tokens_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bm_tokens_tenant_id_idx" ON "bm_tokens"("tenant_id");

ALTER TABLE "bm_tokens" ADD CONSTRAINT "bm_tokens_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
