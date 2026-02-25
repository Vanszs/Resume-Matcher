import type { Metadata } from 'next';
import InternshipListClient from '@/components/internships/InternshipListClient';

export const metadata: Metadata = {
    title: 'Internship List 2026 | Resume Matcher',
    description: 'Browse Summer 2026 tech internships curated by Pitt CSC & Simplify. Updated daily.',
};

// Revalidate once per day (86400 seconds)
export const revalidate = 86400;

export type Internship = {
    company: string;
    companyUrl: string;
    role: string;
    location: string;
    applyUrl: string;
    simplifyUrl: string;
    age: string;
    isClosed: boolean;
    isSubRole: boolean;
    section: string;
    source: 'active' | 'off-season' | 'inactive';
    noSponsorship: boolean;
    requiresCitizenship: boolean;
    isFaang: boolean;
    requiresAdvancedDegree: boolean;
};

const ENTITIES: Record<string, string> = {
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ',
};
function decodeHtml(s: string): string {
    return s.replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m);
}
function stripTags(s: string): string {
    return decodeHtml(s.replace(/<[^>]+>/g, '').trim());
}

const SKIP_HEADING = /Browse\s+\d+|See Full List|😫|😮|^The List/i;

/** Parse a GitHub HTML-table internship README into structured records.
 *  Format: <table><thead><th>…</th></thead><tbody><tr><td>…</td></tr></tbody></table>
 *  Active (5 cols):     Company | Role | Location | Application | Age
 *  Off-Season (6 cols): Company | Role | Location | Terms | Application | Age */
function parseGitHubMarkdown(text: string, source: Internship['source']): Internship[] {
    const internships: Internship[] = [];
    let currentSection = 'General';
    let currentCompany = '';
    let currentCompanyUrl = '';

    const parts = text.split(/(<table[\s\S]*?<\/table>)/i);

    for (const part of parts) {
        if (/<table/i.test(part)) {
            // Detect column layout from <thead>
            let hasTermsCol = false;
            const theadM = part.match(/<thead>([\s\S]*?)<\/thead>/i);
            if (theadM) {
                const headers = [...theadM[1].matchAll(/<th[^>]*>(.*?)<\/th>/gi)]
                    .map(m => stripTags(m[1]));
                hasTermsCol = headers.some(h => h.toLowerCase() === 'terms');
            }

            const tbodyM = part.match(/<tbody>([\s\S]*?)<\/tbody>/i);
            if (!tbodyM) continue;

            for (const rowM of tbodyM[1].matchAll(/<tr>([\s\S]*?)<\/tr>/gi)) {
                const cells = [...rowM[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1]);
                if (cells.length < 4) continue;

                const c0 = cells[0], c1 = cells[1], c2 = cells[2];
                const c3 = hasTermsCol ? (cells[4] ?? '') : (cells[3] ?? '');
                const c4 = hasTermsCol ? (cells[5] ?? '') : (cells[4] ?? '');

                const rawCompany = stripTags(c0);
                const isSub = c0.includes('↳') || rawCompany === '↳';

                let company = isSub ? currentCompany : rawCompany.replace('↳', '').trim();
                let companyUrl = currentCompanyUrl;
                if (!isSub) {
                    const hrefM = c0.match(/href="([^"]+)"/);
                    if (hrefM) { companyUrl = hrefM[1]; currentCompanyUrl = companyUrl; }
                    if (company) currentCompany = company;
                }

                const rawRole = stripTags(c1);
                const noSponsorship = rawRole.includes('🛂');
                const requiresCitizenship = c1.includes('🇺🇸');
                const isFaang = rawRole.includes('🔥');
                const requiresAdvancedDegree = rawRole.includes('🎓');
                const isClosed = rawRole.includes('🔒') || c3.includes('🔒');
                const role = rawRole.replace(/[🛂🔥🎓🔒]/gu, '').replace(/[\u{1F1E6}-\u{1F1FF}]{2}/gu, '').trim();

                if (!role || role.toLowerCase() === 'role') continue;

                const location = stripTags(c2);
                const applyM = c3.match(/href="([^"]+)"[^>]*>[\s\S]*?alt="Apply"/i);
                const applyUrl = applyM ? applyM[1] : '';
                const simpM = c3.match(/href="([^"]+)"[^>]*>[\s\S]*?alt="Simplify"/i);
                const simplifyUrl = simpM ? simpM[1] : '';
                const age = stripTags(c4);

                internships.push({
                    company: company || currentCompany,
                    companyUrl,
                    role, location, applyUrl, simplifyUrl, age,
                    isClosed, isSubRole: isSub, section: currentSection, source,
                    noSponsorship, requiresCitizenship, isFaang, requiresAdvancedDegree,
                });
            }
        } else {
            // Non-table: collect all headings in document order
            type HMatch = { index: number; text: string };
            const headings: HMatch[] = [];
            for (const m of part.matchAll(/<h[23][^>]*>(.*?)<\/h[23]>/gi))
                headings.push({ index: m.index!, text: stripTags(m[1]) });
            for (const m of part.matchAll(/^#{1,3}\s+(.+)$/gm))
                headings.push({ index: m.index!, text: m[1].trim() });
            headings.sort((a, b) => a.index - b.index);

            for (const { text } of headings) {
                if (SKIP_HEADING.test(text)) continue;
                const cleaned = text
                    .replace(/\s+Internship Roles?$/i, '')
                    .replace(/\s*\(\d+\)$/, '')
                    .trim();
                if (cleaned) currentSection = cleaned;
            }
        }
    }

    return internships;
}

async function fetchInternships(): Promise<{
    active: Internship[];
    offSeason: Internship[];
    fetchedAt: string;
}> {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
    const internalKey = process.env.INTERNSHIP_API_KEY || '';

    // Try backend first — it returns pre-parsed structured JSON (no markdown).
    try {
        const res = await fetch(`${backendUrl}/api/v1/internships`, {
            headers: internalKey ? { 'X-Internal-Key': internalKey } : {},
            next: { revalidate: 86400 },
        });
        if (res.ok) {
            const data = await res.json();
            // Backend already parsed the markdown — use typed data directly.
            return {
                active: (data.active ?? []) as Internship[],
                offSeason: (data.off_season ?? []) as Internship[],
                fetchedAt: new Date((data.fetched_at ?? 0) * 1000).toISOString(),
            };
        }
        console.warn('Backend internship endpoint returned', res.status, '— falling back to GitHub');
    } catch (err) {
        console.warn('Backend unreachable — falling back to GitHub', err);
    }

    // Fallback: fetch directly from GitHub
    const URLS = {
        active: 'https://raw.githubusercontent.com/SimplifyJobs/Summer2026-Internships/refs/heads/dev/README.md',
        offSeason: 'https://raw.githubusercontent.com/SimplifyJobs/Summer2026-Internships/refs/heads/dev/README-Off-Season.md',
    };
    const [activeRes, offSeasonRes] = await Promise.allSettled([
        fetch(URLS.active, { next: { revalidate: 86400 } }),
        fetch(URLS.offSeason, { next: { revalidate: 86400 } }),
    ]);
    const getText = async (r: PromiseSettledResult<Response>) =>
        r.status === 'fulfilled' && r.value.ok ? r.value.text() : '';
    const [activeText, offSeasonText] = await Promise.all([getText(activeRes), getText(offSeasonRes)]);

    return {
        active: parseGitHubMarkdown(activeText, 'active'),
        offSeason: parseGitHubMarkdown(offSeasonText, 'off-season'),
        fetchedAt: new Date().toISOString(),
    };
}

export default async function InternshipsPage() {
    const { active, offSeason, fetchedAt } = await fetchInternships();

    return (
        <InternshipListClient
            active={active}
            offSeason={offSeason}
            fetchedAt={fetchedAt}
        />
    );
}
