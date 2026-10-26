// Starts the pretend Supabase Auth server on port 54321 with a few people, for trying the real app against it.
//   npx tsx tests/helpers/serve-mock-gotrue.ts
import { startMockGoTrue } from './mock-gotrue';

(async () => {
  const server = await startMockGoTrue(54321);
  server.addUser('owner@example.com', 'Owner-Pass-123');
  server.addUser('staff@example.com', 'Staff-Pass-123');
  server.addUser('stranger@example.com', 'Stranger-Pass-123');
  console.log('mock Supabase Auth ready on', server.url);
})();
