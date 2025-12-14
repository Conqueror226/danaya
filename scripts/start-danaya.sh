#!/bin/bash

echo "🏥 Starting DANAYA Platform..."
echo "================================"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Build services
echo "🔨 Building services..."
docker compose build

# Start services
echo "🚀 Starting all services..."
docker compose up -d

# Wait for services to be healthy
echo "⏳ Waiting for services to start..."
sleep 15

# Check health
echo ""
echo "🔍 Checking service health..."

check_service() {
    local name=$1
    local url=$2
    if curl -s "$url" > /dev/null 2>&1; then
        echo "✅ $name: Running"
    else
        echo "❌ $name: Not responding"
    fi
}

check_service "Registry  " "http://localhost:8003/health"
check_service "Auth      " "http://localhost:8001/health"
check_service "Patient   " "http://localhost:8002/health"
check_service "Frontend  " "http://localhost:3000"

echo ""
echo "✅ DANAYA is running!"
echo "================================"
echo "🌐 Frontend:        http://localhost:3000"
echo "🔐 Auth API:        http://localhost:8001/docs"
echo "👥 Patient API:     http://localhost:8002/docs"
echo "🏥 Registry API:    http://localhost:8003/docs"
echo ""
echo "📊 Monitor logs:    docker compose logs -f"
echo "🛑 Stop platform:   docker compose down"
echo ""
echo "Demo accounts:"
echo "  👨‍⚕️ Doctor: doctor@chu-ouaga.bf / Doctor123!"
echo "  👩‍⚕️ Nurse:  nurse@chu-ouaga.bf / Nurse123!"
echo "  👨‍💼 Admin:  admin@danaya.bf / Admin123!"
echo ""
echo "Danaya ka kɛnɛya! 💙🇧🇫"
