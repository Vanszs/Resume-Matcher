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

// Decode HTML entities in text
function decodeHtml(html: string): string {
    return html
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ');
}

// Strip all HTML tags from a string
function stripTags(html: string): string {
    return decodeHtml(html.replace(/<[^>]+>/g, '').trim());
}

function parseGitHubMarkdown(html: string, source: Internship['source']): Internship[] {
    const internships: Internship[] = [];
    let currentSection = 'General';
    let currentCompany = '';
    let currentCompanyUrl = '';

    // Extract section headers + their tables
    // sections are <h2> or <h3> elements
    const sectionRx = /<h[23][^>]*>(.*?)<\/h[23]>/gi;
    const tableRx = /<table[\s\S]*?<\/table>/gi;

    // Split by tables, keeping track of headers between them
    const parts = html.split(/(<table[\s\S]*?<\/table>)/i);

    for (const part of parts) {
        if (/<table/i.test(part)) {
            // It's a table — parse its rows
            const tbodyMatch = part.match(/<tbody>([\s\S]*?)<\/tbody>/i);
            if (!tbodyMatch) continue;

            const tbody = tbodyMatch[1];
            const rows = tbody.match(/<tr>([\s\S]*?)<\/tr>/gi) || [];

            for (const row of rows) {
                const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
                if (cells.length < 4) continue;

                const cell0 = (cells[0] ?? '').replace(/<td[^>]*>|<\/td>/gi, '');
                const cell1 = (cells[1] ?? '').replace(/<td[^>]*>|<\/td>/gi, '');
                const cell2 = (cells[2] ?? '').replace(/<td[^>]*>|<\/td>/gi, '');
                const cell3 = cells[3] ? cells[3].replace(/<td[^>]*>|<\/td>/gi, '') : '';
                const cell4 = cells[4] ? cells[4].replace(/<td[^>]*>|<\/td>/gi, '') : '';

                const rawCompany = stripTags(cell0);
                const isSubRole = rawCompany === '↳' || rawCompany === '' && cell0.trim() === '<td>↳</td>';
                const isSub = cell0.includes('↳') || stripTags(cell0) === '↳';

                // Determine company info
                let company = isSubRole || isSub ? currentCompany : stripTags(cell0);
                let companyUrl = currentCompanyUrl;

                if (!isSub) {
                    // Extract company URL
                    const companyUrlMatch = cell0.match(/href="([^"]+)"/);
                    if (companyUrlMatch) {
                        companyUrl = companyUrlMatch[1];
                        currentCompanyUrl = companyUrl;
                    }
                    company = stripTags(cell0).replace('↳', '').trim();
                    if (company) currentCompany = company;
                }

                const rawRole = stripTags(cell1);
                const location = stripTags(cell2);

                // Extract special flags from role text
                const noSponsorship = rawRole.includes('🛂');
                const requiresCitizenship = rawRole.includes('🇺🇸');
                const isFaang = rawRole.includes('🔥');
                const requiresAdvancedDegree = rawRole.includes('🎓');

                // Strip flag icons from displayed role name
                const role = rawRole.replace(/[🛂🇺🇸🔥🎓]/gu, '').trim();

                // Extract apply URL (first link with img alt="Apply")
                const applyMatch = cell3.match(/href="([^"]+)"[^>]*>[\s\S]*?alt="Apply"/i);
                const applyUrl = applyMatch ? applyMatch[1] : '';

                // Extract Simplify URL
                const simplifyMatch = cell3.match(/href="([^"]+)"[^>]*>[\s\S]*?alt="Simplify"/i);
                const simplifyUrl = simplifyMatch ? simplifyMatch[1] : '';

                const age = stripTags(cell4);
                const isClosed = cell3.includes('🔒') || rawRole.includes('🔒');

                if (!role || role === 'Role') continue; // skip header rows

                internships.push({
                    company: company || currentCompany,
                    companyUrl: companyUrl || currentCompanyUrl,
                    role,
                    location,
                    applyUrl,
                    simplifyUrl,
                    age,
                    isClosed,
                    isSubRole: isSub,
                    section: currentSection,
                    source,
                    noSponsorship,
                    requiresCitizenship,
                    isFaang,
                    requiresAdvancedDegree,
                });
            }
        } else {
            // Non-table part — scan ALL headings in order.
            // Raw GitHub markdown uses ## headings; some sections also use <h2> HTML tags.
            // We must process every heading (not just the first) because multiple headings
            // can appear in the same text block (e.g. "Browse N roles" then "💻 Software Engineering").
            const skipRx = /Browse\s+\d+|See Full List|😫|😮|^The List/i;

            const htmlHeadingRx = /<h[23][^>]*>(.*?)<\/h[23]>/gi;
            const mdHeadingRx = /^#{1,3}\s+(.+)$/gm;

            // Collect all headings in document order
            type HeadingMatch = { index: number; text: string };
            const headings: HeadingMatch[] = [];

            let m: RegExpExecArray | null;
            while ((m = htmlHeadingRx.exec(part)) !== null) {
                headings.push({ index: m.index, text: stripTags(m[1]) });
            }
            while ((m = mdHeadingRx.exec(part)) !== null) {
                headings.push({ index: m.index, text: m[1].trim() });
            }
            // Sort by position in the string
            headings.sort((a, b) => a.index - b.index);

            for (const { text } of headings) {
                if (skipRx.test(text)) continue;
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
