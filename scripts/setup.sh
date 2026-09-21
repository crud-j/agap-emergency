#!/usr/bin/env bash
# AGAP development setup script

set -e

echo "Setting up AGAP development environment..."

# Check pnpm
if ! command -v pnpm &> /dev/null; then
  echo "pnpm not found. Install with: npm install -g pnpm"
  exit 1
fi

# Copy env files
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example — fill in required values"
fi

# Install dependencies
pnpm install

# Generate Prisma client
cd backend && pnpm db:generate && cd ..

echo "Setup complete. Run 'docker-compose up -d' to start postgres and redis."
echo "Then run 'pnpm --filter @agap/backend start:dev' to start the backend."
