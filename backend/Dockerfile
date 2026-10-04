FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000
# Apply any pending migrations before serving. The deploy itself migrates, from
# inside the server's own network, so new code never runs against an old schema
# and the database never needs a public port opened for it. If a migration
# fails the container exits instead of serving, and the failure shows up in the
# Dokploy deploy log.
CMD ["sh", "-c", "alembic upgrade head && exec fastapi run app/main.py --port 8000"]
