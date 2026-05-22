import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const id = 'bfe45863-3fc7-40f7-9917-041e4d53b276';

async function check() {
  const { data: docs, error: e1 } = await supabase.from('signed_documents').select('*').eq('application_id', id);
  console.log('signed_documents for app id:', docs?.length);
  if (docs && docs.length > 0) {
    console.log(docs);
  } else {
    console.log(e1);
  }

  const { data: legacy, error: e2 } = await supabase.from('job_offer_applications').select('*').eq('application_id', id);
  console.log('job_offer_applications for app id:', legacy?.length);
  if (legacy && legacy.length > 0) {
    console.log(legacy);
  } else {
    console.log(e2);
  }
}
check().catch(console.error);
