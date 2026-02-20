import Hero from '@/components/home/hero';

export default function Home() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://resume.bevansatria.my.id';

  const webApplicationSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Resume Matcher',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: siteUrl,
    description:
      'AI-powered resume builder and job tailoring platform for creating ATS-friendly resumes.',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(webApplicationSchema),
        }}
      />
      <Hero />
    </>
  );
}
