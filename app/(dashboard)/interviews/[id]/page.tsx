// app/(dashboard)/interviews/[id]/page.tsx
import InterviewRoomPage from "./interview-room-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InterviewRoomPage interviewId={id} />;
}