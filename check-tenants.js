const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  try {
    // Check tenants table
    const { data: tenants, error: tenantsErr } = await supabase
      .from('tenants')
      .select('*')
      .limit(3);
    
    console.log('TENANTS TABLE EXISTS:', !tenantsErr);
    if (tenantsErr) console.log('Error:', tenantsErr.message);
    if (tenants) {
      console.log('Sample tenants:', JSON.stringify(tenants, null, 2));
    }

    // Check profiles with tenant_name
    const { data: profiles, error: profilesErr } = await supabase
      .from('profiles')
      .select('id, email, first_name, tenant_name, role')
      .eq('role', 'hr_manager')
      .limit(3);

    console.log('\nSample HR Profiles:');
    if (profiles) {
      console.log(JSON.stringify(profiles, null, 2));
    }
    if (profilesErr) console.log('Error:', profilesErr.message);
  } catch (err) {
    console.error('Error:', err.message);
  }
})();
