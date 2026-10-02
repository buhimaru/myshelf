import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "検索",
};

export default function WorksPage() {
  redirect("/search");
}
