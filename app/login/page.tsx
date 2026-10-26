import { usingSupabase } from '@/lib/config';
import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return <LoginForm mode={usingSupabase() ? 'email' : 'username'} />;
}
