'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

const GRID_BG = {
  backgroundImage:
    'linear-gradient(rgba(29, 78, 216, 0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(29, 78, 216, 0.06) 1px, transparent 1px)',
  backgroundSize: '48px 48px',
};

const FEATURES = [
  {
    tag: '01',
    title: 'AI Resume Tailoring',
    body: 'Paste any job description and AI rewrites your resume to match exact keywords, tone, and requirements — in seconds.',
  },
  {
    tag: '02',
    title: 'ATS Keyword Optimisation',
    body: 'Applicant Tracking Systems filter before humans read. Resume Matcher closes every keyword gap so your application gets through.',
  },
  {
    tag: '03',
    title: 'Professional PDF Export',
    body: 'Export polished PDFs using Swiss design templates — single-column or two-column, always print-ready and recruiter-approved.',
  },
  {
    tag: '04',
    title: 'Multi-Language Support',
    body: 'Generate tailored resumes in English, Spanish, Chinese, Japanese, Portuguese, and Indonesian to target global opportunities.',
  },
  {
    tag: '05',
    title: 'Privacy First',
    body: 'Your data stays in your account session. Your LLM API key is stored only in your browser and never sent to our servers.',
  },
  {
    tag: '06',
    title: '100% Free — Forever',
    body: 'No subscription, no freemium wall. Bring your own LLM API key and configure it once in Settings. Every feature, free.',
  },
];

const STEPS = [
  {
    num: '01',
    label: 'Sign In',
    desc: 'Create a free account or log in. No subscription or credit card needed.',
  },
  {
    num: '02',
    label: 'Upload & Paste',
    desc: 'Add your CV and the job description you are targeting. Our AI analyses every requirement.',
  },
  {
    num: '03',
    label: 'Review & Export',
    desc: 'Accept AI suggestions, customise sections, download a polished PDF.',
  },
];

const FAQS = [
  {
    q: 'Is Resume Matcher really free?',
    a: 'Yes — 100% free with no subscription or hidden fees. A free account is required to access the dashboard. Then bring your own LLM API key (OpenAI, Anthropic, Gemini, DeepSeek, Ollama, and more) and configure it once in Settings.',
  },
  {
    q: 'Do I need to create an account?',
    a: 'Yes — a free account is required to use the AI resume dashboard. Registration is instant and free. No subscription or credit card needed.',
  },
  {
    q: 'Which AI providers are supported?',
    a: 'OpenAI (GPT-4o), Anthropic (Claude), Google Gemini, DeepSeek, OpenRouter, and local Ollama models — all via LiteLLM. You bring your own API key and configure it in Settings after login.',
  },
  {
    q: 'What is ATS and why does it matter?',
    a: 'Applicant Tracking Systems filter resumes before a human reads them. Up to 75% of resumes are rejected by ATS. Resume Matcher optimises your CV to pass these filters with targeted keyword matching.',
  },
  {
    q: 'Can I export as PDF?',
    a: 'Yes. Every resume exports as a professionally formatted PDF using our Swiss design templates — single-column or two-column layout.',
  },
  {
    q: 'Is my resume data private?',
    a: 'Your resume data is stored in your account session. Your LLM API key is stored only in your browser and is never sent to our servers.',
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-black last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left hover:bg-white transition-colors"
      >
        <span className="font-serif text-base font-bold text-black">{q}</span>
        <span className="font-mono text-xl text-[#1D4ED8] shrink-0 leading-none">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="px-6 pb-5">
          <p className="font-sans text-sm text-black opacity-70 leading-relaxed">{a}</p>
        </div>
      )}
    </div>
  );
}

export default function Hero() {
  return (
    <div className="min-h-screen w-full bg-[#F0F0E8] flex flex-col">

      {/* ── NAV ── */}
      <nav className="w-full border-b border-black bg-[#F0F0E8] sticky top-0 z-50" style={GRID_BG}>
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <Image src="/logo.svg" alt="Resume Matcher" width={28} height={28} className="w-7 h-7" />
            <span className="font-mono text-sm font-bold uppercase tracking-widest text-black">
              Resume Matcher
            </span>
          </div>
          <Link
            href="/login"
            className="rounded-none border border-black bg-[#1D4ED8] px-6 py-2 font-mono text-xs font-bold uppercase tracking-wider text-white shadow-[2px_2px_0px_0px_#000000] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all"
          >
            Sign In
          </Link>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section
        className="w-full flex-1 flex items-center justify-center px-6 md:px-12 py-24 md:py-36 bg-[#F0F0E8]"
        style={GRID_BG}
      >
        <div className="max-w-7xl mx-auto w-full border border-black bg-[#F0F0E8] shadow-[8px_8px_0px_0px_rgba(0,0,0,0.08)] px-10 py-16 md:px-20 md:py-24 flex flex-col items-start gap-10">

          {/* Status badges */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 bg-green-700" />
              <span className="font-mono text-xs uppercase tracking-widest text-green-700 font-bold">
                Free*
              </span>
            </div>
            <div className="w-px h-4 bg-black opacity-20" />
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 bg-[#1D4ED8]" />
              <span className="font-mono text-xs uppercase tracking-widest text-[#1D4ED8] font-bold">
                Login Required
              </span>
            </div>
            <div className="w-px h-4 bg-black opacity-20" />
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 bg-amber-500" />
              <span className="font-mono text-xs uppercase tracking-widest text-amber-600 font-bold">
                Use Your Own AI Key
              </span>
            </div>
          </div>

          {/* Headline */}
          <div>
            <h1 className="font-serif text-[clamp(3rem,9vw,8rem)] font-bold leading-[0.92] tracking-tight text-black uppercase selection:bg-[#1D4ED8] selection:text-white">
              Resume
              <br />
              <span className="text-[#1D4ED8]">Matcher</span>
            </h1>
            <p className="mt-6 font-sans text-lg md:text-xl text-black max-w-xl leading-relaxed">
              The free AI tool that tailors your CV to any job description in seconds.
              Boost ATS scores, match keywords, and export beautiful PDFs.
            </p>
          </div>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <Link
              href="/login"
              className="rounded-none border-2 border-black bg-[#1D4ED8] px-10 py-4 font-mono text-sm font-bold uppercase tracking-wider text-white shadow-[4px_4px_0px_0px_#000000] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all"
            >
              Sign In — Free
            </Link>
            <a
              href="#features"
              className="rounded-none border-2 border-black bg-transparent px-10 py-4 font-mono text-sm font-bold uppercase tracking-wider text-black hover:bg-black hover:text-[#F0F0E8] transition-all"
            >
              See Features ↓
            </a>
          </div>

          {/* Footnote */}
          <p className="font-mono text-[11px] text-black opacity-40 leading-relaxed max-w-lg -mt-4">
            * AI features require a free account + your own LLM API key
            (OpenAI, Anthropic, Google Gemini, DeepSeek, OpenRouter, or local Ollama).
            Your key is stored only in your browser and never sent to our servers.
          </p>

          {/* Metrics strip */}
          <div className="flex flex-wrap gap-0 border-t border-black pt-8 w-full">
            {[
              { val: 'Free', label: 'Always*' },
              { val: 'AI', label: 'Powered' },
              { val: 'ATS', label: 'Optimised' },
              { val: 'PDF', label: 'Export' },
            ].map((m, i) => (
              <div key={i} className={`flex flex-col px-8 py-4 ${i !== 0 ? 'border-l border-black' : ''}`}>
                <span className="font-serif text-3xl font-bold text-[#1D4ED8] leading-none">{m.val}</span>
                <span className="font-mono text-xs uppercase tracking-wider text-black mt-1">{m.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" className="w-full bg-[#F0F0E8] border-t border-black">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-20">
          <div className="mb-12">
            <span className="font-mono text-xs uppercase tracking-widest text-[#1D4ED8] font-bold">
              // Capabilities
            </span>
            <h2 className="mt-3 font-serif text-4xl md:text-5xl font-bold uppercase text-black leading-tight">
              Everything You Need
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 border border-black">
            {FEATURES.map((f, i) => (
              <div
                key={i}
                className={[
                  'p-8 md:p-10 bg-[#F0F0E8] hover:bg-white transition-colors',
                  i % 3 !== 2 ? 'lg:border-r border-black' : '',
                  i % 2 === 0 && i % 3 !== 2 ? 'md:border-r border-black lg:border-r-0' : '',
                  i < 3 ? 'lg:border-b border-black' : '',
                  i < 4 ? 'md:border-b border-black lg:border-b-0' : '',
                  i < 5 ? 'border-b border-black lg:border-b-0' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span className="font-mono text-xs uppercase tracking-widest text-[#1D4ED8] font-bold">
                  {f.tag}
                </span>
                <h3 className="mt-3 font-serif text-xl font-bold text-black">{f.title}</h3>
                <p className="mt-3 font-sans text-sm text-black leading-relaxed opacity-70">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="w-full bg-black border-t border-black">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-20">
          <div className="mb-12">
            <span className="font-mono text-xs uppercase tracking-widest text-[#1D4ED8] font-bold">
              // Process
            </span>
            <h2 className="mt-3 font-serif text-4xl md:text-5xl font-bold uppercase text-[#F0F0E8] leading-tight">
              Three Steps
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 border border-[#F0F0E8]">
            {STEPS.map((s, i) => (
              <div
                key={i}
                className={[
                  'p-8 md:p-10',
                  i < 2 ? 'md:border-r border-[#F0F0E8]' : '',
                  i < STEPS.length - 1 ? 'border-b md:border-b-0 border-[#F0F0E8]' : '',
                ].filter(Boolean).join(' ')}
              >
                <span className="font-mono text-5xl font-bold text-[#1D4ED8] leading-none">{s.num}</span>
                <h3 className="mt-4 font-serif text-xl font-bold text-[#F0F0E8] uppercase">{s.label}</h3>
                <p className="mt-2 font-sans text-sm text-[#F0F0E8] leading-relaxed opacity-60">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="w-full bg-[#F0F0E8] border-t border-black">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-20">
          <div className="mb-12">
            <span className="font-mono text-xs uppercase tracking-widest text-[#1D4ED8] font-bold">
              // FAQ
            </span>
            <h2 className="mt-3 font-serif text-4xl md:text-5xl font-bold uppercase text-black leading-tight">
              Common Questions
            </h2>
          </div>

          <div className="border border-black">
            {FAQS.map((item, i) => (
              <FaqItem key={i} q={item.q} a={item.a} />
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="w-full bg-[#F0F0E8] border-t border-black" style={GRID_BG}>
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-24 flex flex-col items-center text-center gap-6">
          <span className="font-mono text-xs uppercase tracking-widest text-[#1D4ED8] font-bold">
            // Ready
          </span>
          <h2 className="font-serif text-4xl md:text-6xl font-bold uppercase text-black leading-tight max-w-2xl">
            Land Your Next Role
          </h2>
          <p className="font-sans text-base text-black opacity-60 max-w-md">
            Create a free account or sign in to access the full AI dashboard.
            No subscription required.
          </p>
          <Link
            href="/login"
            className="rounded-none border-2 border-black bg-[#1D4ED8] px-12 py-5 font-mono text-sm font-bold uppercase tracking-wider text-white shadow-[6px_6px_0px_0px_#000000] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[2px_2px_0px_0px_#000000] transition-all"
          >
            Sign In — Free
          </Link>
          <p className="font-mono text-[11px] text-black opacity-30">
            * AI features require your own LLM API key. Configure it in Settings after login.
          </p>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="w-full bg-[#F0F0E8] border-t border-black">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Image src="/logo.svg" alt="Resume Matcher" width={20} height={20} className="w-5 h-5" />
            <span className="font-mono text-xs uppercase tracking-wider text-black font-bold">
              Resume Matcher
            </span>
          </div>
          <div className="flex flex-col items-start sm:items-end gap-1">
            <span className="font-mono text-xs text-black uppercase tracking-wider">
              © {new Date().getFullYear()} Vanszs. All rights reserved.
            </span>
            {/* Subtle upstream attribution — Apache 2.0 requires notice */}
            <span className="font-mono text-[10px] text-black opacity-25 normal-case tracking-normal">
              based on{' '}
              <a
                href="https://github.com/srbhr/Resume-Matcher"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:opacity-60 transition-opacity"
              >
                srbhr/Resume-Matcher
              </a>{' '}
              (Apache 2.0)
            </span>
          </div>
        </div>
      </footer>

    </div>
  );
}
