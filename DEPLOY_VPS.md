# Mise en ligne sur un VPS (avec Mistral / Ollama)

À exécuter **sur ton VPS**, après `git clone` et `cd converter-pdf-excel`.

Remplace `135.125.102.27` par l’IP de ton VPS (ou ton domaine si tu en as un).

---

## 1. Lier le projet à Mistral (Ollama déjà installé)

```bash
cd ~/converter-pdf-excel/server
cp .env.example .env
nano .env
```

Colle ceci (et adapte l’IP si besoin) :

```env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=mistral

PORT=3001
CLIENT_ORIGIN=http://135.125.102.27:5173
```

Sauvegarde (Ctrl+O, Entrée, Ctrl+X).

Vérifier qu’Ollama tourne et que Mistral est dispo :

```bash
ollama list
# Si mistral n’apparaît pas : ollama pull mistral
```

---

## 2. Lancer le backend

```bash
cd ~/converter-pdf-excel/server
npm install
node src/index.js
```

Tu dois voir : `Serveur démarré sur http://localhost:3001`.

Pour le laisser tourner en arrière-plan (recommandé) :

```bash
# Avec nohup
nohup node src/index.js > server.log 2>&1 &

# Ou avec pm2 (si installé : npm i -g pm2)
# pm2 start src/index.js --name pdf-excel
# pm2 save && pm2 startup
```

---

## 3. Builder et servir le frontend

**Terminal 1** (ou après avoir mis le serveur en arrière-plan) :

```bash
cd ~/converter-pdf-excel/client
echo "VITE_API_URL=http://135.125.102.27:3001" > .env
npm install
npm run build
npx serve -s dist -l 5173
```

Pour le laisser tourner en arrière-plan :

```bash
nohup npx serve -s dist -l 5173 > client.log 2>&1 &
```

---

## 4. Ouvrir les ports sur le VPS

Pour que le site soit accessible de partout, les ports **5173** (front) et **3001** (API) doivent être ouverts.

**Si tu utilises UFW :**

```bash
sudo ufw allow 5173
sudo ufw allow 3001
sudo ufw status
sudo ufw enable
```

**Si ton hébergeur a un pare-feu (OVH, etc.) :** ouvre aussi les ports 5173 et 3001 dans son interface.

---

## 5. Accéder au site

Dans ton navigateur :

- **Site :** http://135.125.102.27:5173  
- L’API est appelée automatiquement sur http://135.125.102.27:3001.

Tu peux utiliser le site depuis n’importe où ; Mistral tourne sur le VPS.

---

## (Optionnel) Tout passer en HTTPS sur le port 80 avec Nginx

Si tu as un **nom de domaine** pointant vers ton VPS (ex. `factures.ton-domaine.fr`) :

1. Installer Nginx : `sudo apt install nginx`
2. Créer un fichier de config (ex. `sudo nano /etc/nginx/sites-available/pdf-excel`) :

```nginx
server {
    listen 80;
    server_name factures.ton-domaine.fr;   # ou 135.125.102.27

    root /home/ubuntu/converter-pdf-excel/client/dist;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

3. Activer : `sudo ln -s /etc/nginx/sites-available/pdf-excel /etc/nginx/sites-enabled/` puis `sudo nginx -t` et `sudo systemctl reload nginx`.
4. Dans `server/.env` : `CLIENT_ORIGIN=http://factures.ton-domaine.fr` (sans port).
5. Dans `client/.env` (avant build) : `VITE_API_URL=` (vide, car l’API est sur le même domaine via Nginx). Puis refaire `npm run build`.

Ensuite tu accèdes au site via http://factures.ton-domaine.fr (et plus besoin d’ouvrir 5173/3001).

---

## Mise à jour auto au push GitHub (webhook)

Quand tu fais un `git push` sur GitHub, le VPS peut se mettre à jour tout seul.

### 1. Secret et script sur le VPS

```bash
cd ~/converter-pdf-excel
chmod +x deploy.sh
```

Dans `server/.env`, ajoute une ligne (invente une chaîne longue et secrète) :

```env
DEPLOY_SECRET=ta_cle_secrete_ici_123
```

Redémarre le backend pour prendre en compte la variable.

### 2. Webhook sur GitHub

1. Ouvre ton repo GitHub → **Settings** → **Webhooks** → **Add webhook**.
2. **Payload URL :** `http://135.125.102.27:3001/api/deploy` (remplace par ton IP ou ton domaine).
3. **Content type :** `application/json`.
4. **Secret :** la même valeur que `DEPLOY_SECRET` dans ton `server/.env`. GitHub signe chaque requête avec ce secret ; le backend vérifie la signature automatiquement.
5. **Which events :** coche **Just the push event**.
6. **Active** : coché → **Add webhook**.

À chaque **push** sur la branche par défaut, GitHub envoie une requête POST à ton VPS. Le backend vérifie le secret puis lance `deploy.sh`, qui fait `git pull`, `npm install`, `npm run build` (client) et redémarre le serveur Node. Le frontend (fichiers dans `client/dist`) est mis à jour au prochain rechargement.

**Note :** le endpoint `/api/deploy` peut aussi être appelé à la main avec le secret en en-tête :

```bash
curl -X POST -H "X-Deploy-Secret: ta_cle_secrete_ici_123" http://localhost:3001/api/deploy
```
