import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const applicationId = 'bfe45863-3fc7-40f7-9917-041e4d53b276';

async function fix() {
  const { data: app } = await supabase.from('applications').select('job_posting_id, candidate_id').eq('id', applicationId).single();
  const jobPostingId = app?.job_posting_id || '77054ab6-d8ff-40a7-865f-29fb4ac76a88';

  const { data: jobInfo } = await supabase.from('job_postings').select('created_by').eq('id', jobPostingId).single();

  const { data: jobOffer } = await supabase
    .from('job_offers')
    .select('*, job_postings(docuseal_template_id)')
    .eq('application_id', applicationId)
    .single();

  if (!jobOffer) {
    console.log("No job_offer found for this application");
    return;
  }

  const docusealTemplateId = jobOffer.job_postings?.docuseal_template_id || '9948230'; // fallback
  console.log("Template ID:", docusealTemplateId);

  let templateId = null;
  const { data: ct } = await supabase
    .from('contract_templates')
    .select('id')
    .eq('docuseal_template_id', docusealTemplateId.toString())
    .maybeSingle();

  if (ct) {
    templateId = ct.id;
  } else {
    const { data: newCt, error: ctError } = await supabase
      .from('contract_templates')
      .insert({
        job_posting_id: jobPostingId,
        template_name: `Template ${docusealTemplateId}`,
        docuseal_template_id: docusealTemplateId.toString(),
        external_id: docusealTemplateId.toString(),
        created_by: jobInfo?.created_by || '16921b33-e5fb-4293-aba5-75e3c880ecfb' // some uuid if missing
      })
      .select('id')
      .single();
    if (ctError) {
      console.error("Failed to create contract template:", ctError);
      return;
    }
    templateId = newCt?.id;
  }
  
  console.log("Using contract_template_id:", templateId);

  let docusealSubmissionUrl = null;
  if (jobOffer.docuseal_submission_id) {
    try {
      const docusealRes = await fetch(`https://api.docuseal.co/submissions/${jobOffer.docuseal_submission_id}`, {
        headers: { "X-Auth-Token": process.env.DOCUSEAL_API_KEY || "" }
      });
      if (docusealRes.ok) {
        const data = await docusealRes.json();
        docusealSubmissionUrl = data?.[0]?.url || data?.url || null;
      }
    } catch (e) {}
  }

  const { data: signedDoc, error: insertError } = await supabase
    .from('signed_documents')
    .insert({
      application_id: applicationId,
      contract_template_id: templateId,
      signing_method: 'digital',
      status: 'sent',
      docuseal_submission_url: docusealSubmissionUrl,
      metadata: {
        docuseal_submission_id: jobOffer.docuseal_submission_id
      }
    })
    .select('id')
    .single();

  if (insertError) {
    console.error("Failed to insert signed_documents", insertError);
    return;
  }

  console.log("Created signed_documents:", signedDoc.id);

  const { error: updateError } = await supabase
    .from('applications')
    .update({ contract_offer_id: signedDoc.id })
    .eq('id', applicationId);

  if (updateError) {
    console.error("Failed to update application", updateError);
  } else {
    console.log("Updated application.contract_offer_id successfully!");
  }
}

fix().catch(console.error);
