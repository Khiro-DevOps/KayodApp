const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error('Supabase env vars missing.');
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { data: ct, error: ctErr } = await supabase.from('contract_templates').select('id, job_posting_id, external_id, created_by').limit(5);
    console.log('contract_templates:', ctErr ? ctErr : ct);

    const { data: apps, error: appErr } = await supabase.from('applications').select('id, candidate_id, job_posting_id, status').limit(5);
    console.log('applications:', appErr ? appErr : apps);

    const { data: offers, error: offerErr } = await supabase.from('job_offers').select('id, application_id, status, docuseal_submission_id').limit(5);
    console.log('job_offers:', offerErr ? offerErr : offers);
  } catch (err) {
    console.error('Error querying DB:', err);
  }
}

main();
