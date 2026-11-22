import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The metrics read data/orders.csv from disk at request time. Ship it with
  // every server function on Vercel, or deployed charts would come up empty.
  outputFileTracingIncludes: {
    "/api/chat": ["./data/orders.csv"],
    "/api/metrics": ["./data/orders.csv"],
    "/dashboard": ["./data/orders.csv"],
  },
};

export default nextConfig;
