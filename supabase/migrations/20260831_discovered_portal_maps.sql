-- ============================================================
-- Migration: discovered_portal_maps
-- Mapas de seletores descobertos autonomamente pelo engine de
-- leitura de portal. Um mapa por domínio: uma descoberta
-- beneficia todas as escolas que usam o mesmo sistema white-label.
-- ============================================================

create table if not exists discovered_portal_maps (
  id                      uuid primary key default gen_random_uuid(),

  -- Domínio do portal (chave primária semântica)
  -- Ex: 'paineldoaluno.com.br' (raiz) ou 'machadosobrinho.paineldoaluno.com.br' (subdomínio)
  portal_domain           text not null unique,

  -- Nome amigável inferido ou definido pelo professor
  portal_display_name     text,

  -- Mapa de seletores descobertos (schema: ver abaixo)
  -- {
  --   "roster_table":   "table#alunos, table.tabela-chamada",
  --   "name_column":    1,           -- índice 0-based da coluna de nome
  --   "id_column":      0,           -- índice da matrícula
  --   "status_column":  2,           -- (opcional)
  --   "nee_selector":   ".badge-nee" -- (opcional)
  -- }
  discovered_selectors    jsonb not null,

  -- Estratégia de paginação inferida
  -- {
  --   "type": "next_button" | "page_numbers" | "infinite_scroll" | "none",
  --   "nextSelector": ".pagination .next",
  --   "maxPages": 10,
  --   "delayBetweenPagesMs": 1000
  -- }
  pagination_strategy     jsonb,

  -- Nível de confiança da descoberta
  discovery_confidence    text check (discovery_confidence in ('high', 'medium', 'low')),

  -- Professor que realizou a descoberta (pode ser null em testes/offline)
  discovered_by_teacher_id uuid references auth.users on delete set null,

  -- Timestamps de ciclo de vida
  discovered_at           timestamptz default now() not null,
  last_validated_at       timestamptz,

  -- Contador de falhas: incrementa quando o seletor não é encontrado
  -- (indica mudança de layout no portal)
  validation_failures     int default 0 not null,

  -- Encadeamento para auto-cura: aponta para o mapa substituto quando
  -- o layout mudou e um novo mapa foi descoberto
  superseded_by           uuid references discovered_portal_maps(id) on delete set null
);

-- Índice para lookup rápido por domínio (acesso principal)
create index if not exists idx_portal_maps_domain
  on discovered_portal_maps (portal_domain);

-- Índice para encontrar mapas ativos (sem substituto)
create index if not exists idx_portal_maps_active
  on discovered_portal_maps (portal_domain)
  where superseded_by is null;

-- ============================================================
-- Row Level Security
-- Política: qualquer professor autenticado pode ler todos os mapas
-- (mapas não contêm PII — só seletores CSS e metadados técnicos).
-- Inserção: qualquer professor autenticado.
-- Atualização/exclusão: apenas quem descobriu ou service_role.
-- ============================================================
alter table discovered_portal_maps enable row level security;

create policy "Leitura publica de mapas de portal"
  on discovered_portal_maps
  for select
  using (auth.uid() is not null);

create policy "Insercao autenticada de mapa"
  on discovered_portal_maps
  for insert
  with check (auth.uid() is not null);

create policy "Atualizacao pelo descobridor ou service_role"
  on discovered_portal_maps
  for update
  using (
    auth.uid() = discovered_by_teacher_id
    or auth.role() = 'service_role'
  );

-- ============================================================
-- Comentários de documentação inline
-- ============================================================
comment on table discovered_portal_maps is
  'Mapas de seletores CSS descobertos automaticamente pelo engine de leitura de portal. '
  'Compartilhado por domínio: uma descoberta beneficia todas as escolas com o mesmo sistema white-label.';

comment on column discovered_portal_maps.portal_domain is
  'Domínio do portal (ex: paineldoaluno.com.br). '
  'Pode ser subdomínio-específico (machadosobrinho.paineldoaluno.com.br) se o domínio raiz acumular >= 3 falhas.';

comment on column discovered_portal_maps.validation_failures is
  'Conta falhas de seletor. Ao atingir 3+ falhas, o engine usa subdomínio ao salvar o próximo mapa.';

comment on column discovered_portal_maps.superseded_by is
  'Aponta para o mapa substituto após mudança de layout (self-healing). '
  'Mapas com superseded_by preenchido são históricos e não devem ser usados para leitura.';
