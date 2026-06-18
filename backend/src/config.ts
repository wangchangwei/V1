// Centralized configuration for the V1 backend.
// All sensitive or environment-dependent values live here so service modules
// can stay declarative and testable.

export const config = {
  pi: {
    image: process.env.PI_IMAGE ?? "v1-pi:latest",
    internalPort: Number(process.env.PI_INTERNAL_PORT ?? 7890),
    hostPortRange: { start: 9000, size: 100 },
    healthCheck: {
      initialWaitMs: 2000,
      retryIntervalMs: 2000,
      maxAttempts: 5,
    },
    containerResources: {
      memory: "2g",
      cpus: "2",
      pidsLimit: 256,
    },
    // Shared secret for host<->pi-container auth on /v1/chat/completions.
    // When unset, startPiContainer mints a per-process random secret and
    // every container it spawns shares it (since they're per-host).
    // Set PI_SECRET in the host environment to pin a stable value across restarts.
    secret: process.env.PI_SECRET ?? "",
  },
} as const;
