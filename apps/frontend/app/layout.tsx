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
    default: 'Free AI Resume Tailoring & ATS Resume Builder | Resume Matcher',
    template: '%s | Resume Matcher',
  },
  description:
    'Tailor your CV or resume to any job description for free using AI. Build ATS-friendly resumes, match keywords instantly, and export polished PDFs — no subscription, no cost.',
  applicationName: 'Resume Matcher',
  keywords: [
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
    'resume matcher',
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
  ],
  authors: [{ name: 'Resume Matcher' }],
  creator: 'Resume Matcher',
  publisher: 'Resume Matcher',
  category: 'Career Tools',
  classification: 'Resume Builder, CV Tailor, Job Application Tool',
  alternates: {
    canonical: '/',
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
      'Tailor your CV or resume to any job description for free using AI. Build ATS-friendly resumes, match keywords instantly, and export polished PDFs — no subscription needed.',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Free AI Resume Tailoring — Match Your CV to Any Job',
    description:
      'Tailor your CV to any job description for free using AI. ATS-friendly, keyword-matched, PDF export. No subscription.',
  },
  icons: {
    icon: '/logo.svg',
    shortcut: '/logo.svg',
    apple: '/logo.svg',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-US" className="h-full" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${ibmPlexMono.variable} ${playfairDisplay.variable} antialiased bg-[#f0eee5] text-black min-h-full font-sans`}
      >
        {children}
      </body>
    </html>
  );
}
