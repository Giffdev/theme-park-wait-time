import { getAuth } from 'firebase-admin/auth';
import { adminApp } from '@/lib/firebase/admin';

export async function verifyIdToken(token: string): Promise<{ uid?: string }> {
  return getAuth(adminApp).verifyIdToken(token);
}
