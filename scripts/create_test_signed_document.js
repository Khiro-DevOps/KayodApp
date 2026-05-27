const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error('Supabase env vars missing. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Use a known application ID from repo script; change if needed
  const applicationId = process.env.TEST_APPLICATION_ID || 'bfe45863-3fc7-40f7-9917-041e4d53b276';

  try {
    // Ensure there is a contract_template available
    let contractTemplateId = null;
    const { data: ct } = await supabase.from('contract_templates').select('id').limit(1).single();
    if (ct && ct.id) {
      contractTemplateId = ct.id;
    } else {
      const { data: newCt, error: ctError } = await supabase.from('contract_templates').insert({
        template_name: 'Test Template',
        docuseal_template_id: 'test-template',
        created_by: process.env.TEST_CREATED_BY || null
      }).select('id').single();
      if (ctError) {
        console.error('Failed to create contract_template:', ctError);
        process.exit(1);
      }
      contractTemplateId = newCt.id;
    }
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('signed_documents')
      .insert({
        application_id: applicationId,
        contract_template_id: contractTemplateId,
        signing_method: 'digital',
        status: 'sent',
        created_at: now,
        updated_at: now
      })
      .select('id')
      .single();

    if (error) {
      console.error('Insert error:', error);
      process.exit(1);
    }

    console.log('Created signed_documents id:', data.id);
  } catch (err) {
    console.error('Unexpected error:', err);
    process.exit(1);
  }
}

main();
