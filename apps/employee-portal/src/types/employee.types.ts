/**
 * Employee / Department / Role types — Employee Portal.
 */

export type EmployeeRole =
  | "SUPER_ADMIN"
  | "ADMIN"
  | "MANAGER"
  | "AGENT"
  | "EMPLOYEE"
  | "SUPPORT"
  | "SALES";

export type EmployeeStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED" | "ON_LEAVE";

export type Department =
  | "SALES"
  | "SUPPORT"
  | "MARKETING"
  | "OPERATIONS"
  | "FINANCE"
  | "HR"
  | "PRODUCT"
  | "ENGINEERING"
  | "LOGISTICS";

export interface Employee {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName?: string;
  phone?: string;
  avatarUrl?: string;
  role: EmployeeRole;
  department?: Department;
  jobTitle?: string;
  status: EmployeeStatus;
  reportingManagerId?: string | null;
  reportingManagerName?: string | null;
  tenantId?: string;
  permissions?: string[];
  lastLoginAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/** Authenticated session returned by `POST /api/auth/login`. */
export interface AuthSession {
  user: Employee;
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
}

/** Lightweight current-user profile returned by `GET /api/users/me`. */
export interface CurrentUser extends Employee {
  permissions: string[];
}
