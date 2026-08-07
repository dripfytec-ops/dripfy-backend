DROP INDEX "leads_tenant_id_cpf_key";
CREATE UNIQUE INDEX "leads_tenant_id_cpf_canal_id_key" ON "leads"("tenant_id", "cpf", "canal_id");
