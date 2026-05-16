import type { ReactNode } from "react";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRouterRefresh = vi.hoisted(() => vi.fn());
const mockSendHydratedOffer = vi.hoisted(() => vi.fn());
const mockToast = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mockRouterRefresh,
  }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: mockToast,
}));

vi.mock("@/app/(auth)/actions/offer-actions", () => ({
  sendHydratedOffer: mockSendHydratedOffer,
}));

import ReviewBoardClient from "./review-board-client";

describe("ReviewBoardClient handleSendOffer", () => {
  beforeEach(() => {
    mockRouterRefresh.mockClear();
    mockSendHydratedOffer.mockReset();
    mockToast.error.mockClear();
    mockToast.success.mockClear();
  });

  it("keeps the candidate on the board and shows an error toast when the server returns failure", async () => {
    mockSendHydratedOffer.mockResolvedValue({ success: false, error: "DocuSeal rejected the submission" });

    render(
      <ReviewBoardClient
        jobId="job-1"
        candidates={[
          {
            app: {
              id: "app-1",
              status: "negotiating",
              match_score: 88,
              submitted_at: "2026-05-15T00:00:00.000Z",
              profiles: {
                id: "profile-1",
                first_name: "Jane",
                last_name: "Doe",
                email: "jane@example.com",
              },
              resumes: null,
            },
            interview: null,
            note: null,
          },
        ]}
      />,
    );

    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /view interview notes/i }));

    const sendOfferButton = await screen.findByRole("button", { name: /send offer/i });

    fireEvent.click(sendOfferButton);

    await waitFor(() => {
      expect(mockSendHydratedOffer).toHaveBeenCalledWith("job-1", "app-1");
    });

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("DocuSeal rejected the submission");
    });

    expect(mockToast.success).not.toHaveBeenCalled();
    expect(mockRouterRefresh).not.toHaveBeenCalled();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send offer/i })).toBeInTheDocument();
  });
});