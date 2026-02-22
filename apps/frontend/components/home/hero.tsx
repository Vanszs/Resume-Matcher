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
    body: 'You missed half the requirements. We didn\'t. We find the fine print you ignored while doomscrolling so you stop wasting everyone\'s time.',
    color: 'bg-[#1D4ED8]',
  },
  {
    tag: '02',
    title: 'Keyword Wizardry',
    body: 'Stop guessing keywords. We pull the exact technical terms the algorithm wants. Feed the bot what it needs or stay at the bottom of the pile.',
    color: 'bg-[#F97316]',
  },
  {
    tag: '03',
    title: 'Score Everything',
    body: 'Your friends lie to be nice. Our scoring engine doesn\'t. If your match rate is low, your resume is bad. Fix it before you hit send.',
    color: 'bg-[#A855F7]',
  },
  {
    tag: '04',
    title: 'Open Source, Baby',
    body: 'Free as in freedom. Free as in beer. Free as in \'why would you pay for this?\' Fork it. Break it. Fix it. We\'re running on good vibes.',
    color: 'bg-[#EC4899]',
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
        <div className="max-w-7xl mx-auto px-8 py-4 flex items-center justify-between">
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
        <div className="max-w-7xl mx-auto px-8 py-20 grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">

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
              <span className="bg-black text-[#F0F0E8] px-3 py-1 italic">Hard.</span>
              <br />
              We make it<br />
              <span className="bg-[#1D4ED8] text-white px-3 py-1 italic">easier.</span>
            </h1>

            <p className="font-sans text-base md:text-lg text-black opacity-75 leading-relaxed max-w-lg">
              Stop starting from scratch. We optimize your master resume to instantly generate
              tailored resumes and outreach for every job you want.
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
                See Demo ↓
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

      {/* ── GIF TEMPELAN ── */}
      <section id="demo" className="w-full bg-[#F0F0E8] border-b-2 border-black">
        <div className="max-w-7xl mx-auto px-8 pt-0 pb-12 flex justify-center">
          <div
            className="-mt-10 relative z-10 border-2 border-black overflow-hidden shadow-[8px_8px_0px_0px_#000000] w-full max-w-4xl"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://raw.githubusercontent.com/srbhr/Resume-Matcher/main/assets/Resume_Matcher_Demo_2.gif"
              alt="Resume Matcher AI demo"
              className="w-full h-auto block"
              loading="lazy"
            />
          </div>
        </div>
      </section>

      {/* ── PAIN POINTS ── */}
      <section className="w-full bg-[#F0F0E8] border-b-2 border-black">
        <div className="max-w-7xl mx-auto px-8 py-20">
          <div className="mb-16 text-center">
            <h2 className="font-serif font-bold text-black leading-tight" style={{ fontSize: 'clamp(2rem, 5vw, 4rem)' }}>
              The{' '}
              <span className="relative inline-block">
                <span className="relative z-10">joy</span>
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="w-full h-0.5 bg-[#DC2626] rotate-[-5deg]" />
                </span>
              </span>{' '}
              <span className="bg-[#F97316] text-white px-3 py-1">pain</span>{' '}
              of manually<br />
              editing resumes
            </h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {PAIN_POINTS.map((p, i) => (
              <div
                key={i}
                className="border-2 border-black bg-white p-8 shadow-[4px_4px_0px_0px_#000000]"
              >
                <div className="inline-block border-2 border-black bg-[#F97316] text-white px-4 py-2 font-mono text-lg font-bold shadow-[2px_2px_0px_0px_#000000] mb-6">
                  {p.num}
                </div>
                <h3 className="font-serif text-xl font-bold text-black mb-3">{p.title}</h3>
                <p className="font-sans text-sm text-black opacity-65 leading-relaxed">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SOLUTION BANNER ── */}
      <section className="w-full bg-[#F0F0E8] border-b-2 border-black">
        <div className="max-w-7xl mx-auto px-8 py-20 text-center">
          <h2 className="font-serif font-bold text-black leading-tight mb-8" style={{ fontSize: 'clamp(2.5rem, 5vw, 4.5rem)' }}>
            <span className="line-through decoration-4 decoration-black opacity-40">Manually Editing</span>
            <br />
            <span className="bg-[#F97316] text-white px-4 py-2 inline-block mt-4">Automation!!</span>
          </h2>
          <p className="font-mono text-lg text-black uppercase tracking-wide mb-4">
            Introducing{' '}
            <span className="bg-[#1D4ED8] text-white px-3 py-1 font-bold">Resume Matcher</span>
          </p>
          <p className="font-sans text-base text-black opacity-60 max-w-xl mx-auto mb-8">
            Resume Matcher is an open-source tool that<br />
            analyzes job descriptions to beat the ATS.
          </p>
          <p className="font-sans text-base text-black max-w-2xl mx-auto mb-10 leading-relaxed">
            Stop guessing what recruiters want. Tailor every application in<br />
            seconds and get the interview.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
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
              ★ Star on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" className="w-full bg-[#F0F0E8] border-b-2 border-black">
        <div className="max-w-7xl mx-auto px-8 py-20">
          <div className="mb-16 text-center">
            <h2 className="font-serif font-bold text-black leading-tight mb-4" style={{ fontSize: 'clamp(2.5rem, 5vw, 4.5rem)' }}>
              <span className="bg-[#1D4ED8] text-white px-4 py-2 inline-block">Features</span>{' '}
              <span className="opacity-40">... of course ...</span>
            </h2>
            <p className="font-sans text-base text-black opacity-60 max-w-2xl mx-auto">
              Because no product is complete without a buzzword-filled<br />
              feature list.
            </p>
            <p className="font-mono text-sm text-black opacity-40 italic mt-2">
              Here's ours. You're welcome.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
            {FEATURES.map((f, i) => (
              <div
                key={i}
                className={`${f.color} border-2 border-black p-10 shadow-[6px_6px_0px_0px_#000000] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[3px_3px_0px_0px_#000000] transition-all`}
              >
                <div className="inline-block border-2 border-black bg-white px-3 py-1.5 font-mono text-xs font-bold text-black uppercase tracking-wider mb-4">
                  {f.tag}
                </div>
                <h3 className="font-serif text-2xl font-bold text-white mb-4">{f.title}</h3>
                <p className="font-sans text-sm text-white leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" className="w-full bg-[#F0F0E8] border-b-2 border-black" style={GRID_BG}>
        <div className="max-w-7xl mx-auto px-8 py-20">
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
        <div className="max-w-7xl mx-auto px-8 py-20">
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
      <section className="w-full bg-black border-b-2 border-black">
        <div className="max-w-7xl mx-auto px-8 py-20 flex flex-col items-center text-center gap-8">
          <h2 className="font-serif font-bold text-white leading-tight" style={{ fontSize: 'clamp(2.5rem, 5vw, 4.5rem)' }}>
            <span className="bg-[#F97316] text-white px-4 py-2 inline-block">Convinced?</span>
          </h2>
          <p className="font-serif font-bold text-white text-2xl md:text-3xl max-w-2xl">
            Try Resume Matcher{' '}
            <span className="bg-[#1D4ED8] text-white px-3 py-1 inline-block">it's free</span>
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 items-center mt-6">
            <Link
              href="/login"
              className="rounded-none border-2 border-white bg-white text-black px-10 py-4 font-mono text-sm font-bold uppercase tracking-wider shadow-[4px_4px_0px_0px_rgba(255,255,255,0.3)] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all"
            >
              LET'S GO →
            </Link>
          </div>

          <div className="border-t border-white/20 pt-8 mt-4 w-full max-w-2xl">
            <p className="font-sans text-sm text-white/50 mb-4">
              Not convinced?{' '}
              <span className="italic text-white/70">That's cute.</span>
            </p>
            <p className="font-serif text-lg text-white mb-6">
              Try it anyway → <span className="line-through decoration-[#DC2626] decoration-2">hate it</span>{' '}
              <span className="bg-[#EC4899] text-white px-2 py-1 inline-block">love it</span> → get convinced
            </p>
            <p className="font-mono text-xs text-white/40 mb-8">
              (still free btw... we're not running a charity, we're running on{' '}
              <span className="text-[#EC4899]">✨vibes✨</span>)
            </p>
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-center">
              <a
                href="https://github.com/srbhr/Resume-Matcher"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-none border-2 border-white bg-black px-8 py-3 font-mono text-xs font-bold uppercase tracking-wider text-white hover:bg-white hover:text-black transition-all"
              >
                FINE, SHOW ME GITHUB
              </a>
              <a
                href="/docs"
                className="rounded-none border-2 border-white bg-black px-8 py-3 font-mono text-xs font-bold uppercase tracking-wider text-white hover:bg-white hover:text-black transition-all"
              >
                READ DOCS (NERD)
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="w-full bg-[#F0F0E8] border-t-2 border-black">
        <div className="max-w-7xl mx-auto px-8 py-16">
          {/* Logo & Tagline */}
          <div className="flex flex-col items-start mb-12">
            <div className="flex items-center gap-2 border-2 border-black px-4 py-2 bg-white shadow-[2px_2px_0px_0px_#000000] mb-4">
              <span className="font-mono text-sm font-bold text-[#1D4ED8]">✳</span>
              <span className="font-mono text-sm font-bold uppercase tracking-widest text-black">
                Resume Matcher
              </span>
            </div>
            <p className="font-sans text-sm text-black opacity-60 max-w-md">
              Open source. Free forever. Built for job seekers who are<br />
              tired of the BS.
            </p>
          </div>

          {/* Social Links */}
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <span className="w-8 h-0.5 bg-[#1D4ED8]" />
              <span className="font-mono text-xs uppercase tracking-widest text-black opacity-40">
                FIND US EVERYWHERE
              </span>
              <span className="w-8 h-0.5 bg-[#EC4899]" />
            </div>
            <div className="flex flex-wrap gap-3">
              <a
                href="https://github.com/srbhr/Resume-Matcher"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-none border-2 border-black bg-[#1D4ED8] text-white px-6 py-3 font-mono text-xs font-bold uppercase tracking-wider shadow-[2px_2px_0px_0px_#000000] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all flex items-center gap-2"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                GitHub
              </a>
              <a
                href="https://discord.gg/resumematcher"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-none border-2 border-black bg-[#A855F7] text-white px-6 py-3 font-mono text-xs font-bold uppercase tracking-wider shadow-[2px_2px_0px_0px_#000000] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all flex items-center gap-2"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028 14.09 14.09 0 001.226-1.994.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                </svg>
                Discord
              </a>
              <a
                href="https://twitter.com/resumematcher"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-none border-2 border-black bg-black text-white px-6 py-3 font-mono text-xs font-bold uppercase tracking-wider shadow-[2px_2px_0px_0px_#000000] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all flex items-center gap-2"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
                X
              </a>
              <a
                href="https://www.linkedin.com/company/resumematcher"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-none border-2 border-black bg-[#0EA5E9] text-white px-6 py-3 font-mono text-xs font-bold uppercase tracking-wider shadow-[2px_2px_0px_0px_#000000] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all flex items-center gap-2"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
                LinkedIn
              </a>
              <a
                href="https://dev.to/resumematcher"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-none border-2 border-black bg-white text-black px-6 py-3 font-mono text-xs font-bold uppercase tracking-wider shadow-[2px_2px_0px_0px_#000000] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all flex items-center gap-2"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M7.42 10.05c-.18-.16-.46-.23-.84-.23H6l.02 2.44.04 2.45.56-.02c.41 0 .63-.07.83-.26.24-.24.26-.36.26-2.2 0-1.91-.02-1.96-.29-2.18zM0 4.94v14.12h24V4.94H0zM8.56 15.3c-.44.58-1.06.77-2.53.77H4.71V8.53h1.4c1.67 0 2.16.18 2.6.9.27.43.29.6.32 2.57.05 2.23-.02 2.73-.47 3.3zm5.09-5.47h-2.47v1.77h1.52v1.28l-.72.04-.75.03v1.77l1.22.03 1.2.04v1.28h-1.6c-1.53 0-1.6-.01-1.87-.3l-.3-.28v-3.16c0-3.02.01-3.18.25-3.48.23-.31.25-.31 1.88-.31h1.64v1.3zm4.68 5.45c-.17.43-.64.79-1 .79-.18 0-.45-.15-.67-.39-.32-.32-.45-.63-.82-2.08l-.9-3.39-.45-1.67h.76c.4 0 .75.02.75.05 0 .06 1.16 4.54 1.26 4.83.04.15.32-.7.73-2.3l.66-2.52.74-.04c.4-.02.73 0 .73.04 0 .14-1.67 6.38-1.8 6.68z"/>
                </svg>
                DEV
              </a>
            </div>
          </div>

          {/* Footer Nav */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 pt-8 border-t-2 border-black">
            <div className="flex flex-wrap gap-6">
              <a href="https://docs.resumematcher.fyi" className="font-mono text-xs uppercase tracking-wider text-[#EC4899] border-2 border-[#EC4899] px-4 py-2 hover:bg-[#EC4899] hover:text-white transition-colors">
                Docs
              </a>
              <a href="https://blog.resumematcher.fyi" className="font-mono text-xs uppercase tracking-wider text-[#15803D] border-2 border-[#15803D] px-4 py-2 hover:bg-[#15803D] hover:text-white transition-colors">
                Blog
              </a>
              <a href="https://github.com/sponsors/srbhr" target="_blank" rel="noopener noreferrer" className="font-mono text-xs uppercase tracking-wider text-[#F97316] border-2 border-[#F97316] px-4 py-2 hover:bg-[#F97316] hover:text-white transition-colors">
                Sponsors
              </a>
              <Link href="/dashboard" className="font-mono text-xs uppercase tracking-wider text-[#1D4ED8] border-2 border-[#1D4ED8] px-4 py-2 hover:bg-[#1D4ED8] hover:text-white transition-colors">
                OSS Friends
              </Link>
            </div>
            <div className="flex flex-col items-start md:items-end gap-2">
              <span className="font-mono text-xs text-black uppercase tracking-wider opacity-60">
                © {new Date().getFullYear()} Resume Matcher. No rights reserved.
              </span>
              <span className="font-mono text-[10px] text-black opacity-30">
                <span className="italic">(it's open source, duh)</span>
              </span>
              <span className="font-mono text-[10px] text-black opacity-30">
                Built with{' '}
                <span className="text-[#EC4899]">❤</span>{' '}
                and probably too much coffee.
              </span>
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
}
