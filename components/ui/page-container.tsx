export default function PageContainer({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[480px] px-4 py-4">{children}</div>
  );
}
