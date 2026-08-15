import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    'humble-lamp-qw7j5wjvv9v2jx6-3000.app.github.dev',
  ],

  experimental: {
    serverActions: {
      allowedOrigins: [
        'humble-lamp-qw7j5wjvv9v2jx6-3000.app.github.dev',
      ],
    },
  },
}

export default nextConfig