import type { Metadata } from "next";

import { LoginForm } from "@/components/login-form";

export const metadata: Metadata = {
  title: "ログイン",
};

export default function LoginPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-6">
      <LoginForm />
    </div>
  );
}
