import type { Metadata } from 'next';
import { Geist, Space_Grotesk } from 'next/font/google';
import './(default)/css/globals.css';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://resume.bevansatria.my.id';

const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin'],
  display: 'swap',
});

const geist = Geist({
  variable: '--font-geist',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Resume Matcher - AI Resume Builder & Job Tailoring',
    template: '%s | Resume Matcher',
  },
  description:
    'Create ATS-friendly resumes, tailor content to job descriptions, and export polished PDFs with AI assistance.',
  applicationName: 'Resume Matcher',
  keywords: [
    'ai resume builder',
    'resume tailoring',
    'ats resume optimization',
    'job application resume',
    'resume matcher',
  ],
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
    title: 'Resume Matcher - AI Resume Builder & Job Tailoring',
    description:
      'Create ATS-friendly resumes, tailor content to job descriptions, and export polished PDFs with AI assistance.',
    images: [
      {
        url: '/logo.svg',
        width: 1200,
        height: 630,
        alt: 'Resume Matcher',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Resume Matcher - AI Resume Builder & Job Tailoring',
    description:
      'Create ATS-friendly resumes, tailor content to job descriptions, and export polished PDFs with AI assistance.',
    images: ['/logo.svg'],
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
        className={`${geist.variable} ${spaceGrotesk.variable} antialiased bg-[#F0F0E8] text-gray-900 min-h-full`}
      >
        {children}
      </body>
    </html>
  );
}
