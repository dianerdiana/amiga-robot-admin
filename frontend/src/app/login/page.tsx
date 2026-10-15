import { Metadata } from "next";
import LoginForm from "@/components/LoginForm";

export const metadata: Metadata = {
  title: "Masuk - AMIGA Robot Admin",
  description: "Pengelolaan invoice dan voucher internal AMIGA.",
};

export default function LoginPage() {
  return <LoginForm />;
}
