#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "=== Kurswahl Update ==="
echo ""

# Pull latest from GitHub
echo "Pulling latest version..."
git pull --ff-only

# Rebuild and restart containers
echo "Rebuilding and restarting containers..."
docker compose up --build -d

# Clean up old images
echo "Cleaning up old images..."
docker image prune -f

echo ""
echo "=== Update complete ==="
docker compose ps
