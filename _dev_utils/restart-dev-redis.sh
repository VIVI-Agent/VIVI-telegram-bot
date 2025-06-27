#!/usr/bin/env bash
# restart-redis.sh

# 1) Stop the existing container (if running)
docker container stop redis_local || true

# 2) Remove all stopped containers (force, no prompt)
docker container prune -f

# 3) Run a new redis_local container on port 6379
docker run -d --name redis_local -p 6379:6379 redis

# 4) Follow the logs
docker logs redis_local -f
