import type { SupabaseClient } from "@supabase/supabase-js";

type AdminClient = SupabaseClient;

type ContractTemplateTable = "contract_templates" | "contract_templates_old";

type ContractTemplateResolveParams = {
  jobPostingId: string;
  docusealTemplateId: string;
  createdBy: string;
};

type SignedDocumentCreateParams = ContractTemplateResolveParams & {
  applicationId: string;
  signingMethod?: "digital" | "in_person";
  status?: string;
  metadata?: Record<string, unknown>;
};

type SignedDocumentInsertResult = {
  signedDocumentId: string;
  contractTemplateId: string;
  contractTemplateTable: ContractTemplateTable;
};

function normalizeTemplateId(templateId: string) {
  return String(templateId ?? "").trim();
}

function isLegacyContractTemplateFkError(error: { code?: string; message?: string; details?: string } | null) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase();
  return error?.code === "23503" && message.includes("contract_templates_old");
}

async function getOrCreateContractTemplateId(
  supabase: AdminClient,
  tableName: ContractTemplateTable,
  params: ContractTemplateResolveParams
) {
  const templateKey = normalizeTemplateId(params.docusealTemplateId);
  if (!templateKey) {
    return null;
  }

  const { data: existingTemplate } = await supabase
    .from(tableName)
    .select("id")
    .eq("docuseal_template_id", templateKey)
    .maybeSingle();

  if (existingTemplate?.id) {
    return existingTemplate.id as string;
  }

  const { data: newTemplate, error } = await supabase
    .from(tableName)
    .insert({
      job_posting_id: params.jobPostingId,
      template_name: `Template ${templateKey}`,
      docuseal_template_id: templateKey,
      external_id: templateKey,
      created_by: params.createdBy,
    })
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return (newTemplate?.id as string | null) ?? null;
}

async function insertSignedDocument(
  supabase: AdminClient,
  params: SignedDocumentCreateParams,
  contractTemplateId: string
) {
  const { data, error } = await supabase
    .from("signed_documents")
    .insert({
      application_id: params.applicationId,
      contract_template_id: contractTemplateId,
      signing_method: params.signingMethod ?? "digital",
      status: params.status ?? "sent",
      ...(params.metadata ? { metadata: params.metadata } : {}),
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    return { error: error ?? new Error("Failed to create signed_documents placeholder"), id: null };
  }

  return { error: null, id: data.id as string };
}

export async function createSignedDocumentPlaceholderWithTemplateFallback(
  supabase: AdminClient,
  params: SignedDocumentCreateParams
): Promise<SignedDocumentInsertResult> {
  const currentTemplateId = await getOrCreateContractTemplateId(supabase, "contract_templates", params);
  if (!currentTemplateId) {
    throw new Error("No contract template could be resolved for this job posting");
  }

  const currentInsert = await insertSignedDocument(supabase, params, currentTemplateId);
  if (currentInsert.id) {
    return {
      signedDocumentId: currentInsert.id,
      contractTemplateId: currentTemplateId,
      contractTemplateTable: "contract_templates",
    };
  }

  if (isLegacyContractTemplateFkError(currentInsert.error)) {
    const legacyTemplateId = await getOrCreateContractTemplateId(supabase, "contract_templates_old", params);
    if (legacyTemplateId) {
      const legacyInsert = await insertSignedDocument(supabase, params, legacyTemplateId);
      if (legacyInsert.id) {
        return {
          signedDocumentId: legacyInsert.id,
          contractTemplateId: legacyTemplateId,
          contractTemplateTable: "contract_templates_old",
        };
      }

      throw legacyInsert.error instanceof Error
        ? legacyInsert.error
        : new Error("Failed to create signed_documents placeholder using legacy contract template compatibility path");
    }
  }

  throw currentInsert.error instanceof Error
    ? currentInsert.error
    : new Error("Failed to create signed_documents placeholder");
}