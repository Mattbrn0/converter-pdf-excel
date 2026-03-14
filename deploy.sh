#!/bin/bash
# À lancer sur le VPS (par le webhook GitHub ou à la main).
# Fait: git pull, npm install, build client, redémarre le backend.

set -e
cd "$(dirname "$0")"
REPO_ROOT="$(pwd)"

echo "[deploy] Pulling..."
git pull

echo "[deploy] Installing server..."
cd "$REPO_ROOT/server"
npm install --production

echo "[deploy] Installing client..."
cd "$REPO_ROOT/client"
npm install

echo "[deploy] Building client..."
npm run build

echo "[deploy] Restarting backend..."
pkill -f "node src/index.js" 2>/dev/null || true
sleep 1
cd "$REPO_ROOT/server"
nohup node src/index.js >> server.log 2>&1 &

echo "[deploy] Done."
