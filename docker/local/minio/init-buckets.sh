#!/bin/sh

set -eu

: "${MINIO_ENDPOINT:?MINIO_ENDPOINT is required}"
: "${MINIO_ROOT_USER:?MINIO_ROOT_USER is required}"
: "${MINIO_ROOT_PASSWORD:?MINIO_ROOT_PASSWORD is required}"
: "${MINIO_PUBLIC_BUCKET:?MINIO_PUBLIC_BUCKET is required}"
: "${MINIO_PRIVATE_BUCKET:?MINIO_PRIVATE_BUCKET is required}"

mc alias set local "${MINIO_ENDPOINT}" "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}" >/dev/null

mc mb --ignore-existing "local/${MINIO_PUBLIC_BUCKET}"
mc mb --ignore-existing "local/${MINIO_PRIVATE_BUCKET}"

# Public media is readable for local development, but anonymous writes remain denied.
mc anonymous set download "local/${MINIO_PUBLIC_BUCKET}"

# Private objects always require authenticated access.
mc anonymous set none "local/${MINIO_PRIVATE_BUCKET}"

echo "MinIO buckets and anonymous-access policies are configured."
