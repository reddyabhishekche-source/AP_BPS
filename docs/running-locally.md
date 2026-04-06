# Running locally

## 1) Start dependencies

This project uses Redis (BullMQ) and Postgres.

- Start both with Docker: `docker compose up -d`
- Verify Redis is reachable: `Test-NetConnection 127.0.0.1 -Port 6379 -InformationLevel Quiet`

If Redis is not running, **queues will enqueue but workers won’t process** (jobs stay waiting / commands sit in the Redis client offline queue).

## 2) Configure environment

- Copy `.env.example` to `.env` and update values as needed.
- Minimum required for queue processing:
  - `REDIS_URL=redis://localhost:6379`
  - `DATABASE_URL=...`

## 3) Run the app

- `npm run dev`

