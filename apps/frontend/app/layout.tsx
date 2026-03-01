import type { Metadata } from 'next';
import { Inter, IBM_Plex_Mono, Playfair_Display } from 'next/font/google';
import './(default)/css/globals.css';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://resume.bevansatria.my.id';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: '--font-ibm-plex-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
});

const playfairDisplay = Playfair_Display({
  variable: '--font-playfair',
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  style: ['normal', 'italic'],
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Free AI Resume Tailor & ATS Builder | Resume Matcher',
    template: '%s | Resume Matcher',
  },
  description:
    'Tailor your CV or resume to any job description for free using AI. Build ATS-friendly resumes, match keywords instantly, and export polished PDFs — no subscription, no cost. Made by Bevan Satria.',
  applicationName: 'Resume Matcher',
  keywords: [
    // Brand + personal
    'Resume Matcher',
    'resume.bevansatria.my.id',
    'bevan resume',
    'bevan satria resume',
    'bevan satria cv',
    'bevan satria ai tool',
    'resume by bevan',
    'cv maker bevan',
    'bevansatria resume tool',
    // Core tool
    'free resume tailor',
    'free cv tailor',
    'free ai resume builder',
    'tailor resume to job description',
    'ats resume checker free',
    'resume keyword matcher',
    'ai cv builder',
    'free resume optimizer',
    'ats friendly resume builder',
    'cv to job description match',
    'free resume tailoring tool',
    'ai resume writer free',
    'resume tailoring tool',
    'cv builder free',
    'resume builder ai',
    'match resume to job description free',
    'ats optimization free',
    'job application cv builder',
    'resume keyword optimization',
    'free ats resume checker',
    'ai powered resume builder',
    'tailor cv free',
    'resume job match',
    // Free AI variants
    'free ai cv',
    'free ai resume',
    'ai resume free no signup',
    'free resume ai tool',
    'ai cv generator free no account',
    'free chatgpt resume builder',
    'gpt resume builder free',
    'openai resume builder',
    'claude resume builder',
    'gemini resume builder',
    'llm resume tailor',
    'free llm resume',
    // ATS + job search
    'beat ats resume',
    'pass ats resume',
    'ats resume template free',
    'ats optimized cv',
    'ats keyword scanner',
    'resume ats scan free',
    'applicant tracking system resume',
    'job description keyword extractor',
    'resume gap analysis',
    'resume score free',
    // CV maker variants
    'cv maker free',
    'cv builder online free',
    'resume builder online free',
    'online resume maker',
    'create resume free',
    'make cv online free',
    'build resume free',
    'resume generator free',
    'pdf resume builder free',
    'resume pdf export',
    // Long-tail search
    'how to tailor resume to job description ai',
    'best free ai resume builder 2025',
    'best free ai resume builder 2026',
    'resume tailoring tool no subscription',
    'free resume builder no account',
    'free cv builder no sign up',
    'free resume maker no login',
    // Competitor alternative searches
    'free alternative to teal resume',
    'free alternative to rezi',
    'free alternative to jobscan',
    'free alternative to kickresume',
    'free alternative to resumeworded',
    'free alternative to enhancv',
    'resume free tool',
    'resume free online',
    'free resume',
    'free cv',
  ],
  authors: [{ name: 'Bevan Satria', url: 'https://bevansatria.my.id' }],
  creator: 'Bevan Satria',
  publisher: 'Resume Matcher',
  category: 'Career Tools',
  classification: 'Resume Builder, CV Tailor, Job Application Tool',
  alternates: {
    canonical: '/',
    languages: {
      'x-default': '/',
      'en-US': '/',
      'es-ES': '/',
      'zh-CN': '/',
      'ja-JP': '/',
      'pt-BR': '/',
      'id-ID': '/',
    },
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  openGraph: {
    type: 'website',
    url: siteUrl,
    siteName: 'Resume Matcher',
    title: 'Free AI Resume Tailoring — Match Your CV to Any Job',
    description:
      'Tailor your CV or resume to any job description for free using AI. Build ATS-friendly resumes, match keywords instantly, and export polished PDFs — no subscription needed. By Bevan Satria.',
    locale: 'en_US',
    alternateLocale: ['es_ES', 'zh_CN', 'ja_JP', 'pt_BR', 'id_ID'],
    images: [
      {
        url: `${siteUrl}/opengraph-image`,
        width: 1200,
        height: 630,
        alt: 'Resume Matcher — Free AI Resume Tailoring Tool by Bevan Satria',
        type: 'image/png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@bevansatria',
    title: 'Free AI Resume Tailoring — Match Your CV to Any Job',
    description:
      'Tailor your CV to any job description for free using AI. ATS-friendly, keyword-matched, PDF export. No subscription. By Bevan Satria.',
    creator: '@bevansatria',
    images: [
      {
        url: `${siteUrl}/opengraph-image`,
        alt: 'Resume Matcher — Free AI Resume Tailoring Tool',
      },
    ],
  },
  icons: {
    icon: '/logo.svg',
    shortcut: '/logo.svg',
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Resume Matcher',
    url: siteUrl,
    logo: `${siteUrl}/logo.svg`,
    description: 'Free AI-powered resume tailoring and ATS optimization tool.',
    founder: {
      '@type': 'Person',
      name: 'Bevan Satria',
      url: 'https://bevansatria.my.id',
    },
    sameAs: [
      'https://bevansatria.my.id',
      'https://resume.bevansatria.my.id',
      'https://github.com/Vanszs/Resume-Matcher',
    ],
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      description: 'Free — no subscription required',
    },
  };

  return (
    <html lang="en-US" className="h-full" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${ibmPlexMono.variable} ${playfairDisplay.variable} antialiased bg-[#f0eee5] text-black min-h-full font-sans`}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
        {children}
      </body>
    </html>
  );
}
