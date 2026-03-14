import { createClient } from '@supabase/supabase-js';

let supabase = null;

if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );
}

/**
 * Enregistre une conversion (optionnel, si Supabase est configuré).
 * Table attendue : conversions (id, created_at, nb_fichiers, nb_factures)
 */
export async function enregistrerConversion(nbFichiers, nbFactures) {
  if (!supabase) return;
  try {
    await supabase.from('conversions').insert({
      nb_fichiers: nbFichiers,
      nb_factures: nbFactures,
    });
  } catch (err) {
    console.warn('Supabase enregistrement conversion:', err.message);
  }
}

export { supabase };
