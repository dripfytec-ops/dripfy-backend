-- CreateTable
CREATE TABLE "lead_activities" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "texto" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_LeadEtiquetas" (
    "A" TEXT NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateIndex
CREATE INDEX "lead_activities_lead_id_idx" ON "lead_activities"("lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "_LeadEtiquetas_AB_unique" ON "_LeadEtiquetas"("A", "B");

-- CreateIndex
CREATE INDEX "_LeadEtiquetas_B_index" ON "_LeadEtiquetas"("B");

-- AddForeignKey
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id_number") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_LeadEtiquetas" ADD CONSTRAINT "_LeadEtiquetas_A_fkey" FOREIGN KEY ("A") REFERENCES "etiquetas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_LeadEtiquetas" ADD CONSTRAINT "_LeadEtiquetas_B_fkey" FOREIGN KEY ("B") REFERENCES "leads"("id_number") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: copia a etiqueta única existente (etiqueta_id) para a nova relação
-- muitos-para-muitos, preservando os dados já cadastrados.
INSERT INTO "_LeadEtiquetas" ("A", "B")
SELECT "etiqueta_id", "id_number" FROM "leads" WHERE "etiqueta_id" IS NOT NULL;
