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

                const role = stripTags(cell1);
                const location = stripTags(cell2);

                // Extract apply URL (first link with img alt="Apply")
                const applyMatch = cell3.match(/href="([^"]+)"[^>]*>[\s\S]*?alt="Apply"/i);
                const applyUrl = applyMatch ? applyMatch[1] : '';

                // Extract Simplify URL
                const simplifyMatch = cell3.match(/href="([^"]+)"[^>]*>[\s\S]*?alt="Simplify"/i);
                const simplifyUrl = simplifyMatch ? simplifyMatch[1] : '';

                const age = stripTags(cell4);
                const isClosed = cell3.includes('🔒') || role.includes('🔒');

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
                });
            }
        } else {
            // Non-table part — look for section headings.
            // Raw GitHub markdown uses ## headings (not <h2> tags), so check both.
            const htmlHeading = part.match(/<h[23][^>]*>(.*?)<\/h[23]>/i);
            const mdHeading = part.match(/^#{1,3}\s+(.+)$/m);
            const rawHeading = htmlHeading ? stripTags(htmlHeading[1]) : mdHeading ? mdHeading[1].trim() : null;
            if (rawHeading) {
                // Skip meta headings like "Browse N Roles" or emoji-only noise
                const skipRx = /Browse\s+\d+|😫|😮|^The List/i;
                if (!skipRx.test(rawHeading)) {
                    currentSection = rawHeading
                        // Strip trailing " Internship Roles" / " Internship Role"
                        .replace(/\s+Internship Roles?$/i, '')
                        // Strip trailing count like " (478)"
                        .replace(/\s*\(\d+\)$/, '')
                        .trim();
                }
            }
        }
    }

    return internships;
}

async function fetchInternships(): Promise<{
    active: Internship[];
    offSeason: Internship[];
    inactive: Internship[];
    fetchedAt: string;
}> {
    const URLS = {
        active: 'https://raw.githubusercontent.com/SimplifyJobs/Summer2026-Internships/refs/heads/dev/README.md',
        offSeason: 'https://raw.githubusercontent.com/SimplifyJobs/Summer2026-Internships/refs/heads/dev/README-Off-Season.md',
        inactive: 'https://raw.githubusercontent.com/SimplifyJobs/Summer2026-Internships/refs/heads/dev/README-Inactive.md',
    };

    const [activeRes, offSeasonRes, inactiveRes] = await Promise.allSettled([
        fetch(URLS.active, { next: { revalidate: 86400 } }),
        fetch(URLS.offSeason, { next: { revalidate: 86400 } }),
        fetch(URLS.inactive, { next: { revalidate: 86400 } }),
    ]);

    const getText = async (res: PromiseSettledResult<Response>) => {
        if (res.status === 'fulfilled' && res.value.ok) return res.value.text();
        return '';
    };

    const [activeText, offSeasonText, inactiveText] = await Promise.all([
        getText(activeRes),
        getText(offSeasonRes),
        getText(inactiveRes),
    ]);

    return {
        active: parseGitHubMarkdown(activeText, 'active'),
        offSeason: parseGitHubMarkdown(offSeasonText, 'off-season'),
        inactive: parseGitHubMarkdown(inactiveText, 'inactive'),
        fetchedAt: new Date().toISOString(),
    };
}

export default async function InternshipsPage() {
    const { active, offSeason, inactive, fetchedAt } = await fetchInternships();

    return (
        <InternshipListClient
            active={active}
            offSeason={offSeason}
            inactive={inactive}
            fetchedAt={fetchedAt}
        />
    );
}
