export type AdminUser = Readonly<{
  id: string;
  email: string;
  displayName: string | null;
  permissions: readonly string[];
}>;
export type CsrfConfig = Readonly<{ cookieName: string; headerName: string }>;
