#!/bin/bash

echo "🔧 Setting up DANAYA Platform..."
echo "================================"

# Create necessary directories
mkdir -p infra/postgres
mkdir -p infra/nginx/ssl
mkdir -p logs

# Generate JWT secret if .env doesn't exist
if [ ! -f .env ]; then
    cp .env.example .env
    # Generate a random secret
    SECRET=$(openssl rand -hex 32 2>/dev/null || echo "ministry-demo-secret-2025-change-in-production")
    sed -i "s/change-this-in-production-use-long-random-string/$SECRET/" .env
    echo "✅ Generated .env file with JWT secret"
else
    echo "ℹ️  .env file already exists"
fi

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Please install Docker first."
    exit 1
fi

echo "✅ Docker found"

# Check Docker Compose
if ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose not found. Please install Docker Compose first."
    exit 1
fi

echo "✅ Docker Compose found"

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Review .env file for configuration"
echo "  2. Run: ./scripts/start-danaya.sh"
