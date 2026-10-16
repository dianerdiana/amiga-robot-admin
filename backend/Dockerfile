FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Dependencies first so code changes don't invalidate this layer.
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .
RUN chmod +x docker-entrypoint.sh \
    && useradd --uid 10001 --no-create-home --home-dir /app app \
    && chown -R app:app /app
USER app

EXPOSE 8000

ENTRYPOINT ["./docker-entrypoint.sh"]
# One worker only: the extraction worker runs inside the API process (EXTRACTION_RUN_IN_API).
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*"]
