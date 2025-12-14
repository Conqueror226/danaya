# DANAYA Docker Deployment Guide

## Quick Start
```bash
# 1. Setup (first time only)
./scripts/setup-danaya.sh

# 2. Start platform
./scripts/start-danaya.sh

# 3. Access the platform
# Frontend: http://localhost:3000
# API Docs: http://localhost:8001/docs
```

## Services

| Service | Port | URL |
|---------|------|-----|
| Frontend | 3000 | http://localhost:3000 |
| Auth API | 8001 | http://localhost:8001/docs |
| Patient API | 8002 | http://localhost:8002/docs |
| Registry API | 8003 | http://localhost:8003/docs |
| Nginx Proxy | 80 | http://localhost |
| PostgreSQL | 5432 | localhost:5432 |
| Redis | 6379 | localhost:6379 |

## Demo Accounts

### Doctor (Full Access)
- Email: `doctor@chu-ouaga.bf`
- Password: `Doctor123!`

### Nurse (Limited Access)
- Email: `nurse@chu-ouaga.bf`
- Password: `Nurse123!`

### Admin (System Access)
- Email: `admin@danaya.bf`
- Password: `Admin123!`

## Management Commands
```bash
# View logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f auth-service

# Restart a service
docker-compose restart auth-service

# Stop platform
./scripts/stop-danaya.sh

# Stop and remove all data
docker-compose down -v

# Rebuild after code changes
docker-compose build
docker-compose up -d
```

## Health Checks
```bash
# Check all services
curl http://localhost:8001/health  # Auth
curl http://localhost:8002/health  # Patient
curl http://localhost:8003/health  # Registry

# Check database
docker-compose exec postgres psql -U danaya -d danaya_db -c "SELECT 1;"

# Check Redis
docker-compose exec redis redis-cli -a danaya_redis_2025 ping
```

## Troubleshooting

### Services won't start
```bash
# Check Docker is running
docker info

# Check logs for errors
docker-compose logs

# Restart everything
docker-compose down
docker-compose up -d
```

### Port already in use
```bash
# Find process using port
lsof -i :3000

# Kill process
kill -9 <PID>
```

### Database connection issues
```bash
# Reset database
docker-compose down -v
docker-compose up -d postgres
sleep 10
docker-compose up -d
```

## Production Deployment

For production deployment:

1. Update `.env` with secure passwords
2. Enable HTTPS (SSL certificates in `infra/nginx/ssl/`)
3. Configure firewall rules
4. Set up backup strategy
5. Enable monitoring (Prometheus/Grafana)

## Backup & Restore

### Backup
```bash
# Database backup
docker-compose exec postgres pg_dump -U danaya danaya_db > backup.sql

# Full backup including volumes
docker-compose down
tar -czf danaya-backup-$(date +%Y%m%d).tar.gz postgres_data/ redis_data/
```

### Restore
```bash
# Restore database
docker-compose exec -T postgres psql -U danaya danaya_db < backup.sql
```

---

**Danaya ka kɛnɛya!** 💙🇧🇫
