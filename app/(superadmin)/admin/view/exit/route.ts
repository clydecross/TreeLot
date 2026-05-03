import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL('/admin', req.url));
  res.cookies.delete('superadmin_org');
  res.cookies.delete('superadmin_clerk_id');
  return res;
}
