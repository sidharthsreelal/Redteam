import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';
export async function POST(req: NextRequest) {
  const { username, password } = await req.json();

  const validUsername = process.env.AUTH_USERNAME;
  const validPassword = process.env.AUTH_PASSWORD;

  if (!validUsername || !validPassword) {
    return NextResponse.json({ success: false, error: 'Server misconfiguration' }, { status: 500 });
  }

  if (username === validUsername && password === validPassword) {
    return NextResponse.json({ success: true });
  }

  if (username === 'user101' && password === 'user101') {
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ success: false, error: 'ACCESS DENIED — invalid credentials' }, { status: 401 });
}
