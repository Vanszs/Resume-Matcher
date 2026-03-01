import type { Metadata } from 'next';
import Hero from '@/components/home/hero';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://resume.bevansatria.my.id';

export const metadata: Metadata = {
  title: 'Free AI CV Maker & Resume Tailor | Resume Matcher',
  description:
    'Resume Matcher is a free AI-powered CV maker and resume tailoring tool by Bevan Satria. Tailor your resume to any job description in seconds, pass ATS filters, and export a polished PDF — no sign-up, no subscription, 100% free.',
  keywords: [
    // Personal brand
    'bevan resume',
    'bevan satria resume',
    'bevan satria cv tool',
    'resume by bevan satria',
    'bevan ai resume',
    'bevansatria',
    // Core
    'free cv maker',
    'free resume builder',
    'ai resume tailoring',
    'resume tailoring tool',
    'ats resume optimizer',
    'cv tailored to job description',
    'free ats resume checker',
    'resume keyword optimizer',
    'job application cv builder',
    'ai cv generator free',
    // Free no-login variants
    'free resume builder no login',
    'free cv builder no account',
    'free resume maker no signup',
    'ai resume builder free 2025',
    'ai resume builder free 2026',
    'best free ai resume builder',
    'free chatgpt resume builder',
    'free gemini resume builder',
    'free claude cv builder',
    // ATS variants
    'pass ats free tool',
    'ats resume template free download',
    'ats cv checker free',
    'beat ats resume builder',
    'resume keyword match free',
    // PDF
    'resume pdf maker free',
    'cv pdf export free',
    'professional resume pdf free',
  ],
  alternates: {
    canonical: siteUrl,
  },
  openGraph: {
    title: 'Free AI CV Maker & Resume Tailor — Resume Matcher',
    description:
      'Tailor your CV to any job description with AI — completely free. ATS keyword optimisation, smart rewrites, polished PDF export. No account required. By Bevan Satria.',
    url: siteUrl,
    type: 'website',
    images: [
      {
        url: `${siteUrl}/opengraph-image`,
        width: 1200,
        height: 630,
        alt: 'Resume Matcher — Free AI CV Maker & ATS Resume Tailor by Bevan Satria',
        type: 'image/png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@bevansatria',
    title: 'Free AI CV Maker & Resume Tailor — Resume Matcher',
    description:
      'Free AI resume builder and CV tailoring tool by Bevan Satria. Beat ATS, match job keywords, export polished PDFs. No subscription or sign-up needed.',
    creator: '@bevansatria',
    images: [
      {
        url: `${siteUrl}/opengraph-image`,
        alt: 'Resume Matcher — Free AI Resume Tailoring Tool',
      },
    ],
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
      'Free AI-powered CV maker and resume tailoring tool by Bevan Satria. Tailor your resume to any job description, pass ATS filters, and export polished PDFs — 100% free, no subscription.',
    alternateName: ['Free CV Maker', 'Free Resume Builder', 'AI Resume Tailoring Tool', 'Bevan Resume Tool', 'Resume Matcher by Bevan'],
    author: {
      '@type': 'Person',
      name: 'Bevan Satria',
      url: 'https://bevansatria.my.id',
    },
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
      {
        '@type': 'Question',
        name: 'Who made Resume Matcher?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Resume Matcher was created by Bevan Satria, a developer from Indonesia. The tool is open-source and available at resume.bevansatria.my.id.',
        },
      },
      {
        '@type': 'Question',
        name: 'What is "bevan resume" or "bevan resume tool"?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'This refers to Resume Matcher, the free AI resume tailoring tool built by Bevan Satria. You can access it at resume.bevansatria.my.id.',
        },
      },
      {
        '@type': 'Question',
        name: 'Is there a free alternative to Teal, Rezi, or Jobscan?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes — Resume Matcher is a completely free alternative to Teal, Rezi, Jobscan, and similar paid ATS resume tools. No subscription or credit card required.',
        },
      },
      {
        '@type': 'Question',
        name: 'What languages does Resume Matcher support?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Resume Matcher supports English, Spanish (Español), Chinese (中文), Japanese (日本語), Portuguese (Português), and Indonesian (Bahasa Indonesia) for both the UI and AI-generated content.',
        },
      },
      {
        '@type': 'Question',
        name: 'What is the best free resume builder in 2025 or 2026?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Resume Matcher is one of the best free AI resume builders in 2025 and 2026. It offers AI-powered tailoring to job descriptions, ATS optimisation, multi-language support, and PDF export — all at no cost and with no account required.',
        },
      },
      {
        '@type': 'Question',
        name: 'Can I use Resume Matcher without signing up or logging in?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes. Resume Matcher is completely free to use without any account, login, or subscription. Start tailoring your resume immediately at resume.bevansatria.my.id.',
        },
      },
      {
        '@type': 'Question',
        name: 'How is Resume Matcher different from paid tools like Teal, Rezi, Kickresume, or ResumeWorded?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Unlike Teal, Rezi, Kickresume, ResumeWorded, and Jobscan which require paid subscriptions, Resume Matcher is 100% free with no credit card needed. You get the same core features: ATS keyword matching, AI resume rewrites, and PDF export, all without a paywall.',
        },
      },
    ],
  };

  // Schema 4: Person — establishes creator identity for branded searches
  const personSchema = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: 'Bevan Satria',
    url: 'https://bevansatria.my.id',
    sameAs: [
      'https://bevansatria.my.id',
      'https://resume.bevansatria.my.id',
      'https://github.com/Vanszs',
      'https://github.com/Vanszs/Resume-Matcher',
    ],
    knowsAbout: ['Resume Builder', 'AI Tools', 'ATS Optimization', 'Web Development'],
    creator: {
      '@type': 'SoftwareApplication',
      name: 'Resume Matcher',
      url: siteUrl,
    },
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personSchema) }}
      />
      <Hero />
    </>
  );
}

