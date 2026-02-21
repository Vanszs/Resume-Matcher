import type { MetadataRoute } from 'next';

// NOTE: public/robots.txt TAKES PRECEDENCE over this file in Next.js.
// Edit public/robots.txt directly for production changes.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://resume.bevansatria.my.id';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/'],
        disallow: [
          '/login',
          '/admin',
          '/dashboard',
          '/builder',
          '/tailor',
          '/resumes',
          '/settings',
          '/print',
          '/api',
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
