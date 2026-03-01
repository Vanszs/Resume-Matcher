import type { MetadataRoute } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://resume.bevansatria.my.id';

export default function sitemap(): MetadataRoute.Sitemap {
  // NOTE: public/sitemap.xml takes precedence over this file in Next.js.
  // Keep this in sync with public/sitemap.xml manually.
  // Only include URLs that are NOT disallowed in robots.txt.
  const lastModified = new Date('2026-03-01');
  return [
    {
      url: siteUrl,
      lastModified,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${siteUrl}/internships`,
      lastModified,
      changeFrequency: 'daily',
      priority: 0.8,
    },
  ];
}
