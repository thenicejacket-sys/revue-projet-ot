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
