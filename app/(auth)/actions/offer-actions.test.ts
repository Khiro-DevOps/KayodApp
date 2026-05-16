import { beforeEach, describe, expect, it, vi } from "vitest";

type FailureMode =
  | { kind: "error-object"; message: string }
  | { kind: "throw"; message: string };

type MockRow = Record<string, unknown>;

type TableName = "applications" | "contract_templates" | "job_offers" | "job_postings" | "signed_documents";

function createMockDatabase() {
  const tables: Record<TableName, MockRow[]> = {
    applications: [],
    contract_templates: [],
    job_offers: [],
    job_postings: [],
    signed_documents: [],
  };

  const counters: Record<Exclude<TableName, "applications" | "job_postings">, number> = {
    contract_templates: 0,
    job_offers: 0,
    signed_documents: 0,
  };

  const failures = new Map<string, FailureMode>();
  const currentUser = { id: "user-1" };

  function cloneRow<T extends MockRow>(row: T): T {
    return structuredClone(row);
  }

  function reset(seed?: Partial<Record<TableName, MockRow[]>>) {
    for (const tableName of Object.keys(tables) as TableName[]) {
      tables[tableName] = (seed?.[tableName] ?? []).map((row) => cloneRow(row));
    }
    counters.contract_templates = 0;
    counters.job_offers = 0;
    counters.signed_documents = 0;
    failures.clear();
  }

  function setFailure(table: TableName, operation: "insert" | "update", failure: FailureMode) {
    failures.set(`${table}.${operation}`, failure);
  }

  function matches(row: MockRow, filters: Array<{ kind: "eq" | "in"; column: string; value: unknown }>) {
    return filters.every((filter) => {
      if (filter.kind === "eq") {
        return row[filter.column] === filter.value;
      }

      const values = Array.isArray(filter.value) ? filter.value : [];
      return values.includes(row[filter.column]);
    });
  }

  function applyFilters(tableName: TableName, filters: Array<{ kind: "eq" | "in"; column: string; value: unknown }>) {
    return tables[tableName].filter((row) => matches(row, filters));
  }

  function nextId(tableName: Exclude<TableName, "applications" | "job_postings">) {
    counters[tableName] += 1;
    const prefix =
      tableName === "job_offers"
        ? "offer"
        : tableName === "signed_documents"
        ? "signed-doc"
        : "template";
    return `${prefix}-${counters[tableName]}`;
  }

  class MockQuery {
    private operation: "select" | "insert" | "update" | "delete" = "select";

    private payload: MockRow | MockRow[] | null = null;

    private filters: Array<{ kind: "eq" | "in"; column: string; value: unknown }> = [];

    constructor(private readonly tableName: TableName) {}

    select() {
      this.operation = this.operation === "insert" ? "insert" : "select";
      return this;
    }

    insert(payload: MockRow | MockRow[]) {
      this.operation = "insert";
      this.payload = payload;
      return this;
    }

    update(payload: MockRow) {
      this.operation = "update";
      this.payload = payload;
      return this;
    }

    delete() {
      this.operation = "delete";
      this.payload = null;
      return this;
    }

    eq(column: string, value: unknown) {
      this.filters.push({ kind: "eq", column, value });
      return this;
    }

    in(column: string, value: unknown[]) {
      this.filters.push({ kind: "in", column, value });
      return this;
    }

    single() {
      return this.execute(true);
    }

    maybeSingle() {
      return this.execute(true, true);
    }

    then<TResult1 = { data: unknown; error: { message: string } | null }, TResult2 = never>(
      onfulfilled?: ((value: { data: unknown; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return this.execute(false).then(onfulfilled, onrejected);
    }

    private async execute(single = false, allowNull = false) {
      const failure = failures.get(`${this.tableName}.${this.operation}`);
      if (failure) {
        if (failure.kind === "throw") {
          throw new Error(failure.message);
        }

        return { data: null, error: { message: failure.message } };
      }

      if (this.operation === "select") {
        const rows = applyFilters(this.tableName, this.filters);
        return { data: single ? rows[0] ?? (allowNull ? null : null) : rows, error: null };
      }

      if (this.operation === "insert") {
        const rowsToInsert = Array.isArray(this.payload) ? this.payload : [this.payload ?? {}];
        const insertedRows = rowsToInsert.map((row) => {
          const nextRow = cloneRow(row);
          if (this.tableName === "job_offers") {
            nextRow.id = nextId("job_offers");
          } else if (this.tableName === "signed_documents") {
            nextRow.id = nextId("signed_documents");
          } else if (this.tableName === "contract_templates") {
            nextRow.id = nextId("contract_templates");
          }

          tables[this.tableName].push(nextRow);
          return nextRow;
        });

        return { data: single ? insertedRows[0] ?? null : insertedRows, error: null };
      }

      if (this.operation === "update") {
        const rows = applyFilters(this.tableName, this.filters);
        for (const row of rows) {
          Object.assign(row, this.payload ?? {});
        }

        return { data: single ? rows[0] ?? null : rows, error: null };
      }

      const rows = applyFilters(this.tableName, this.filters);
      tables[this.tableName] = tables[this.tableName].filter((row) => !rows.includes(row));
      return { data: single ? rows[0] ?? null : rows, error: null };
    }
  }

  const adminClient = {
    from(tableName: TableName) {
      return new MockQuery(tableName);
    },
  };

  const userClient = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: currentUser }, error: null })),
    },
    from(tableName: TableName) {
      return new MockQuery(tableName);
    },
  };

  function query(tableName: TableName) {
    return new MockQuery(tableName);
  }

  return {
    adminClient,
    currentUser,
    query,
    reset,
    setFailure,
    tables,
    userClient,
  };
}

const mockDatabase = vi.hoisted(() => createMockDatabase());
const mockSendOfferWithDocuSeal = vi.hoisted(() => vi.fn());
const mockRevalidatePath = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: () => mockDatabase.adminClient,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => mockDatabase.userClient),
}));

vi.mock("@/app/(dashboard)/jobs/manage/[id]/applicants/[appId]/offer/send-with-docuseal-actions", () => ({
  sendOfferWithDocuSeal: mockSendOfferWithDocuSeal,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

import { sendHydratedOffer } from "./offer-actions";

async function callSendHydratedOffer(jobId: string, applicationId: string) {
  try {
    return await sendHydratedOffer(jobId, applicationId);
  } catch {
    return { success: false };
  }
}

describe("sendHydratedOffer", () => {
  beforeEach(() => {
    mockDatabase.reset({
      applications: [
        {
          id: "app-1",
          status: "negotiating",
          candidate_id: "candidate-1",
        },
      ],
      job_postings: [
        {
          id: "job-1",
          title: "Senior Engineer",
          work_setup: "Remote",
          salary_min: 65000,
          offer_letter_settings: null,
          docuseal_template_id: null,
          created_by: "user-1",
        },
      ],
    });

    mockSendOfferWithDocuSeal.mockResolvedValue({ success: true, url: "https://docuseal.test/submission/abc" });
    mockRevalidatePath.mockClear();
  });

  it("creates the offer, signed document, and application update successfully", async () => {
    const result = await sendHydratedOffer("job-1", "app-1");

    expect(result).toEqual({
      success: true,
      offerId: "offer-1",
      signedDocId: "signed-doc-1",
      docusealUrl: "https://docuseal.test/submission/abc",
    });

    const offerRecord = await mockDatabase.query("job_offers").select().eq("id", "offer-1").single();
    const signedDocumentRecord = await mockDatabase.query("signed_documents").select().eq("id", "signed-doc-1").single();
    const applicationRecord = await mockDatabase.query("applications").select().eq("id", "app-1").single();

    expect(offerRecord.data).toMatchObject({
      id: "offer-1",
      application_id: "app-1",
      job_id: "job-1",
      status: "SENT",
      is_active: true,
      created_by: "user-1",
    });
    expect(signedDocumentRecord.data).toMatchObject({
      id: "signed-doc-1",
      application_id: "app-1",
      status: "sent",
      docuseal_submission_url: "https://docuseal.test/submission/abc",
      metadata: { job_offer_id: "offer-1" },
    });
    expect(applicationRecord.data).toMatchObject({
      id: "app-1",
      status: "offer_sent",
      contract_offer_id: "signed-doc-1",
    });
  });

  it("rolls back the job offer when signed_documents insertion fails", async () => {
    mockDatabase.setFailure("signed_documents", "insert", {
      kind: "error-object",
      message: "signed_documents insert failed",
    });

    const result = await callSendHydratedOffer("job-1", "app-1");

    expect(result).toEqual({ success: false });

    const offerRecord = await mockDatabase.query("job_offers").select().eq("application_id", "app-1").maybeSingle();
    const signedDocumentRecord = await mockDatabase.query("signed_documents").select().eq("application_id", "app-1").maybeSingle();

    expect(offerRecord.data).toBeNull();
    expect(signedDocumentRecord.data).toBeNull();
  });

  it("rolls back both writes when the application status update fails", async () => {
    mockDatabase.setFailure("applications", "update", {
      kind: "throw",
      message: "applications update failed",
    });

    const result = await callSendHydratedOffer("job-1", "app-1");

    expect(result).toEqual({ success: false });

    const offerRecord = await mockDatabase.query("job_offers").select().eq("application_id", "app-1").maybeSingle();
    const signedDocumentRecord = await mockDatabase.query("signed_documents").select().eq("application_id", "app-1").maybeSingle();
    const applicationRecord = await mockDatabase.query("applications").select().eq("id", "app-1").single();

    expect(offerRecord.data).toBeNull();
    expect(signedDocumentRecord.data).toBeNull();
    expect(applicationRecord.data).toMatchObject({
      id: "app-1",
      status: "negotiating",
    });
    expect(applicationRecord.data?.contract_offer_id).toBeUndefined();
  });
});