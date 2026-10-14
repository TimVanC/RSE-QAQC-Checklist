'use server';

import { redirect } from 'next/navigation';
import { getAuth } from '@/src/lib/auth/server';

export async function signOutAction() {
  await getAuth().signOut();
  redirect('/login');
}
