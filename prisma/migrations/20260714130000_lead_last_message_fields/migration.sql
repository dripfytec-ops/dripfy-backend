-- AlterTable leads: campos de última mensagem / não lidas para a tela de Chat
ALTER TABLE "leads" ADD COLUMN "last_message_at" TIMESTAMP(3);
ALTER TABLE "leads" ADD COLUMN "last_message_preview" TEXT;
ALTER TABLE "leads" ADD COLUMN "unread_count" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "leads_tenant_id_last_message_at_idx" ON "leads"("tenant_id", "last_message_at");
