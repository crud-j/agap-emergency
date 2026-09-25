# s3rver: lightweight S3-compatible dev server on official Node.js image.
# Replaces MinIO for local dev when Docker Hub namespaced images are unavailable.
# Compatible with @aws-sdk/client-s3 PutObject/GetObject in path-style mode.
FROM node:20-alpine

RUN npm install -g s3rver@3.7.1

# Pre-create the bucket — s3rver treats subdirectories as buckets.
RUN mkdir -p /data/agap-media

EXPOSE 9000

ENTRYPOINT [ \
  "s3rver", \
  "--address", "0.0.0.0", \
  "--port", "9000", \
  "--directory", "/data", \
  "--no-vhost-buckets" \
]
