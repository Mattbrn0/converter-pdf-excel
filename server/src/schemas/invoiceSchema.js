import { z } from 'zod';

/** Convertit chaîne ou nombre en number (gère "844,00", "2213", espaces). */
function toNumber(val) {
  if (typeof val === 'number' && !Number.isNaN(val)) return Math.max(0, val);
  if (typeof val === 'string') {
    const normalized = val.trim().replace(/\s/g, '').replace(',', '.');
    const n = parseFloat(normalized);
    return Number.isNaN(n) ? 0 : Math.max(0, n);
  }
  return 0;
}

const montantSchema = z
  .union([z.number(), z.string()])
  .transform((v) => toNumber(v));

/**
 * Schéma Zod pour valider les données extraites d'une facture par le LLM.
 * Accepte totalTTC et montantPayeAcomptes en string (ex. "2213", "844,00").
 */
export const factureExtraitSchema = z.object({
  dateFacture: z.string(),
  /** Numéro de facture (référence) — obligatoire pour distinguer plusieurs factures du même fournisseur. */
  numeroFacture: z.string().optional(),
  fournisseur: z.string(),
  totalTTC: montantSchema,
  modePaiement: z.string().optional(),
  etat: z.enum(['Payée', 'À payer']),
  montantPayeAcomptes: montantSchema.optional().default(0),
  datesPaiementAcomptes: z.array(z.string()).optional().default([]),
});

export const extractionResultSchema = z.object({
  factures: z.array(factureExtraitSchema),
});

/**
 * Normalise le mode de paiement en 2 catégories : "Virement" ou "Autre".
 */
export function normaliserModePaiement(val) {
  if (val == null || val === '') return 'Autre';
  const v = String(val).toLowerCase().trim();
  if (v.includes('virement') || v === 'rib') return 'Virement';
  return 'Autre';
}

const MOIS_FR = {
  janvier: 1, février: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, août: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12,
};

/**
 * Parse une date depuis plusieurs formats : ISO, JJ/MM/AAAA, "22 décembre 2025", etc.
 * @returns {Date|null}
 */
export function parserDateFacture(dateFactureStr) {
  if (!dateFactureStr || typeof dateFactureStr !== 'string') return null;
  const s = dateFactureStr.trim();

  // ISO (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // JJ/MM/AAAA ou JJ-MM-AAAA
  const matchSlash = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (matchSlash) {
    const [, jour, mois, annee] = matchSlash;
    const y = annee.length === 2 ? 2000 + parseInt(annee, 10) : parseInt(annee, 10);
    const d = new Date(y, parseInt(mois, 10) - 1, parseInt(jour, 10));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // "22 décembre 2025" ou "Le 22 décembre 2025"
  const matchFr = s.match(/(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{2,4})/i);
  if (matchFr) {
    const [, jour, moisNom, annee] = matchFr;
    const mois = MOIS_FR[moisNom.toLowerCase()];
    if (!mois) return null;
    const y = annee.length === 2 ? 2000 + parseInt(annee, 10) : parseInt(annee, 10);
    const d = new Date(y, mois - 1, parseInt(jour, 10));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Calcule la date d'échéance (date facture + 30 jours).
 * Gère les formats français (ex. "22 décembre 2025").
 * @param {string} dateFactureStr
 * @returns {string} Date au format JJ/MM/AAAA
 */
export function calculerDateEcheance(dateFactureStr) {
  const d = parserDateFacture(dateFactureStr);
  if (!d) return '';
  d.setDate(d.getDate() + 30);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Formate une date pour l'affichage (JJ/MM/AAAA).
 * Accepte aussi les dates en français.
 */
export function formaterDate(str) {
  if (!str) return '';
  const d = parserDateFacture(str);
  if (!d) return typeof str === 'string' ? str : '';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Détermine l'état de la facture ("Payée" ou "À payer") selon ta règle métier :
 * - "Payée" si au moins un acompte / paiement partiel a déjà été payé
 *   (montantPayeAcomptes > 0)
 * - sinon, "Payée" si la date d'échéance (date facture + 30 jours) est déjà passée
 * - sinon, "À payer".
 */
export function determinerEtatFacture(facture) {
  const montant = toNumber(facture?.montantPayeAcomptes ?? 0);
  if (montant > 0) return 'Payée';

  const d = parserDateFacture(facture?.dateFacture);
  if (!d) return 'À payer';

  const echeance = new Date(d.getTime());
  echeance.setDate(echeance.getDate() + 30);

  const aujourdHui = new Date();
  if (aujourdHui > echeance) return 'Payée';

  return 'À payer';
}
