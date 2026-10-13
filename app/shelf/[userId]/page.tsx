import PublicShelfView from "../../../components/PublicShelfView";

type PublicShelfPageProps = {
  params: Promise<{ userId: string }>;
};

export default async function PublicShelfPage({
  params,
}: PublicShelfPageProps) {
  const { userId } = await params;
  return <PublicShelfView userId={userId} />;
}
