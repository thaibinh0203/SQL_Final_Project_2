export type Role = "Employer" | "Candidate" | "Admin";

export type AnyRecord = Record<string, string | number | boolean | null | undefined>;

export interface AuthUser {
  account_id: number;
  email: string;
  role: Role;
  employer_id: number | null;
  candidate_id: number | null;
  display_name: string;
}

export interface AuthSession {
  access_token: string;
  token_type: string;
  user: AuthUser;
}

export interface ApiList<T = AnyRecord> {
  count: number;
  items: T[];
}

export interface ApiKeyedList<T = AnyRecord> {
  count: number;
  items: Record<string, T>;
}

export interface ApiMessage {
  Message?: string;
  message?: string;
  [key: string]: unknown;
}
