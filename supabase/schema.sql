-- Table optionnelle pour enregistrer les conversions (statistiques)
-- À exécuter dans l’éditeur SQL du projet Supabase si vous utilisez Supabase.

create table if not exists conversions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now() not null,
  nb_fichiers int not null,
  nb_factures int not null
);

-- Optionnel : index pour les requêtes par date
create index if not exists idx_conversions_created_at on conversions (created_at desc);
