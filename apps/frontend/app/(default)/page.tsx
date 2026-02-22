import type { Metadata } from 'next';
import Hero from '@/components/home/hero';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://resume.bevansatria.my.id';

export const metadata: Metadata = {
  title: 'Free CV Maker & AI Resume Tailoring — Resume Matcher',
  description:
    'Resume Matcher is a free AI-powered CV maker and resume tailoring tool. Tailor your resume to any job description in seconds, pass ATS filters, and export a polished PDF — no sign-up, no subscription, 100% free.',
  keywords: [
    'free cv maker',
    'free resume builder',
    'AI resume tailoring',
    'resume tailoring tool',
    'ATS resume optimizer',
    'CV tailored to job description',
    'free ATS resume checker',
    'resume keyword optimizer',
    'job application CV builder',
    'AI CV generator free',
  ],
  alternates: {
    canonical: siteUrl,
  },
  openGraph: {
    title: 'Free CV Maker & AI Resume Tailoring — Resume Matcher',
    description:
      'Tailor your CV to any job description with AI — completely free. ATS keyword optimisation, smart rewrites, polished PDF export. No account required.',
    url: siteUrl,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Free CV Maker & AI Resume Tailoring — Resume Matcher',
    description:
      'Free AI resume builder and CV tailoring tool. Beat ATS, match job keywords, export polished PDFs. No subscription or sign-up needed.',
  },
};

// Prevent caching of landing page to avoid redirect loops on mobile browsers
export const dynamic = 'force-dynamic';
export const revalidate = 0;

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
      'Free AI-powered CV maker and resume tailoring tool. Tailor your resume to any job description, pass ATS filters, and export polished PDFs — 100% free, no subscription.',
    alternateName: ['Free CV Maker', 'Free Resume Builder', 'AI Resume Tailoring Tool'],
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      description: 'Free — no subscription required',
    },
    featureList: [
      'Free AI resume tailoring to job descriptions',
      'ATS keyword optimisation and gap analysis',
      'CV builder with professional Swiss design templates',
      'PDF export — single and two-column layouts',
      'Multi-language support (EN, ES, ZH, JA, PT, ID)',
      'Bring your own AI key (OpenAI, Anthropic, Gemini, Ollama)',
      'No account required, no subscription',
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
        name: 'Is Resume Matcher really free?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes — 100% free with no subscription or hidden fees. You can bring your own AI API key (OpenAI, Anthropic, Gemini, etc.) or use the shared instance at no cost.',
        },
      },
      {
        '@type': 'Question',
        name: 'Do I need to create an account?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'No account required to start. You can use the full resume builder and tailoring features without signing up.',
        },
      },
      {
        '@type': 'Question',
        name: 'What is ATS and why does it matter?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Applicant Tracking Systems are software used by recruiters to filter resumes before a human reads them. Up to 75% of resumes are rejected by ATS — Resume Matcher optimises your CV to pass these filters.',
        },
      },
      {
        '@type': 'Question',
        name: 'Which AI providers are supported?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'OpenAI (GPT-4o), Anthropic (Claude), Google Gemini, DeepSeek, OpenRouter, and local Ollama models are all supported via LiteLLM.',
        },
      },
      {
        '@type': 'Question',
        name: 'Can I export my resume as PDF?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes. Every resume can be exported as a professionally formatted PDF using our Swiss design templates — single-column or two-column layout.',
        },
      },
      {
        '@type': 'Question',
        name: 'Is my resume data private?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Your resume data is stored locally in your browser session. We do not upload or store your personal data on any server beyond what is needed to generate the AI response.',
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

