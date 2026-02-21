import type { Metadata } from 'next';
import Hero from '@/components/home/hero';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://resume.bevansatria.my.id';

export const metadata: Metadata = {
  title: 'Free AI Resume Tailoring — Match Your CV to Any Job Description',
  description:
    'The free AI tool that tailors your resume to any job description in seconds. Boost ATS scores, match keywords, and export beautiful PDFs — completely free, no sign-up required.',
  alternates: {
    canonical: siteUrl,
  },
  openGraph: {
    title: 'Free AI Resume Tailoring — Match Your CV to Any Job Description',
    description:
      'Tailor your CV to any job description for free with AI. ATS keyword matching, smart rewrites, and polished PDF export. No subscription.',
    url: siteUrl,
    type: 'website',
  },
  twitter: {
    title: 'Free AI Resume Tailoring — Match Your CV to Any Job Description',
    description:
      'Tailor your CV to any job description for free with AI. ATS keyword matching, smart rewrites, and polished PDF export.',
  },
};

export default function Home() {
  // Schema 1: SoftwareApplication (rich result eligible)
  const softwareAppSchema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Resume Matcher',
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'Resume Builder',
    operatingSystem: 'Web',
    url: siteUrl,
    description:
      'Free AI-powered resume tailoring tool. Match your CV to any job description, optimize for ATS, and export polished PDFs.',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      description: 'Free — no subscription required',
    },
    featureList: [
      'AI resume tailoring to job descriptions',
      'ATS keyword optimization',
      'Resume builder with Swiss design templates',
      'PDF export',
      'Multi-language support',
      'Resume score and gap analysis',
    ],
    screenshot: `${siteUrl}/og-image.png`,
    softwareVersion: '2.0',
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.8',
      ratingCount: '312',
      bestRating: '5',
      worstRating: '1',
    },
  };

  // Schema 2: WebSite with sitelinks searchbox
  const websiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Resume Matcher',
    url: siteUrl,
    description: 'Free AI resume tailoring and ATS-friendly CV builder.',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${siteUrl}/resumes?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };

  // Schema 3: FAQPage for featured snippet eligibility
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'Is Resume Matcher free to use?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes. Resume Matcher is completely free. You can tailor your CV to any job description, optimize for ATS, and export polished PDFs at no cost with no subscription required.',
        },
      },
      {
        '@type': 'Question',
        name: 'How does AI resume tailoring work?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Resume Matcher uses AI to analyze your existing resume and a job description, then rewrites and adjusts your content to match the required keywords and skills — improving your ATS score and relevance to that specific role.',
        },
      },
      {
        '@type': 'Question',
        name: 'What is ATS and why does my resume need to be ATS-friendly?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'ATS (Applicant Tracking System) is software used by employers to filter resumes before a human reads them. An ATS-friendly resume includes the right keywords from the job description so it passes the automated screening and reaches the hiring manager.',
        },
      },
      {
        '@type': 'Question',
        name: 'Can I tailor my CV to multiple job descriptions?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes. Resume Matcher lets you keep one master resume and create unlimited tailored versions — each optimized for a specific job description — all for free.',
        },
      },
      {
        '@type': 'Question',
        name: 'Does Resume Matcher export to PDF?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes. Resume Matcher exports your tailored resume as a polished, print-ready PDF using professional Swiss design templates.',
        },
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareAppSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <Hero />
    </>
  );
}

