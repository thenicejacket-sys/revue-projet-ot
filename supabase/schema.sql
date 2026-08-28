-- ============================================================================
--  Revue Projet OT — Historique partagé
--  À coller dans Supabase : Dashboard → SQL Editor → New query → Run
-- ============================================================================

-- Table de l'historique partagé des dossiers archivés
create table if not exists public.dossiers (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nom        text,
  resume     jsonb,          -- totaux affichés dans la liste (coûts, marge, prime, décision…)
  snapshot   jsonb not null  -- dossier figé complet (5 onglets), rejouable en lecture seule
);

-- Sécurité : Row Level Security (obligatoire sur une table publique)
alter table public.dossiers enable row level security;

-- Tout le monde peut LIRE l'historique (partagé entre tous les utilisateurs)
create policy "lecture publique" on public.dossiers
  for select using (true);

-- Tout le monde peut AJOUTER un dossier
create policy "ajout public" on public.dossiers
  for insert with check (true);

-- AUCUNE règle UPDATE ni DELETE n'est créée :
--   => une fois sauvegardé, un dossier ne peut être ni modifié ni supprimé (immuable).


-- ============================================================================
--  Configuration GLOBALE de l'application (ajout du 28/08/2026)
--  À coller dans Supabase : Dashboard → SQL Editor → New query → Run
--
--  Barèmes, widgets, formules, histogramme et template de valorisation étaient
--  jusqu'ici stockés dans le navigateur de chaque utilisateur : deux personnes
--  pouvaient obtenir deux résultats différents sur le même dossier.
--  Cette table les rend COMMUNS.
--
--  Principe : on n'écrase jamais, on AJOUTE une ligne. La configuration active est
--  la plus récente. L'historique des configurations est donc conservé, et un retour
--  arrière consiste simplement à re-publier une version antérieure.
-- ============================================================================

create table if not exists public.config (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  auteur     text,           -- qui a publié (saisi dans l'app, pour la traçabilité)
  payload    jsonb not null  -- settings, chargesTable, elementsTable, widgetConfig,
                             -- chartConfig, valoTable, pollueurs
);

-- Lecture la plus récente : requête très fréquente (à chaque chargement de l'app)
create index if not exists config_created_at_desc on public.config (created_at desc);

alter table public.config enable row level security;

-- Tout le monde peut LIRE la configuration commune
drop policy if exists "config lecture publique" on public.config;
create policy "config lecture publique" on public.config
  for select using (true);

-- Tout le monde peut PUBLIER une nouvelle configuration
drop policy if exists "config ajout public" on public.config;
create policy "config ajout public" on public.config
  for insert with check (true);

-- Aucune règle UPDATE ni DELETE : une configuration publiée est immuable.
-- Revenir en arrière = re-publier une version antérieure (ou importer le JSON de secours).
