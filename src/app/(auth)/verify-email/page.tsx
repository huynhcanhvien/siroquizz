import { Suspense } from "react";
import { EmailVerification } from "@/features/auth/components/EmailVerification";
export default function Page() {
  return (
    <Suspense>
      <EmailVerification />
    </Suspense>
  );
}
