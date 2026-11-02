import { Suspense } from "react";

import { AuthPage } from "@/features/auth/AuthPage";

export default function AuthRoute() {
  return (
    <Suspense fallback={null}>
      <AuthPage />
    </Suspense>
  );
}
