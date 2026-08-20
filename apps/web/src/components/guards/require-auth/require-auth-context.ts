import type { User } from "@pantry/shared";
import { createContext } from "react";

export const RequireAuthContext = createContext<User | null>(null);
