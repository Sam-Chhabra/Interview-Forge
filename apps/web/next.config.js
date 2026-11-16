/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },

  turbopack: {
    root: __dirname,
  },

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
