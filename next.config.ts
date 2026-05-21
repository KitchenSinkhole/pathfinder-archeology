import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  typedRoutes: true,
  serverExternalPackages: ['pg', 'graphile-worker'],
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
