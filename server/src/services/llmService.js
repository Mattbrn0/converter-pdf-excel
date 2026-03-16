import OpenAI from 'openai';
import { extractionResultSchema, determinerEtatFacture } from '../schemas/invoiceSchema.js';

const SYSTEM_PROMPT = `Tu es un assistant qui extrait les informations comptables des factures à partir du texte brut (OCR ou extraction PDF).

Pour chaque facture dans le texte, extrais et retourne UNIQUEMENT un JSON valide avec la structure suivante (sans markdown, sans \`\`\`json) :

{
  "factures": [
    {
      "dateFacture": "YYYY-MM-DD de préférence (ex: 2025-12-22), ou date lisible",
      "fournisseur": "Nom du fournisseur ou de l'émetteur",
      "totalTTC": nombre = TOTAL TTC (Net à payer, montant toutes taxes comprises),
      "modePaiement": "Virement" ou "Autre" uniquement (Virement = virement bancaire / RIB ; tout le reste = Autre),
      "etat": "Payée" si le total est entièrement réglé, "À payer" s'il reste un solde dû,
      "montantPayeAcomptes": nombre (voir règle ci-dessous),
      "datesPaiementAcomptes": ["date1", "date2", ...] une entrée par acompte/situation
    }
  ]
}

Règles importantes :
- dateFacture : utilise de préférence le format YYYY-MM-DD (ex: 2025-12-22) pour la date d'émission de la facture.
- totalTTC : le montant TOTAL TTC (toutes taxes comprises) : "TOTAL TTC", "Net à payer", "NET A PAYER", "Montant TTC". C'est le montant final à payer.
-S’il y a plusieurs acomptes (par ex. 300,70 + 200,30), tu dois additionner tous les acomptes et mettre la somme dans montantPayeAcomptes (ici 501), et mettre toutes les dates dans datesPaiementAcomptes. "datesPaiementAcomptes" doit contenir toutes les dates correspondantes.
- datesPaiementAcomptes : liste une date pour chaque acompte/situation mentionné ; si aucun acompte, laisser [].
- Identifie les mentions explicites : acompte, réglé, perçu, situation, "déjà perçu", "situation 1", etc. N'interprète pas le "MONTANT H.T." ou "Net à payer" comme un acompte.
- modePaiement : uniquement "Virement" ou "Autre". Si virement bancaire, RIB → "Virement". Sinon → "Autre".
- Si une information est introuvable, utilise une valeur par défaut raisonnable.
- Si plusieurs factures sont dans le même document, retourne un élément par facture dans "factures".
- Réponds UNIQUEMENT par le JSON, sans commentaire.
- CRITIQUE : ne mets AUCUN texte avant ou après le JSON. Pas de "Voici les factures", pas d'introduction. Ta réponse doit commencer exactement par { et finir par }.
- Même si la facture contient un long paragraphe juridique (cession, affacturage, subrogation), plusieurs bons de livraison (BL) ou tableaux détaillés, extrais les infos principales (fournisseur, total TTC, date, échéance, mode de paiement) et retourne UNIQUEMENT le JSON. Une seule facture = un seul élément dans "factures".
- Un document = une facture : utilise le TOTAL TTC du document (Net à payer), pas les sous-totaux partiels (ex. d'un BL). Retourne un seul élément dans "factures" par document.`;

/**
 * Compacte le texte d'une facture pour ne garder que les parties utiles :
 * - premières lignes (entête, références)
 * - lignes contenant des mots-clés comptables (TTC, Net à payer, acompte, RIB, virement, facture, total, échéance, règlement, payé)
 * afin de réduire le temps de traitement LLM sur un petit VPS.
 */
function compacterTexteFacture(texte, maxChars = 8000) {
  if (!texte || typeof texte !== 'string') return '';
  const lignes = texte.split(/\r?\n/);
  const maxPremieresLignes = 120;
  const premiers = lignes.slice(0, maxPremieresLignes);
  const keywords = [
    'ttc',
    'net a payer',
    'net à payer',
    'montant ttc',
    'total ttc',
    'total ht',
    'acompte',
    'situation',
    'regle',
    'réglé',
    'percu',
    'perçu',
    'facture',
    'echeance',
    'échéance',
    'rib',
    'iban',
    'virement',
    'reglement',
    'règlement',
    'paiement',
  ];
  const lowerIncludesKeyword = (line) => {
    const l = line.toLowerCase();
    return keywords.some((k) => l.includes(k));
  };
  const lignesPertinentes = lignes.filter((line, idx) => idx >= maxPremieresLignes && lowerIncludesKeyword(line));
  const fusion = [...premiers, ...lignesPertinentes].join('\n');
  return fusion.slice(0, maxChars);
}

/**
 * Essaie d'identifier tous les acomptes dans le texte brut :
 * - somme des montants
 * - liste des dates associées
 * basé sur des mots-clés (acompte, situation, perçu, déjà réglé, etc.).
 */
function extraireAcomptesEtDatesDepuisTexte(texte) {
  if (!texte || typeof texte !== 'string') return { total: 0, dates: [] };
  const lignes = texte.split(/\r?\n/);
  // Inclure les orthographes fréquentes: acompte / accompte, déjà/déja, perçu/percu, situation 1, etc.
  const reLigneAcompte =
    /(acompte|accompte|situation|déjà réglé|deja regle|déjà perçu|deja percu|déja perçu|deja perçu|perçu le|percu le|deja percu le|déja percu le|situation\s+\d+)/i;
  const reMontant = /(\d{1,3}(?:[ .]\d{3})*(?:[.,]\d{2})|\d+[.,]\d{2})/g;
  const reDate =
    /(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{1,2}\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+\d{2,4})/i;
  let total = 0;
  const dates = [];

  for (const line of lignes) {
    if (!reLigneAcompte.test(line)) continue;

    // Extraire les montants
    const matches = line.match(reMontant);
    if (!matches) continue;
    for (const raw of matches) {
      let s = raw.replace(/\s/g, '');
      // Normaliser format français "663,90" -> "663.90"
      s = s.replace(',', '.');
      const n = Number(s);
      if (!Number.isNaN(n) && n > 0) {
        total += n;
      }
    }

    // Extraire la première date trouvée sur la ligne (s'il y en a)
    const dateMatch = line.match(reDate);
    if (dateMatch && dateMatch[1]) {
      dates.push(dateMatch[1].trim());
    }
  }

  return { total, dates };
}

/**
 * Tente de corriger les erreurs de syntaxe JSON fréquentes (virgules manquantes ou en trop).
 */
function tryRepairJson(str) {
  if (!str || typeof str !== 'string') return str;
  let s = str.trim();
  // Virgules en trop avant ] ou }
  s = s.replace(/,(\s*[}\]])/g, '$1');
  // Virgule manquante : "value" suivi de \n puis "nextKey" -> "value",\n  "nextKey"
  s = s.replace(/"\s*\n\s*"/g, '",\n  "');
  // Nombre suivi de \n puis "key" (ex: 214.15\n"modePaiement")
  s = s.replace(/(\d)\s*\n\s*"/g, '$1,\n  "');
  // "value" suivi d'espace(s) puis "key" sans \n (ex: "val"  "key")
  s = s.replace(/"\s{2,}"/g, '", "');
  // } ou ] suivi de \n puis "key" (objet/tableau pas fermé par une virgule)
  s = s.replace(/\}\s*\n\s*"/g, '},\n  "');
  s = s.replace(/\]\s*\n\s*"/g, '],\n  "');
  return s;
}

const FALLBACK_PROMPT = `Tu dois répondre UNIQUEMENT par un objet JSON, sans aucun autre texte. Pas d'introduction, pas d'explication. Commence par { et finis par }.

Format exact attendu (un seul objet avec une clé "factures" contenant un tableau d'objets) :
{"factures":[{"dateFacture":"YYYY-MM-DD","fournisseur":"Nom","totalTTC":0,"modePaiement":"Virement ou Autre","etat":"Payée ou À payer","montantPayeAcomptes":0,"datesPaiementAcomptes":[]}]}

Extrais les données de la facture dans le texte ci-dessous et remplis le JSON. Une facture = un élément dans le tableau.`;

function getProviderConfig() {
  const provider = (process.env.LLM_PROVIDER || 'openai').toLowerCase();

  if (provider === 'groq') {
    const key = process.env.GROQ_API_KEY;
    if (!key) throw new Error('GROQ_API_KEY non configurée (choisir LLM_PROVIDER=groq)');
    return {
      provider: 'groq',
      client: new OpenAI({
        apiKey: key,
        baseURL: 'https://api.groq.com/openai/v1',
      }),
      model: process.env.GROQ_MODEL || 'llama-3.1-70b-versatile',
      supportsJsonMode: false, // Groq peut ne pas supporter response_format
    };
  }

  if (provider === 'ollama') {
    return {
      provider: 'ollama',
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      model: process.env.OLLAMA_MODEL || 'llama3.2',
      supportsJsonMode: false,
    };
  }

  // openai par défaut
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY non configurée');
  return {
    provider: 'openai',
    client: new OpenAI({ apiKey: key }),
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    supportsJsonMode: true,
  };
}

/**
 * Extrait le premier objet JSON du texte (ignore "Voici la liste..." etc.).
 * Cherche { ou {"factures" puis trouve l'accolade fermante correspondante.
 */
function extractJsonFromText(text) {
  if (!text || typeof text !== 'string') return '';
  let s = text.trim();
  const codeBlock = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) s = codeBlock[1].trim();
  let start = s.indexOf('{"factures"');
  if (start === -1) start = s.indexOf('{\n"factures"');
  if (start === -1) start = s.indexOf('{ "factures"');
  if (start === -1) {
    const facturesIdx = s.indexOf('"factures"');
    if (facturesIdx !== -1) {
      const braceBefore = s.lastIndexOf('{', facturesIdx);
      if (braceBefore !== -1) start = braceBefore;
    }
  }
  if (start === -1) start = s.indexOf('{');
  if (start === -1) start = s.indexOf('\u007B'); // Unicode {
  if (start === -1) return '';
  let depth = 0;
  let inString = false;
  let escape = false;
  let quoteChar = null;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === '\\' && inString) {
      escape = true;
      continue;
    }
    if (!inString) {
      if (c === '"' || c === "'") {
        inString = true;
        quoteChar = c;
        continue;
      }
      if (c === '{') depth++;
      if (c === '}') {
        depth--;
        if (depth === 0) return s.slice(start, i + 1);
      }
      continue;
    }
    if (c === quoteChar) inString = false;
  }
  return s.slice(start);
}

/** Vérifie si un objet ressemble à une facture (fournisseur ou totalHT). */
function looksLikeFacture(obj) {
  return obj && typeof obj === 'object' && (obj.fournisseur != null || obj.totalTTC != null || obj.totalHT != null || obj.Fournisseur != null);
}

/**
 * Dernier recours : parcourir la chaîne, à chaque { tenter d'extraire un objet JSON.
 * Accepte aussi un objet avec une autre clé (ex: "invoice", "data") contenant un tableau de factures.
 */
function extractJsonLastResort(text) {
  if (!text || typeof text !== 'string') return '';
  const s = text;
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '{' && s[i] !== '\u007B') continue;
    const extracted = extractJsonFromText(s.slice(i));
    if (!extracted || !extracted.startsWith('{')) continue;
    try {
      const obj = JSON.parse(extracted);
      if (!obj || typeof obj !== 'object') continue;
      if (Array.isArray(obj.factures) || Array.isArray(obj)) return extracted;
      const arr = obj.factures ?? obj.Factures ?? obj.invoices ?? obj.data;
      if (Array.isArray(arr) && arr.some(looksLikeFacture)) return JSON.stringify({ factures: arr });
      const firstArray = Object.values(obj).find((v) => Array.isArray(v) && v.some(looksLikeFacture));
      if (firstArray) return JSON.stringify({ factures: firstArray });
      if (looksLikeFacture(obj)) return JSON.stringify({ factures: [obj] });
    } catch (_) {}
  }
  return '';
}

async function callOllama(baseUrl, model, messages) {
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      // Limiter la génération pour accélérer la réponse sur un petit VPS CPU
      options: {
        num_predict: 384,
        temperature: 0.1,
      },
      stream: false,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama: ${res.status} - ${err}`);
  }
  const data = await res.json();
  return data.message?.content || '';
}

/**
 * Envoie le texte du PDF au LLM et retourne les factures extraites validées par Zod.
 */
export async function extraireFacturesAvecLLM(textePdf) {
  if (!textePdf || !textePdf.trim()) {
    throw new Error('Aucun texte à analyser');
  }
  console.log('=== TEXTE_FACTURE_DEBUG_DEBUT ===');
console.log(textePdf);
console.log('=== TEXTE_FACTURE_DEBUG_FIN ===');

  const config = getProviderConfig();
  // Limiter fortement la taille du texte envoyé au LLM pour réduire le temps de traitement
  const texte = compacterTexteFacture(textePdf, 8000);
  const multiDoc = (texte.match(/--- Document:/g) || []).length > 1;
  const userContent = multiDoc
    ? `Le texte ci-dessous contient PLUSIEURS documents (séparés par "--- Document: ..."). Extrais les données de CHAQUE facture et retourne-les TOUTES dans le tableau "factures" (un élément par facture).\n\n${texte}`
    : `Extrais les données des factures à partir du texte suivant :\n\n${texte}`;

  let raw;

  if (config.provider === 'ollama') {
    let rawResponse = await callOllama(config.baseUrl, config.model, [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ]);
    const trimmed = rawResponse.trim();
    if (trimmed.startsWith('{')) {
      try {
        const direct = JSON.parse(trimmed);
        if (direct && Array.isArray(direct.factures)) raw = JSON.stringify(direct);
        else if (direct && Array.isArray(direct)) raw = JSON.stringify({ factures: direct });
      } catch (_) {}
    }
    if (!raw) raw = extractJsonFromText(rawResponse);
    if (raw && !raw.trimStart().startsWith('{')) {
      const firstBrace = rawResponse.indexOf('{');
      if (firstBrace !== -1) raw = extractJsonFromText(rawResponse.slice(firstBrace));
    }
    if (!raw || !raw.trimStart().startsWith('{')) raw = extractJsonLastResort(rawResponse);
    // Second essai avec prompt minimal si toujours pas de JSON (factures complexes)
    if (!raw || !raw.trimStart().startsWith('{')) {
      const shortText = compacterTexteFacture(textePdf, 4000);
      rawResponse = await callOllama(config.baseUrl, config.model, [
        { role: 'user', content: `${FALLBACK_PROMPT}\n\n${shortText}` },
      ]);
      raw = extractJsonFromText(rawResponse);
      if (!raw || !raw.trimStart().startsWith('{')) raw = extractJsonLastResort(rawResponse);
    }
  } else {
    const options = {
      model: config.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      temperature: 0.1,
    };
    if (config.supportsJsonMode) {
      options.response_format = { type: 'json_object' };
    }
    const completion = await config.client.chat.completions.create(options);
    raw = completion.choices[0]?.message?.content || '';
    if (!config.supportsJsonMode) {
      const rawResponse = raw;
      raw = extractJsonFromText(raw);
      if (raw && !raw.trimStart().startsWith('{')) {
        const firstBrace = rawResponse.indexOf('{');
        if (firstBrace !== -1) raw = extractJsonFromText(rawResponse.slice(firstBrace));
      }
      if (!raw || !raw.trimStart().startsWith('{')) raw = extractJsonLastResort(rawResponse);
    }
  }

  if (!raw || !raw.trimStart().startsWith('{')) {
    throw new Error('Réponse LLM invalide (JSON) : aucun objet JSON trouvé. Réessaie avec cette facture ou utilise un modèle plus récent (ex. llama3.1).');
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    let repaired = raw;
    for (let i = 0; i < 4; i++) {
      repaired = tryRepairJson(repaired);
      try {
        parsed = JSON.parse(repaired);
        break;
      } catch (_) {
        if (i === 3) throw new Error(`Réponse LLM invalide (JSON) : ${e.message}`);
      }
    }
  }

  // Normaliser : tableau à la racine ou clé différente → { factures: [...] }
  if (Array.isArray(parsed)) {
    parsed = { factures: parsed };
  } else if (parsed && typeof parsed === 'object') {
    let list = parsed.factures ?? parsed.Factures ?? parsed.invoices ?? parsed.data?.factures ?? parsed.data?.Factures;
    if (!Array.isArray(list) && Array.isArray(parsed.data)) list = parsed.data;
    if (!Array.isArray(list)) {
      const firstArray = Object.values(parsed).find((v) => Array.isArray(v) && v.length > 0);
      list = firstArray ?? [];
    }
    // Factures indexées par clé numérique (ex: { "0": {...}, "1": {...} })
    if (!Array.isArray(list) && Object.keys(parsed).length > 0) {
      const values = Object.values(parsed);
      if (values.every((v) => v && typeof v === 'object' && (v.fournisseur != null || v.totalTTC != null || v.totalHT != null)))
        list = values;
    }
    // Une seule facture renvoyée comme objet (sans tableau)
    if (!Array.isArray(list) && parsed.fournisseur != null) list = [parsed];
    parsed = { factures: Array.isArray(list) ? list : [] };
  }

  // Normaliser totalTTC (accepter totalHT si le LLM l'envoie encore) et corriger confusions
  if (Array.isArray(parsed.factures)) {
    const acomptesTexte = extraireAcomptesEtDatesDepuisTexte(textePdf);

    parsed.factures = parsed.factures.map((f) => {
      const totalTTC = Number(f.totalTTC ?? f.totalHT) || 0;

      // On ne fait plus confiance au LLM pour les acomptes : on écrase avec ce qu'on trouve dans le texte
      let acompte = acomptesTexte.total > 0 ? acomptesTexte.total : Number(f.montantPayeAcomptes) || 0;
      let out = {
        ...f,
        totalTTC,
        montantPayeAcomptes: acompte,
        datesPaiementAcomptes:
          acomptesTexte.total > 0 && acomptesTexte.dates.length > 0 ? acomptesTexte.dates : f.datesPaiementAcomptes ?? [],
      };

      if (acompte >= totalTTC && totalTTC > 0) {
        out = { ...out, montantPayeAcomptes: 0, datesPaiementAcomptes: [] };
      } else if (totalTTC > 0 && acompte > 0 && acompte / totalTTC >= 1.18 && acompte / totalTTC <= 1.22) {
        out = { ...out, totalTTC: acompte, montantPayeAcomptes: 0, datesPaiementAcomptes: [] };
      }
      return out;
    });
    parsed.factures = parsed.factures.map((f) => ({
      ...f,
      etat: determinerEtatFacture(f),
    }));
  }

  const result = extractionResultSchema.safeParse(parsed);
  if (!result.success) {
    const msg = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(' ; ');
    throw new Error(`Données invalides (Zod) : ${msg}`);
  }

  return result.data.factures;
}
