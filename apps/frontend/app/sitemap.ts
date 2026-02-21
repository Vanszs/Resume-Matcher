import type { MetadataRoute } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://resume.bevansatria.my.id';

export default function sitemap(): MetadataRoute.Sitemap {
  // NOTE: public/sitemap.xml takes precedence over this file in Next.js.
  // Keep this in sync with public/sitemap.xml manually.
  return [
    {
      url: siteUrl,
      lastModified: new Date('2026-02-21'),
      changeFrequency: 'weekly',
      priority: 1,
    },
  ];
}
