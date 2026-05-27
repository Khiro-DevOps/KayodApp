const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const appId = process.env.TEST_APPLICATION_ID || 'bfe45863-3fc7-40f7-9917-041e4d53b276';
  const { data, error } = await supabase.from('signed_documents').select('*').eq('application_id', appId).limit(10);
  console.log('signed_documents for app:', error ? error : data);
}

main().catch(console.error);
