"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { OfferContext } from "@/lib/offer-templating";
import { Database } from "@/lib/database.types";

export type OfferStatus = 'DRAFT' | 'SENT' | 'NEGOTIATION_PENDING' | 'REVISED' | 'ACCEPTED' | 'DECLINED' | 'HIRED';

export interface OfferData {
  job_metadata?: Record<string, any>;
  org_hierarchy?: Record<string, any>;
  financial_package?: Record<string, any>;
  logistics?: Record<string, any>;
  benefits_config?: Record<string, any>;
  legal_clauses?: Record<string, any>;
  workflow_meta?: Record<string, any>;
}

/**
 * Fetches an offer and populates the OfferContext payload for Handlebars.
 */
export async function getOfferContext(offerId: string): Promise<OfferContext> {
  const supabase = createClient();
  
  const { data: offer, error } = await supabase
    .from('job_offers')
    .select(`
      *,
      applications (
        id,
        candidate_id,
        profiles!applications_candidate_id_fkey (
          first_name,
          last_name,
          email
        )
      ),
      job_postings (
        title,
        company_name,
        location
      )
    `)
    .eq('id', offerId)
    .single();

  if (error || !offer) throw new Error("Offer not found");

  return {
    job_metadata: offer.job_metadata as Record<string, any> || {},
    org_hierarchy: offer.org_hierarchy as Record<string, any> || {},
    financial_package: offer.financial_package as Record<string, any> || {},
    logistics: offer.logistics as Record<string, any> || {},
    benefits_config: offer.benefits_config as Record<string, any> || {},
    legal_clauses: offer.legal_clauses as Record<string, any> || {},
    workflow_meta: offer.workflow_meta as Record<string, any> || {},
    candidate: {
      first_name: (offer.applications as any)?.profiles?.first_name,
      last_name: (offer.applications as any)?.profiles?.last_name,
      email: (offer.applications as any)?.profiles?.email,
    },
    company: {
      name: (offer.job_postings as any)?.company_name,
      location: (offer.job_postings as any)?.location,
      title: (offer.job_postings as any)?.title,
    }
  };
}

/**
 * Creates an initial DRAFT offer for an application.
 */
export async function createDraftOffer(applicationId: string, jobPostingId: string, initialData?: OfferData) {
  const supabase = createClient();
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from('job_offers')
    .insert([
      {
        application_id: applicationId,
        job_posting_id: jobPostingId,
        created_by: userData.user.id,
        status: 'DRAFT',
        job_metadata: initialData?.job_metadata || {},
        org_hierarchy: initialData?.org_hierarchy || {},
        financial_package: initialData?.financial_package || {},
        logistics: initialData?.logistics || {},
        benefits_config: initialData?.benefits_config || {},
        legal_clauses: initialData?.legal_clauses || {},
        workflow_meta: initialData?.workflow_meta || {},
      }
    ])
    .select()
    .single();

  if (error) throw new Error(`Failed to create draft offer: ${error.message}`);
  
  revalidatePath('/jobs/manage');
  return data;
}

/**
 * Updates an existing DRAFT or NEGOTIATION_PENDING offer.
 */
export async function updateOffer(offerId: string, updateData: OfferData) {
  const supabase = createClient();

  // First fetch the current offer to ensure it's updatable
  const { data: currentOffer, error: fetchError } = await supabase
    .from('job_offers')
    .select('status')
    .eq('id', offerId)
    .single();

  if (fetchError || !currentOffer) throw new Error("Offer not found");
  if (!['DRAFT', 'NEGOTIATION_PENDING', 'SENT'].includes(currentOffer.status)) {
    throw new Error(`Cannot update offer in ${currentOffer.status} state`);
  }

  const { data, error } = await supabase
    .from('job_offers')
    .update({
      job_metadata: updateData.job_metadata,
      org_hierarchy: updateData.org_hierarchy,
      financial_package: updateData.financial_package,
      logistics: updateData.logistics,
      benefits_config: updateData.benefits_config,
      legal_clauses: updateData.legal_clauses,
      workflow_meta: updateData.workflow_meta,
      updated_at: new Date().toISOString()
    })
    .eq('id', offerId)
    .select()
    .single();

  if (error) throw new Error(`Failed to update offer: ${error.message}`);
  
  revalidatePath('/jobs/manage');
  return data;
}

/**
 * Transitions an offer to SENT state.
 */
export async function sendOffer(offerId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('job_offers')
    .update({ status: 'SENT', updated_at: new Date().toISOString() })
    .eq('id', offerId)
    .in('status', ['DRAFT', 'REVISED'])
    .select()
    .single();

  if (error) throw new Error(`Failed to send offer: ${error.message}`);
  return data;
}

/**
 * Candidate requests changes, transitioning offer to NEGOTIATION_PENDING.
 */
export async function requestNegotiation(offerId: string, candidateNotes?: string) {
  const supabase = createClient();
  // We might store notes in workflow_meta
  // For now just change status
  const { data, error } = await supabase
    .from('job_offers')
    .update({ status: 'NEGOTIATION_PENDING', updated_at: new Date().toISOString() })
    .eq('id', offerId)
    .eq('status', 'SENT')
    .select()
    .single();

  if (error) throw new Error(`Failed to request negotiation: ${error.message}`);
  return data;
}

/**
 * HR creates a REVISED offer from a NEGOTIATION_PENDING offer.
 * This increments version_id, sets the old offer to is_active = false, and creates a new one.
 */
export async function createRevisedOffer(parentOfferId: string, overrideData: OfferData) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();

  // 1. Fetch parent offer
  const { data: parentOffer, error: fetchError } = await supabase
    .from('job_offers')
    .select('*')
    .eq('id', parentOfferId)
    .single();

  if (fetchError || !parentOffer) throw new Error("Parent offer not found");
  if (parentOffer.status !== 'NEGOTIATION_PENDING') {
    throw new Error("Can only revise an offer in NEGOTIATION_PENDING state");
  }

  // 2. Invalidate parent offer
  await supabase
    .from('job_offers')
    .update({ is_active: false })
    .eq('id', parentOfferId);

  // 3. Insert new revised offer
  const { data: revisedOffer, error: insertError } = await supabase
    .from('job_offers')
    .insert([
      {
        application_id: parentOffer.application_id,
        job_posting_id: parentOffer.job_posting_id,
        parent_offer_id: parentOffer.id,
        version_id: parentOffer.version_id + 1,
        status: 'REVISED',
        is_active: true,
        created_by: userData.user?.id || parentOffer.created_by,
        job_metadata: overrideData.job_metadata || parentOffer.job_metadata,
        org_hierarchy: overrideData.org_hierarchy || parentOffer.org_hierarchy,
        financial_package: overrideData.financial_package || parentOffer.financial_package,
        logistics: overrideData.logistics || parentOffer.logistics,
        benefits_config: overrideData.benefits_config || parentOffer.benefits_config,
        legal_clauses: overrideData.legal_clauses || parentOffer.legal_clauses,
        workflow_meta: overrideData.workflow_meta || parentOffer.workflow_meta,
      }
    ])
    .select()
    .single();

  if (insertError) throw new Error(`Failed to create revised offer: ${insertError.message}`);
  
  revalidatePath('/jobs/manage');
  return revisedOffer;
}

/**
 * Transitions an offer to ACCEPTED state (before DocuSeal signing).
 */
export async function acceptOffer(offerId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('job_offers')
    .update({ status: 'ACCEPTED', updated_at: new Date().toISOString() })
    .eq('id', offerId)
    .in('status', ['SENT', 'REVISED'])
    .select()
    .single();

  if (error) throw new Error(`Failed to accept offer: ${error.message}`);
  return data;
}

/**
 * Transitions an offer to DECLINED state.
 */
export async function declineOffer(offerId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('job_offers')
    .update({ status: 'DECLINED', updated_at: new Date().toISOString() })
    .eq('id', offerId)
    .in('status', ['SENT', 'REVISED', 'NEGOTIATION_PENDING'])
    .select()
    .single();

  if (error) throw new Error(`Failed to decline offer: ${error.message}`);
  return data;
}
