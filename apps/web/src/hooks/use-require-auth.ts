import { RequireAuthContext } from "@/components/guards/require-auth/require-auth-context";
import { useContext } from "react";

export default function useRequireAuth() {
  const user = useContext(RequireAuthContext);
  if (!user) throw new Error("useAuthedUser must be used inside RequireAuth");
  return user; // User, non User | null
}
