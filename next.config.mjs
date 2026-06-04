import { withSentryConfig } from '@sentry/nextjs'

/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      { source: '/links', destination: '/l', permanent: true },
      // TIM-2307: link-in-bio destination shims. Stopgap until dedicated /trial
      // and /features pages exist; /affiliates lands on the live apply form
      // since the public affiliate landing is gated on TIM-1604.
      { source: '/trial', destination: '/signup?ref=trial', permanent: false },
      { source: '/affiliates', destination: '/affiliates/apply', permanent: false },
      { source: '/features', destination: '/landing#how-it-works', permanent: false },
    ];
  },
  outputFileTracingIncludes: {
    '/api/**': ['./public/fonts/**/*'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        pathname: '/photo-*',
      },
      {
        protocol: 'https',
        hostname: 'images.pexels.com',
        pathname: '/photos/**',
      },
    ],
    formats: ['image/avif', 'image/webp'],
  },
}

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
  automaticVercelMonitors: true,
  tunnelRoute: "/monitoring",
})
