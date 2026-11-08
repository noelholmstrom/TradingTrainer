import StatsClient from '@/components/StatsClient';
import { supabaseConfigured } from '@/lib/supabase/config';
import { getUser } from '@/lib/supabase/server';

export const metadata = { title: 'Stats' };

export default async function StatsPage() {
  const user = await getUser();
  return (
    <main className="page">
      <StatsClient signedIn={!!user} accounts={supabaseConfigured} />
    </main>
  );
}
