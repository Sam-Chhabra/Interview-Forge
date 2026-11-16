/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Tell Turbopack this directory is the project root.
  // Required because apps/web sits inside a monorepo alongside apps/api,
  // which confuses Turbopack's automatic root detection.
  turbopack: {
    root: __dirname,
  },

  // In standalone local dev (outside Vercel Services), proxy /api/* to the
  // FastAPI backend so client-side fetch('/api/...') works identically to
  // Vercel's top-level `/api/(.*)` -> `api` service rewrite.
  async rewrites() {
    if (process.env.VERCEL) {
      return [];
    }
    const target =
      process.env.API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      'http://localhost:8000';
    return [
      {
        source: '/api/:path*',
        destination: `${target.replace(/\/$/, '')}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
