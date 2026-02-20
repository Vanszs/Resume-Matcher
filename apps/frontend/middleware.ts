import { NextRequest, NextResponse } from 'next/server';

// Routes that don't require authentication
const PUBLIC_PATHS = ['/', '/login'];

// Routes that additionally require admin role (stored in cookie)
const ADMIN_PATHS = ['/admin'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => (p === '/' ? pathname === '/' : pathname.startsWith(p)))) {
    return NextResponse.next();
  }

  // Allow Next.js internals and static files
  if (pathname.startsWith('/_next') || pathname.startsWith('/api') || pathname.includes('.')) {
    return NextResponse.next();
  }

  // Check for auth cookie (set on login, mirrors localStorage)
  const token = request.cookies.get('auth_token')?.value;

  if (!token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Guard admin-only routes: check user_role cookie
  if (ADMIN_PATHS.some((p) => pathname.startsWith(p))) {
    const role = request.cookies.get('user_role')?.value;
    if (role !== 'admin') {
      // Non-admin users get redirected to dashboard
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  // Run on all routes except static files and api routes
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
