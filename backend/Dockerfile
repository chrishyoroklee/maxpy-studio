FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY pyproject.toml .
RUN pip install --no-cache-dir fastapi uvicorn litellm pydantic-settings python-multipart numpy maxpylang

# Copy application
COPY app/ app/
COPY sandbox/ sandbox/

# Create output directory
RUN mkdir -p /app/generated

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
