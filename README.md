# Factures PDF → Excel

Site web permettant de convertir des factures PDF en tableau Excel structuré.  
Extraction du texte PDF, analyse par LLM (OpenAI), validation des données (Zod), génération du fichier Excel.

## Stack

- **Frontend** : React (Vite)
- **Backend** : Node.js (Express)
- **Base de données** : Supabase (optionnel, pour statistiques)
- **Excel** : ExcelJS
- **Validation** : Zod

## Données extraites par facture

- Date de la facture  
- Fournisseur  
- Total HT (ou sous-total)  
- Date d’échéance (date facture + 30 jours)  
- Mode de paiement (virement, carte, chèque, etc.)  
- État : « Payée » ou « À payer »  
- Montant payé (acomptes)  
- Date(s) de paiement des acomptes  

## Prérequis

- Node.js 18+
- **Un** des fournisseurs LLM suivants :
  - **OpenAI** : clé API (payant après quota gratuit)
  - **Groq** : clé gratuite sur [console.groq.com](https://console.groq.com/keys) — quota gratuit généreux
  - **Ollama** : 100 % local, gratuit, sans quota — installer [Ollama](https://ollama.com) puis `ollama pull llama3.2`

## Installation

### 1. Backend

```bash
cd server
cp .env.example .env
# Éditer .env et renseigner OPENAI_API_KEY
npm install
```

### 2. Frontend

```bash
cd client
npm install
```

### 3. Supabase (optionnel)

Si vous souhaitez enregistrer les conversions :

1. Créer un projet sur [Supabase](https://supabase.com).
2. Exécuter le script `supabase/schema.sql` dans l’éditeur SQL du projet.
3. Renseigner `SUPABASE_URL` et `SUPABASE_ANON_KEY` dans `server/.env`.

### Choix du fournisseur LLM (éviter le blocage 429)

Dans `server/.env`, définir `LLM_PROVIDER` :

| Valeur    | Clé / config        | Avantage                          |
|-----------|----------------------|------------------------------------|
| `openai`  | `OPENAI_API_KEY`     | Qualité, mais quota limité gratuit |
| `groq`    | `GROQ_API_KEY`       | **Gratuit**, quota généreux        |
| `ollama`  | Aucune (local)       | **Illimité**, tourne sur ta machine |

Exemple pour Groq (gratuit) :  
`LLM_PROVIDER=groq` et `GROQ_API_KEY=gsk_...` (clé sur [console.groq.com](https://console.groq.com/keys)).

Exemple pour Ollama (local, illimité) :  
`LLM_PROVIDER=ollama`, lancer Ollama sur la machine puis `ollama pull llama3.2`.

## Lancement

**Terminal 1 – Backend :**

```bash
cd server
npm run dev
```

**Terminal 2 – Frontend :**

```bash
cd client
npm run dev
```

Ouvrir [http://localhost:5173](http://localhost:5173), déposer un ou plusieurs PDF de factures, puis cliquer sur « Convertir en Excel » pour télécharger le fichier.

## Variables d’environnement

### Backend (`server/.env`)

| Variable            | Obligatoire | Description |
|---------------------|------------|-------------|
| `LLM_PROVIDER`      | Non        | `openai`, `groq` ou `ollama` (défaut : openai) |
| `OPENAI_API_KEY`    | Si openai  | Clé API OpenAI |
| `OPENAI_MODEL`      | Non        | Modèle OpenAI (défaut : gpt-4o-mini) |
| `GROQ_API_KEY`      | Si groq    | Clé Groq (gratuite sur console.groq.com) |
| `GROQ_MODEL`        | Non        | Modèle Groq (défaut : llama-3.1-70b-versatile) |
| `OLLAMA_BASE_URL`   | Non        | URL Ollama (défaut : http://localhost:11434) |
| `OLLAMA_MODEL`      | Non        | Modèle Ollama (défaut : llama3.2) |
| `PORT`              | Non        | Port serveur (défaut : 3001) |
| `CLIENT_ORIGIN`     | Non        | Origine CORS (défaut : localhost:5173) |
| `SUPABASE_URL`      | Non        | URL projet Supabase |
| `SUPABASE_ANON_KEY` | Non        | Clé anon Supabase |

### Frontend

En développement, le proxy Vite envoie `/api` vers `http://localhost:3001`.  
En production, définir `VITE_API_URL` vers l’URL de votre backend si différent de l’origine.

## Structure du projet

```
.
├── client/                 # React (Vite)
│   ├── src/
│   │   ├── api/convert.js  # Appel API conversion
│   │   ├── App.jsx
│   │   └── App.css
│   └── vite.config.js     # Proxy /api → backend
├── server/                 # Express
│   ├── src/
│   │   ├── index.js
│   │   ├── routes/upload.js
│   │   ├── middleware/upload.js  # Multer (PDF)
│   │   ├── schemas/invoiceSchema.js  # Zod
│   │   └── services/
│   │       ├── pdfService.js   # Extraction texte PDF
│   │       ├── llmService.js    # OpenAI + validation
│   │       ├── excelService.js # Génération Excel
│   │       └── supabaseService.js
│   └── .env.example
├── supabase/
│   └── schema.sql         # Table conversions
└── README.md
```

## Déploiement (VPS)

Voir **[DEPLOY_VPS.md](DEPLOY_VPS.md)** pour le guide pas à pas (lien avec Mistral/Ollama, mise en ligne, ports, option Nginx).

## Licence

MIT
