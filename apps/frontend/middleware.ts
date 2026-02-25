import { NextRequest, NextResponse } from 'next/server';

// Routes that don't require authentication
const PUBLIC_PATHS = ['/', '/login', '/internships'];

// Routes that additionally require admin role (stored in cookie)
const ADMIN_PATHS = ['/admin'];

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    const noIndexValue = 'noindex, nofollow, noarchive';

    // Allow Next.js internals and static files first (before any other checks)
    if (
        pathname.startsWith('/_next') ||
        pathname.startsWith('/api') ||
        pathname.includes('.')
    ) {
        return NextResponse.next();
    }

    // Allow public home page (normalize trailing slash)
    const normalizedPath = pathname === '/' || pathname === '' ? '/' : pathname;
    if (normalizedPath === '/') {
        const response = NextResponse.next();
        response.headers.set('X-Robots-Tag', noIndexValue);
        // Clear any stale cache headers that might cause redirect loops
        response.headers.set('Cache-Control', 'no-store, must-revalidate');
        return response;
    }

    if (pathname.startsWith('/login')) {
        // If the user already has an auth token, redirect to dashboard
        const token = request.cookies.get('auth_token')?.value;
        if (token) {
            const rawDestination = new URL(request.url).searchParams.get('from') || '/dashboard';
            // Guard against open-redirect: only allow relative paths (not //evil.com or https://...)
            const destination =
                rawDestination.startsWith('/') && !rawDestination.startsWith('//')
                    ? rawDestination
                    : '/dashboard';
            const response = NextResponse.redirect(new URL(destination, request.url));
            response.headers.set('X-Robots-Tag', noIndexValue);
            return response;
        }
        const response = NextResponse.next();
        response.headers.set('X-Robots-Tag', noIndexValue);
        // Prevent caching of login page
        response.headers.set('Cache-Control', 'no-store, must-revalidate');
        return response;
    }

    // Public pages — no auth required
    if (pathname.startsWith('/internships')) {
        return NextResponse.next();
    }

    // Check for auth cookie (set on login, mirrors localStorage)
    const token = request.cookies.get('auth_token')?.value;

    if (!token) {
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('from', pathname);
        const response = NextResponse.redirect(loginUrl);
        response.headers.set('X-Robots-Tag', noIndexValue);
        return response;
    }

    // Guard admin-only routes: check user_role cookie
    if (ADMIN_PATHS.some((p) => pathname.startsWith(p))) {
        const role = request.cookies.get('user_role')?.value;
        if (role !== 'admin') {
            // Non-admin users get redirected to dashboard
            const response = NextResponse.redirect(new URL('/dashboard', request.url));
            response.headers.set('X-Robots-Tag', noIndexValue);
            return response;
        }
    }

    const response = NextResponse.next();
    response.headers.set('X-Robots-Tag', noIndexValue);
    return response;
}

export const config = {
    // Run on all routes except static files and api routes
    matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
