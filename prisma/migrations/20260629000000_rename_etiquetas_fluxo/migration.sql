-- Renomeia as etiquetas sistema para refletir o fluxo do lojista:
-- Coluna 1 (slug=disparados):  leads após disparo de campanha
-- Coluna 2 (slug=responderam): leads que responderam a mensagem

UPDATE "etiquetas" SET "nome" = 'Disparados',  "slug" = 'disparados'
  WHERE "slug" = 'balde_geral';

UPDATE "etiquetas" SET "nome" = 'Responderam', "slug" = 'responderam'
  WHERE "slug" = 'aguardando_resposta';

-- Em Atendimento e Finalizado viram colunas customizáveis (deletáveis pelo lojista)
UPDATE "etiquetas" SET "slug" = NULL
  WHERE "slug" IN ('em_atendimento', 'finalizado');
