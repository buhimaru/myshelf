import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "本棚",
};

export default function ShelfPage() {
  redirect("/");
}
