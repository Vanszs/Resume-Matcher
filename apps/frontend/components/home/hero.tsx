'use client';

import React, { useState } from 'react';
import Link from 'next/link';

const PAIN_POINTS = [
  {
    num: '01',
    title: 'The Manual Edit Loop',
    body: 'Waste hours shuffling bullet points only to see the job posting expire before you hit send.',
  },
  {
    num: '02',
    title: 'The Silent Rejection',
    body: 'One tiny formatting glitch or typo guarantees the trash pile. You will never even know why you failed.',
  },
  {
    num: '03',
    title: 'The ATS Black Hole',
    body: 'Blindly guessing keywords against an algorithm that is literally programmed to reject you.',
  },
];

const FEATURES = [
  {
    icon: '▲',
    title: 'AI-Powered Analysis',
    body: 'Compare your resume against job descriptions instantly. Get actionable feedback on what\'s missing.',
    decorations: [
      { type: 'circle', className: 'absolute -top-6 -right-6 w-16 h-12 bg-white border-2 border-black rounded-full flex items-center justify-center transform rotate-12 z-20 shadow-sm hidden md:flex overflow-hidden' },
      { type: 'dot', className: 'absolute -top-8 left-4 w-12 h-12 bg-pink-400 rounded-full border-2 border-black z-30 transform -rotate-12 hidden md:block' },
    ],
  },
  {
    icon: '■',
    title: 'Keyword Wizardry',
    body: 'Extract high-value keywords from JD. We highlight hard skills, soft skills, and tech stacks you need.',
    decorations: [
      { type: 'square', className: 'absolute -bottom-4 -right-4 w-12 h-12 bg-yellow-400 border-2 border-black transform rotate-45 z-20 hidden md:block' },
      { type: 'emoji', className: 'absolute -top-6 -right-2 text-4xl transform rotate-12 z-30 hidden md:block', content: '●' },
    ],
  },
  {
    icon: '●',
    title: 'Match Score',
    body: 'Get a numeric match score. Know exactly how well you fit the role before hitting \'Apply\'.',
    decorations: [],
  },
  {
    icon: '✦',
    title: 'Multi-Language CVs',
    body: 'Applying globally? Generate resumes in multiple languages without losing formatting.',
    decorations: [],
  },
  {
    icon: '▢',
    title: 'Print-Ready PDF Export',
    body: 'Clean, professional, ATS-friendly templates compiled to PDF in one click.',
    decorations: [],
  },
  {
    icon: '◆',
    title: 'Privacy First',
    body: 'Your data, your control. Local storage with optional cloud sync. Open source at heart.',
    decorations: [],
  },
];

const STEPS = [
  {
    num: '01',
    label: 'Sign In',
    desc: 'Create your secure account to manage resumes.',
    color: 'text-blue-600',
    indent: 0,
  },
  {
    num: '02',
    label: 'Upload & Paste',
    desc: 'Upload your master resume and paste the Job Description.',
    color: 'text-orange-600',
    indent: 1,
  },
  {
    num: '03',
    label: 'Review & Export',
    desc: 'Let AI optimize it, review the changes, and export PDF.',
    color: 'text-purple-600',
    indent: 2,
  },
];

const FAQS = [
  {
    q: 'Is Resume Matcher free to use?',
    a: 'Yes! Resume Matcher is open source and free forever. For AI features, you can use Ollama locally (100% free) or connect your own API key. You pay your chosen AI provider directly for what you use.',
  },
  {
    q: 'Will my resume data be kept private?',
    a: 'This tool is a hosted version of the open-source project available at https://github.com/srbhr/Resume-Matcher. We provide the infrastructure and domain to make the tool easily accessible. If you prefer full control over your data, you are welcome to run the project locally using the open-source repository. For security best practices, we recommend redacting sensitive personal information (such as ID numbers, full addresses, or phone numbers) before uploading any document. Authentication data (such as email or username) is used strictly for account access and is not embedded into your resume content. While we implement reasonable safeguards, users who require complete data control are encouraged to self-host the open-source version.',
  },
  {
    q: 'What languages does the app support?',
    a: 'The interface is available in English, Spanish, Indonesian, Japanese, Portuguese, and Chinese. AI-powered content generation works in any language supported by your chosen provider.',
  },
  {
    q: 'How do I get started?',
    a: 'Simply sign up, upload your resume (PDF or DOCX), paste a job description, and let our AI analyze and optimize your content. You can then review, edit, and export as PDF.',
  },
  {
    q: 'Which AI providers can I use?',
    a: 'We support Ollama (local, free), OpenAI (GPT-4), Anthropic (Claude), Google Gemini, OpenRouter, and DeepSeek. Switch between providers anytime in settings.',
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="group bg-white border-2 border-black shadow-[4px_4px_0px_0px_#000000] cursor-pointer" open={open}>
      <summary 
        className="flex justify-between items-center p-4 font-bold font-sans text-lg list-none cursor-pointer"
        onClick={(e) => { e.preventDefault(); setOpen(!open); }}
      >
        {q}
        <span className={`transition-transform ${open ? 'rotate-180' : ''} text-2xl`}>▼</span>
      </summary>
      {open && (
        <div className="p-4 pt-0 font-mono text-sm text-gray-700 border-t-2 border-black/10">
          {a}
        </div>
      )}
    </details>
  );
}

export default function Hero() {
  return (
    <div className="min-h-screen w-full bg-[#F0F0E8] flex flex-col overflow-x-hidden">

      {/* ── NAV ── */}
      <nav className="sticky top-0 z-50 bg-[#F0F0E8] border-b-[3px] border-black px-6 md:px-12 lg:px-16 py-4 w-full">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="font-serif font-bold text-xl md:text-2xl tracking-tight flex items-center gap-2 text-black">
              <span className="text-orange-600 text-2xl">✳</span> Resume Matcher
            </div>
          </div>
          <div className="hidden md:flex items-center gap-8 font-mono font-medium text-sm">
            <a className="hover:bg-black hover:text-white px-2 py-1 transition-colors" href="#features">Features</a>
            <a className="hover:bg-black hover:text-white px-2 py-1 transition-colors" href="#how-it-works">How It Works</a>
            <a className="hover:bg-black hover:text-white px-2 py-1 transition-colors" href="#faq">FAQ</a>
          </div>
          <Link
            href="/login"
            className="bg-white text-black font-mono text-sm font-bold px-6 py-2 border-[2px] border-black shadow-[2px_2px_0px_0px_#000000] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-none transition-all flex items-center gap-2"
          >
            Sign In →
          </Link>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="w-full px-6 md:px-12 lg:px-16 py-12 md:py-20 lg:py-24 relative overflow-hidden border-b-[3px] border-black min-h-[calc(100vh-80px)] flex items-center">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center gap-8 md:gap-12 relative z-10 w-full">
          <div className="md:w-1/2 text-left pr-0 md:pr-8">
            <h1 className="font-serif font-extrabold text-5xl sm:text-6xl md:text-7xl lg:text-8xl leading-[1.0] text-black mb-6 md:mb-8 tracking-tight">
              Finding a job is <br/>
              <span className="bg-black text-white px-2 inline-block font-serif italic border-2 border-transparent relative mt-2 mb-2">
                Hard.
              </span> <br/>
              We make it <br/>
              <span className="bg-blue-600 text-white px-2 inline-block shadow-[4px_4px_0px_0px_#000000] font-serif italic border-2 border-black relative mt-2">
                easier.
              </span>
            </h1>
            <p className="font-mono text-base md:text-lg text-gray-800 mb-8 md:mb-10 leading-relaxed max-w-md">
              Stop starting from scratch. We optimize your master resume to instantly generate tailored CVs for every job you want — and beat the ATS while doing it.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 md:gap-6">
              <Link
                href="/login"
                className="bg-blue-600 text-white font-mono font-bold text-base md:text-lg px-6 md:px-8 py-3 md:py-4 border-[3px] border-black shadow-[4px_4px_0px_0px_#000000] hover:shadow-[2px_2px_0px_0px_#000000] hover:translate-x-[2px] hover:translate-y-[2px] transition-all text-center flex items-center justify-center gap-2 group w-full sm:w-auto uppercase tracking-wider"
              >
                Get Started →
              </Link>
              <a
                href="https://github.com/srbhr/Resume-Matcher"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-[#F0F0E8] text-black font-mono font-bold text-base md:text-lg px-6 md:px-8 py-3 md:py-4 border-[3px] border-black shadow-[4px_4px_0px_0px_#000000] hover:shadow-[2px_2px_0px_0px_#000000] hover:translate-x-[2px] hover:translate-y-[2px] transition-all text-center w-full sm:w-auto uppercase tracking-wider"
              >
                Try on GitHub
              </a>
            </div>
          </div>
          <div className="md:w-1/2 relative h-[400px] md:h-[500px] lg:h-[600px] w-full flex items-center justify-center">
            <div className="absolute top-10 right-10 w-48 h-48 md:w-64 md:h-64 bg-yellow-400 rounded-full mix-blend-multiply opacity-90 z-0"></div>
            <div className="relative w-full h-full border-2 border-black bg-white flex items-center justify-center transform rotate-2 shadow-[4px_4px_0px_0px_#000000] z-10 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/assets/portrait-person-with-visual-metaphor-memory-removebg-preview (1) (1).png"
                alt="Portrait with visual metaphor"
                className="w-full h-full object-contain"
                loading="eager"
              />
              <div className="absolute top-1/4 left-10 text-orange-600 text-6xl font-serif transform -rotate-12">↑</div>
              <div className="absolute bottom-1/4 right-10 text-orange-600 text-6xl font-serif transform rotate-12">↑</div>
            </div>
          </div>
        </div>
        <div className="absolute top-1/2 -left-4 w-12 h-12 bg-black hidden lg:block rotate-45"></div>
        <div className="absolute top-1/3 -right-4 text-6xl transform rotate-12 hidden lg:block opacity-20 select-none">↯</div>
      </section>

      {/* ── DEMO SECTION ── */}
      <section className="w-full py-20 px-6 md:px-12 lg:px-16 bg-white border-b-[3px] border-black relative overflow-hidden">
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <div className="inline-block bg-black text-white px-4 py-1 font-mono font-bold mb-8 transform -rotate-1 border border-white shadow-[2px_2px_0px_0px_#000000]">
            // SEE IT IN ACTION
          </div>
          <div className="relative perspective-tilt group mx-auto" id="demo">
            <div className="bg-black p-2 md:p-3 border-[4px] border-black shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] bg-gray-900 relative overflow-hidden transform md:rotate-1 transition-transform duration-500 hover:rotate-0">
              <div className="aspect-video bg-gray-800 flex items-center justify-center relative border border-gray-700 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/assets/Resume_Matcher_Demo.gif"
                  alt="Resume Matcher Demo Tutorial"
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                <div className="absolute top-4 left-4 flex gap-2 z-10">
                  <div className="w-3 h-3 rounded-full bg-red-500 border border-black/30"></div>
                  <div className="w-3 h-3 rounded-full bg-yellow-500 border border-black/30"></div>
                  <div className="w-3 h-3 rounded-full bg-green-500 border border-black/30"></div>
                </div>
              </div>
              <div className="absolute bottom-3 right-4 font-mono text-xs text-red-500 font-bold flex items-center gap-1 animate-pulse">
                <span className="w-2 h-2 bg-red-500 rounded-full"></span> LIVE DEMO
              </div>
            </div>
            <div className="absolute -bottom-4 -right-4 md:-bottom-6 md:-right-6 lg:-bottom-8 lg:-right-8 w-20 h-20 md:w-24 md:h-24 lg:w-28 lg:h-28 bg-orange-600 border-[3px] border-black rounded-full flex items-center justify-center transform rotate-12 z-30 shadow-[4px_4px_0px_0px_#000000] hover:scale-110 transition-transform cursor-pointer">
              <span className="font-serif font-bold text-white text-sm md:text-base lg:text-xl leading-none text-center italic">Watch<br/>Now!</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── PAIN POINTS ── */}
      <section className="w-full py-24 px-6 md:px-12 lg:px-16 bg-[#F0F0E8] border-b-[3px] border-black">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="font-serif text-5xl md:text-7xl text-black leading-tight">
              The <span className="line-through text-gray-400">joy</span>{' '}
              <span className="bg-blue-600 text-white px-2 inline-block border-2 border-black transform -rotate-2 relative z-10">pain</span>{' '}
              of manually <br/> editing resumes
            </h2>
          </div>
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-24 items-center">
            {/* Collage - Pain of editing */}
            <div className="relative min-h-[400px] h-full flex items-center justify-center bg-[#F0F0E8] overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://resumematcher.fyi/_astro/manually_editing_resumes.BYuNwN7N_Zsu3rt.webp"
                alt="Pain of manually editing resumes collage"
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>

            {/* List of pain points */}
            <div className="space-y-12">
              {PAIN_POINTS.map((p, i) => (
                <div key={i} className="flex gap-6 group">
                  <div className="shrink-0">
                    <div className="w-14 h-14 bg-orange-600 border-[3px] border-black shadow-[4px_4px_0px_0px_#000000] flex items-center justify-center font-mono font-bold text-xl text-white group-hover:translate-x-1 group-hover:translate-y-1 group-hover:shadow-none transition-all">
                      {p.num}
                    </div>
                  </div>
                  <div>
                    <h3 className="font-serif font-bold text-3xl mb-3 text-black">{p.title}</h3>
                    <p className="font-mono text-base text-gray-600 leading-relaxed">
                      {p.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── SOLUTION BANNER ── */}
      <section className="w-full py-24 px-6 md:px-12 lg:px-16 bg-yellow-400 border-b-[3px] border-black relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjIiIGZpbGw9IiMwMDAiLz48L3N2Zz4=')]"></div>
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <div className="inline-block bg-white border-[3px] border-black px-4 py-1 font-mono font-bold mb-6 shadow-[2px_2px_0px_0px_#000000] transform -rotate-2">// SOLUTION</div>
          <h2 className="font-serif font-bold text-5xl md:text-7xl mb-8 leading-tight">
            Stop guessing what recruiters want. <br/>
            <span className="italic text-white" style={{ textShadow: '2px 2px 0px #000' }}>Tailor every application in seconds.</span>
          </h2>
          <Link
            href="/login"
            className="inline-block bg-black text-white font-mono font-bold text-xl px-10 py-5 border-[3px] border-white shadow-[4px_4px_0px_0px_#ffffff] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all"
          >
            Get Started Free →
          </Link>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="w-full py-20 px-6 md:px-12 lg:px-16 bg-[#F0F0E8] border-b-[3px] border-black relative overflow-hidden" id="features">
        <div className="max-w-7xl mx-auto relative z-10">
          <span className="font-mono font-bold text-purple-600 mb-8 block text-xl">// FEATURES</span>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((feature, idx) => (
              <div
                key={idx}
                className="bg-white border-[3px] border-black p-6 shadow-[4px_4px_0px_0px_#000000] hover:-translate-y-1 transition-transform flex flex-col h-full relative overflow-visible"
              >
                {/* Decorative elements */}
                {feature.decorations.map((dec, i) => {
                  if (dec.type === 'circle') {
                    return (
                      <div key={i} className={dec.className}>
                        <div className="w-8 h-8 rounded-full bg-blue-500 border border-black relative">
                          <div className="absolute top-2 right-2 w-2 h-2 bg-white rounded-full"></div>
                        </div>
                      </div>
                    );
                  }
                  if (dec.type === 'dot') {
                    return <div key={i} className={dec.className}></div>;
                  }
                  if (dec.type === 'square') {
                    return <div key={i} className={dec.className}></div>;
                  }
                  if (dec.type === 'emoji') {
                    return <div key={i} className={dec.className}>{dec.content}</div>;
                  }
                  return null;
                })}

                <div className="w-12 h-12 bg-blue-600 border-2 border-black mb-4 flex items-center justify-center text-white text-2xl">
                  {feature.icon}
                </div>
                <h3 className="font-serif font-bold text-2xl mb-3">{feature.title}</h3>
                <p className="font-mono text-sm text-gray-600">{feature.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="w-full py-24 px-6 md:px-12 lg:px-16 bg-white border-b-[3px] border-black overflow-hidden" id="how-it-works">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row gap-12 items-center">
            <div className="md:w-1/3">
              <span className="font-mono font-bold text-green-600 mb-2 block">// PROCESS</span>
              <h2 className="font-serif font-bold text-5xl mb-6">Three steps. That's it.</h2>
              <div className="w-24 h-2 bg-black mb-6"></div>
              <p className="font-mono text-gray-600">Streamlined for speed. Get from job discovery to application in under 5 minutes.</p>
            </div>
            <div className="md:w-2/3 space-y-6 relative">
              {STEPS.map((step, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-6 p-4 border-2 border-black bg-[#F0F0E8] shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)] relative"
                  style={{ marginLeft: step.indent === 0 ? '0' : step.indent === 1 ? 'clamp(0rem, 5vw, 2rem)' : 'clamp(0rem, 8vw, 4rem)' }}
                >
                  <div className={`font-serif text-4xl font-bold ${step.color} opacity-50`}>{step.num}</div>
                  <div className="flex-1">
                    <h3 className="font-bold font-sans text-xl uppercase">{step.label}</h3>
                    <p className="font-mono text-sm text-gray-600">{step.desc}</p>
                  </div>
                  {idx === STEPS.length - 1 && (
                    <div className="absolute -top-2 -right-2 md:-top-4 md:-right-4 transform w-14 h-14 md:w-20 md:h-20 bg-gray-100 border-2 border-black rotate-12 shadow-[4px_4px_0px_0px_#000000] hidden md:flex flex-col items-center justify-center p-1 z-10">
                      <span className="text-2xl md:text-3xl">👍</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="w-full py-20 px-6 md:px-12 lg:px-16 bg-[#F0F0E8] border-b-[3px] border-black" id="faq">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <span className="font-mono font-bold text-black bg-pink-500 px-2 py-1 transform -rotate-2 inline-block shadow-[2px_2px_0px_0px_#000000] border border-black">// FAQ</span>
            <h2 className="font-serif font-bold text-4xl mt-6">Questions? We got answers.</h2>
          </div>
          <div className="space-y-4">
            {FAQS.map((item, i) => (
              <FaqItem key={i} q={item.q} a={item.a} />
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="w-full py-24 px-6 md:px-12 lg:px-16 bg-black text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjIiIGZpbGw9IiNmZmYiLz48L3N2Zz4=')] opacity-10"></div>
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <div className="inline-block border-2 border-white px-4 py-1 rounded-full mb-8 font-mono text-sm animate-pulse">
            ● OPEN SOURCE
          </div>
          <h2 className="font-serif font-bold text-6xl md:text-8xl mb-8">
            Try Resume Matcher.<br/>
            <span className="text-blue-600 italic">It's free.</span>
          </h2>
          <div className="flex flex-col sm:flex-row justify-center gap-6 mt-12">
            <Link
              href="/login"
              className="bg-white text-black font-mono font-bold text-lg px-8 py-4 border-[3px] border-transparent hover:border-blue-600 shadow-[4px_4px_0px_0px_#2563eb] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
            >
              Get Started →
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="w-full bg-white border-t-[3px] border-black py-8 px-6 md:px-12 lg:px-16">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 text-sm font-mono text-gray-500">
          <div>
            © {new Date().getFullYear()}{' '}
            <a 
              href="https://bevansatria.my.id" 
              target="_blank" 
              rel="noopener noreferrer"
              className="hover:text-black transition-colors"
            >
              Vanszs
            </a>
            . All rights reserved.
          </div>
          <div>
            based on{' '}
            <a 
              href="https://github.com/srbhr/Resume-Matcher" 
              target="_blank" 
              rel="noopener noreferrer"
              className="hover:text-black transition-colors"
            >
              srbhr/Resume-Matcher
            </a>
          </div>
        </div>
      </footer>

    </div>
  );
}