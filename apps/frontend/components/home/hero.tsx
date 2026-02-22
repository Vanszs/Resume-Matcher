'use client';

import React, { useState } from 'react';
import Link from 'next/link';

const GRID_BG = {
  backgroundImage:
    'linear-gradient(rgba(29, 78, 216, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(29, 78, 216, 0.05) 1px, transparent 1px)',
  backgroundSize: '48px 48px',
};

const PAIN_POINTS = [
  {
    num: '01',
    title: 'The Manual Edit Loop',
    body: 'Wasting hours shuffling bullet points only to see the job posting expire before you hit send.',
  },
  {
    num: '02',
    title: 'The Silent Rejection',
    body: 'One keyword mismatch or formatting glitch and your resume hits the trash pile. You will never even know why.',
  },
  {
    num: '03',
    title: 'The ATS Black Hole',
    body: 'Blindly guessing keywords against an algorithm literally programmed to reject you. Stop guessing.',
  },
];

const FEATURES = [
  {
    tag: '01',
    title: 'AI-Powered Analysis',
    body: 'You missed half the requirements. We didn\'t. We find the fine print you ignored so you stop wasting everyone\'s time.',
  },
  {
    tag: '02',
    title: 'Keyword Wizardry',
    body: 'Stop guessing keywords. We pull the exact technical terms the algorithm wants. Feed the bot what it needs.',
  },
  {
    tag: '03',
    title: 'Score Everything',
    body: 'Your friends lie to be nice. Our scoring engine doesn\'t. If your match rate is low, fix it before you hit send.',
  },
  {
    tag: '04',
    title: 'Multi-Language CVs',
    body: 'Generate tailored resumes in English, Spanish, Chinese, Japanese, Portuguese, and Indonesian.',
  },
  {
    tag: '05',
    title: 'Print-Ready PDF Export',
    body: 'Export polished PDFs using Swiss design templates — single-column or two-column, always recruiter-approved.',
  },
  {
    tag: '06',
    title: 'Your Data, Your Account',
    body: 'Resume data and your API key are stored per-user on our server. Your key only calls your chosen AI provider — never shared.',
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
    desc: 'Add your master CV once. Paste any job description you are targeting.',
  },
  {
    num: '03',
    label: 'Review & Export',
    desc: 'Accept AI keyword suggestions, customise sections, download a polished PDF.',
  },
];

const FAQS = [
  {
    q: 'Is Resume Matcher really free?',
    a: 'Yes — 100% free, no subscription. A free account is required. Bring your own LLM API key (OpenAI, Anthropic, Gemini, DeepSeek, Ollama, and more) and configure it once in Settings.',
  },
  {
    q: 'Do I need to create an account?',
    a: 'Yes — a free account is required to use the AI dashboard. Registration is instant. No credit card needed.',
  },
  {
    q: 'Which AI providers are supported?',
    a: 'OpenAI (GPT-4o), Anthropic (Claude), Google Gemini, DeepSeek, OpenRouter, and local Ollama — all via LiteLLM. Bring your own key.',
  },
  {
    q: 'What is ATS and why does it matter?',
    a: 'Applicant Tracking Systems filter resumes before a human reads them. Up to 75% of resumes are rejected by ATS. Resume Matcher optimises your CV to pass every filter.',
  },
  {
    q: 'Can I export as PDF?',
    a: 'Yes. Every resume exports as a professionally formatted PDF using our Swiss design templates — single or two-column layout.',
  },
  {
    q: 'Is my data private?',
    a: 'Your resume data and API key are stored securely in your account on our server. Your key is only used to forward requests to your chosen AI provider and is never shared with third parties.',
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
      <nav className="w-full border-b-2 border-black bg-white sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 md:px-10 flex items-center justify-between h-14">
          {/* Logo */}
          <div className="flex items-center gap-2 border-2 border-black px-3 py-1.5 bg-white shadow-[2px_2px_0px_0px_#000000]">
            <span className="font-mono text-xs font-bold text-[#1D4ED8]">✳</span>
            <span className="font-mono text-xs font-bold uppercase tracking-widest text-black">
              Resume Matcher
            </span>
          </div>
          {/* Nav links */}
          <div className="hidden md:flex items-center gap-1">
            {[
              { label: 'Features', href: '#features' },
              { label: 'How It Works', href: '#how-it-works' },
              { label: 'FAQ', href: '#faq' },
            ].map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="px-4 py-1.5 font-sans text-sm text-black hover:text-[#1D4ED8] transition-colors"
              >
                {l.label}
              </a>
            ))}
          </div>
          {/* CTA */}
          <Link
            href="/login"
            className="rounded-none border-2 border-black bg-[#1D4ED8] px-5 py-2 font-mono text-xs font-bold uppercase tracking-wider text-white shadow-[2px_2px_0px_0px_#000000] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all"
          >
            Sign In →
          </Link>
        </div>
      </nav>

      {/* ── HERO (2-col split) ── */}
      <section className="w-full bg-[#F0F0E8] border-b-2 border-black" style={GRID_BG}>
        <div className="max-w-7xl mx-auto px-6 md:px-10 py-16 md:py-24 grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">

          {/* Left */}
          <div className="flex flex-col gap-8">
            {/* Status badges */}
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 border border-black bg-white px-3 py-1 font-mono text-[10px] uppercase tracking-widest font-bold text-green-700 shadow-[1px_1px_0px_0px_#000]">
                <span className="w-1.5 h-1.5 bg-green-700 inline-block" />
                Free*
              </span>
              <span className="inline-flex items-center gap-1.5 border border-black bg-white px-3 py-1 font-mono text-[10px] uppercase tracking-widest font-bold text-[#1D4ED8] shadow-[1px_1px_0px_0px_#000]">
                <span className="w-1.5 h-1.5 bg-[#1D4ED8] inline-block" />
                Login Required
              </span>
              <span className="inline-flex items-center gap-1.5 border border-black bg-white px-3 py-1 font-mono text-[10px] uppercase tracking-widest font-bold text-amber-600 shadow-[1px_1px_0px_0px_#000]">
                <span className="w-1.5 h-1.5 bg-amber-500 inline-block" />
                Bring Your API Key
              </span>
            </div>

            {/* Headline */}
            <h1 className="font-serif font-bold leading-[0.95] tracking-tight text-black" style={{ fontSize: 'clamp(2.8rem, 6vw, 5.5rem)' }}>
              Finding a job<br />
              is{' '}
              <span className="bg-black text-[#F0F0E8] px-2 italic">Hard.</span>
              <br />
              We make it<br />
              <span className="bg-[#1D4ED8] text-white px-2">easier.</span>
            </h1>

            <p className="font-sans text-base md:text-lg text-black opacity-75 leading-relaxed max-w-lg">
              Stop starting from scratch. We optimise your master resume to instantly generate
              tailored CVs for every job you want — and beat the ATS while doing it.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-3 items-start">
              <Link
                href="/login"
                className="rounded-none border-2 border-black bg-[#1D4ED8] px-8 py-3.5 font-mono text-sm font-bold uppercase tracking-wider text-white shadow-[4px_4px_0px_0px_#000000] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all"
              >
                Get Started →
              </Link>
              <a
                href="#demo"
                className="rounded-none border-2 border-black bg-white px-8 py-3.5 font-mono text-sm font-bold uppercase tracking-wider text-black hover:bg-[#F0F0E8] transition-all shadow-[4px_4px_0px_0px_#000000] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none"
              >
                Watch Demo ↓
              </a>
            </div>

            {/* Footnote */}
            <p className="font-mono text-[10px] text-black opacity-35 leading-relaxed max-w-md">
              * AI features are free — platform &amp; templates included. Just bring your own LLM API key
              (OpenAI, Anthropic, Gemini, DeepSeek, OpenRouter, or local Ollama).
              Your key is saved to your account and used only to call your chosen AI provider.
            </p>
          </div>

          {/* Right — Stacked collage photos */}
          <div className="relative flex items-center justify-center min-h-[480px] md:min-h-[560px]">
            {/* Back card — glitch face, rotated right */}
            <div
              className="absolute w-[58%] aspect-[3/4] border-2 border-black overflow-hidden shadow-[6px_6px_0px_0px_#1D4ED8]"
              style={{ rotate: '7deg', bottom: '2%', right: '2%' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/hero-2.jpg"
                alt=""
                aria-hidden="true"
                className="w-full h-full object-cover"
              />
            </div>

            {/* Mid card — orange collage woman, rotated left */}
            <div
              className="absolute w-[62%] aspect-[2/3] border-2 border-black overflow-hidden shadow-[6px_6px_0px_0px_#000000]"
              style={{ rotate: '-5deg', top: '4%', left: '4%' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/hero-1.jpg"
                alt=""
                aria-hidden="true"
                className="w-full h-full object-cover"
              />
            </div>

            {/* Front card — app screenshot, near-straight with hard shadow */}
            <div
              className="relative z-10 w-[68%] border-2 border-black bg-white overflow-hidden shadow-[8px_8px_0px_0px_#000000]"
              style={{ rotate: '1.5deg', marginTop: '20px' }}
            >
              {/* fake browser bar */}
              <div className="border-b border-black bg-[#F0F0E8] px-3 py-1.5 flex items-center gap-2">
                <div className="flex gap-1">
                  <div className="w-2.5 h-2.5 bg-black opacity-15" />
                  <div className="w-2.5 h-2.5 bg-black opacity-15" />
                  <div className="w-2.5 h-2.5 bg-black opacity-15" />
                </div>
                <div className="flex-1 border border-black bg-white px-2 py-0.5 font-mono text-[8px] text-black opacity-35 uppercase tracking-wide truncate">
                  resume.bevansatria.my.id
                </div>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/hero-3.png"
                alt="Resume Matcher dashboard preview"
                className="w-full h-auto block"
                loading="lazy"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── PAIN POINTS ── */}
      <section id="demo" className="w-full bg-black border-b-2 border-black">
        <div className="max-w-7xl mx-auto px-6 md:px-10 py-16 md:py-20">
          <div className="mb-10">
            <span className="font-mono text-xs uppercase tracking-widest text-[#1D4ED8] font-bold">// The Problem</span>
            <h2 className="mt-2 font-serif text-3xl md:text-4xl font-bold text-[#F0F0E8] uppercase leading-tight">
              The joy &amp; pain of manually editing resumes
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 border border-[#333]">
            {PAIN_POINTS.map((p, i) => (
              <div
                key={i}
                className={[
                  'p-8',
                  i < 2 ? 'md:border-r border-[#333]' : '',
                  i < PAIN_POINTS.length - 1 ? 'border-b md:border-b-0 border-[#333]' : '',
                ].filter(Boolean).join(' ')}
              >
                <span className="font-mono text-4xl font-bold text-[#1D4ED8] leading-none block">{p.num}</span>
                <h3 className="mt-4 font-serif text-lg font-bold text-[#F0F0E8] uppercase">{p.title}</h3>
                <p className="mt-2 font-sans text-sm text-[#F0F0E8] opacity-55 leading-relaxed">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SOLUTION BANNER ── */}
      <section className="w-full bg-[#1D4ED8] border-b-2 border-black">
        <div className="max-w-7xl mx-auto px-6 md:px-10 py-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <span className="font-mono text-xs uppercase tracking-widest text-white opacity-60 font-bold">// Solution</span>
            <h2 className="mt-2 font-serif text-2xl md:text-3xl font-bold text-white uppercase leading-tight max-w-xl">
              Stop guessing what recruiters want.<br />Tailor every application in seconds.
            </h2>
          </div>
          <Link
            href="/login"
            className="shrink-0 rounded-none border-2 border-white bg-white text-[#1D4ED8] px-8 py-3.5 font-mono text-sm font-bold uppercase tracking-wider shadow-[4px_4px_0px_0px_rgba(255,255,255,0.3)] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all"
          >
            Get Started Free →
          </Link>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" className="w-full bg-[#F0F0E8] border-b-2 border-black">
        <div className="max-w-7xl mx-auto px-6 md:px-10 py-16 md:py-20">
          <div className="mb-12">
            <span className="font-mono text-xs uppercase tracking-widest text-[#1D4ED8] font-bold">// Features</span>
            <h2 className="mt-2 font-serif text-3xl md:text-4xl font-bold uppercase text-black leading-tight">
              Because no product is complete<br />without a feature list.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 border-2 border-black">
            {FEATURES.map((f, i) => (
              <div
                key={i}
                className={[
                  'p-7 bg-[#F0F0E8] hover:bg-white transition-colors group',
                  i % 3 !== 2 ? 'lg:border-r-2 lg:border-black' : '',
                  i % 2 === 0 ? 'md:border-r-2 md:border-black lg:border-r-0' : '',
                  i < 3 ? 'lg:border-b-2 lg:border-black' : '',
                  i < 4 ? 'md:border-b-2 md:border-black' : '',
                  i < 5 ? 'border-b-2 border-black md:border-b-0' : '',
                ].filter(Boolean).join(' ')}
              >
                <span className="font-mono text-[10px] uppercase tracking-widest text-[#1D4ED8] font-bold">{f.tag}</span>
                <h3 className="mt-2 font-serif text-lg font-bold text-black group-hover:text-[#1D4ED8] transition-colors">{f.title}</h3>
                <p className="mt-2 font-sans text-sm text-black opacity-65 leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" className="w-full bg-[#F0F0E8] border-b-2 border-black" style={GRID_BG}>
        <div className="max-w-7xl mx-auto px-6 md:px-10 py-16 md:py-20">
          <div className="mb-12">
            <span className="font-mono text-xs uppercase tracking-widest text-[#1D4ED8] font-bold">// Process</span>
            <h2 className="mt-2 font-serif text-3xl md:text-4xl font-bold uppercase text-black leading-tight">
              Three steps. That's it.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 border-2 border-black bg-black gap-[2px]">
            {STEPS.map((s, i) => (
              <div key={i} className="p-8 bg-[#F0F0E8] flex flex-col gap-4">
                <span className="font-mono text-5xl font-bold text-[#1D4ED8] leading-none">{s.num}</span>
                <div>
                  <h3 className="font-serif text-xl font-bold text-black uppercase">{s.label}</h3>
                  <p className="mt-2 font-sans text-sm text-black opacity-65 leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="w-full bg-[#F0F0E8] border-b-2 border-black">
        <div className="max-w-7xl mx-auto px-6 md:px-10 py-16 md:py-20">
          <div className="mb-12">
            <span className="font-mono text-xs uppercase tracking-widest text-[#1D4ED8] font-bold">// FAQ</span>
            <h2 className="mt-2 font-serif text-3xl md:text-4xl font-bold uppercase text-black leading-tight">
              Common Questions
            </h2>
          </div>
          <div className="border-2 border-black max-w-3xl">
            {FAQS.map((item, i) => (
              <FaqItem key={i} q={item.q} a={item.a} />
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="w-full bg-[#F0F0E8] border-b-2 border-black" style={GRID_BG}>
        <div className="max-w-7xl mx-auto px-6 md:px-10 py-20 md:py-28 flex flex-col items-center text-center gap-6">
          <span className="font-mono text-xs uppercase tracking-widest text-[#1D4ED8] font-bold">// Convinced?</span>
          <h2 className="font-serif font-bold uppercase text-black leading-tight max-w-2xl" style={{ fontSize: 'clamp(2rem, 5vw, 4rem)' }}>
            Try Resume Matcher.<br />It's free.
          </h2>
          <p className="font-sans text-base text-black opacity-55 max-w-md">
            Create a free account, connect your LLM API key, and start tailoring CVs in minutes.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 items-center">
            <Link
              href="/login"
              className="rounded-none border-2 border-black bg-[#1D4ED8] px-10 py-4 font-mono text-sm font-bold uppercase tracking-wider text-white shadow-[4px_4px_0px_0px_#000000] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all"
            >
              Get Started →
            </Link>
            <a
              href="https://github.com/srbhr/Resume-Matcher"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-none border-2 border-black bg-white px-10 py-4 font-mono text-sm font-bold uppercase tracking-wider text-black shadow-[4px_4px_0px_0px_#000000] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all"
            >
              View on GitHub
            </a>
          </div>
          <p className="font-mono text-[10px] text-black opacity-30">
            * AI features are free — just bring your own LLM API key and configure it once in Settings.
          </p>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="w-full bg-black">
        <div className="max-w-7xl mx-auto px-6 md:px-10 py-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
          <div className="flex items-center gap-2 border border-[#333] px-3 py-1.5">
            <span className="font-mono text-xs font-bold text-[#1D4ED8]">✳</span>
            <span className="font-mono text-xs font-bold uppercase tracking-widest text-[#F0F0E8]">
              Resume Matcher
            </span>
          </div>
          <div className="flex flex-wrap gap-6">
            {[
              { label: 'Dashboard', href: '/dashboard' },
              { label: 'Settings', href: '/dashboard' },
            ].map((l) => (
              <Link key={l.label} href={l.href} className="font-mono text-xs uppercase tracking-wider text-[#F0F0E8] opacity-40 hover:opacity-100 transition-opacity">
                {l.label}
              </Link>
            ))}
          </div>
          <div className="flex flex-col items-start md:items-end gap-1.5">
            <span className="font-mono text-xs text-[#F0F0E8] uppercase tracking-wider opacity-50">
              © {new Date().getFullYear()} Vanszs. All rights reserved.
            </span>
            <span className="font-mono text-[10px] text-[#F0F0E8] opacity-20 normal-case tracking-normal">
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
