#!/bin/sh
set -e

# Default the container to the UAT stage while still allowing overrides when needed.
STAGE="${STAGE:-uat}"

# Start the local NATS server required by the app's hybrid microservice transport.
nats-server -p 4222 -m 8222 &

# Use a non-watch runtime path for the UAT container while keeping the existing local script intact.
if [ "$STAGE" = "uat" ]; then
  bun run start:uat:docker
else
  bun run "start:${STAGE}"
fi