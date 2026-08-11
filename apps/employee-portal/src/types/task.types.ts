/**
 * Task types — Employee Portal.
 */

export type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE" | "BLOCKED" | "CANCELLED";

export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export type TaskType =
  | "FOLLOW_UP"
  | "CALL"
  | "EMAIL"
  | "MEETING"
  | "DOCUMENT"
  | "REVIEW"
  | "ADMIN"
  | "OTHER";

export type RelatedEntityType =
  | "CUSTOMER"
  | "DISTRIBUTOR"
  | "LEAD"
  | "TICKET"
  | "ORDER"
  | "PRODUCT"
  | "NONE";

export interface RelatedEntity {
  type: RelatedEntityType;
  id: string;
  label?: string;
}

export interface TaskAssignee {
  id: string;
  name: string;
  avatarUrl?: string;
}

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
  createdAt?: string;
}

export interface TaskComment {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl?: string;
  body: string;
  createdAt: string;
}

export interface TimeLog {
  id: string;
  employeeId: string;
  employeeName: string;
  minutes: number;
  note?: string;
  loggedAt: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  type?: TaskType;
  dueDate?: string | null;
  startDate?: string | null;
  completedAt?: string | null;

  assignedById?: string | null;
  assignedByName?: string | null;
  assignedToId: string;
  assignedToName?: string;
  assignedToAvatarUrl?: string;

  department?: string;
  relatedEntity?: RelatedEntity | null;

  subtasks?: Subtask[];
  comments?: TaskComment[];
  timeLogs?: TimeLog[];
  totalMinutesLogged?: number;

  createdAt: string;
  updatedAt?: string;
}

export interface TaskFilters {
  status?: TaskStatus | "ALL";
  priority?: TaskPriority | "ALL";
  assigneeId?: string | "ME" | "ALL";
  dueDate?: "ALL" | "TODAY" | "OVERDUE" | "THIS_WEEK";
  search?: string;
  view?: "TABLE" | "KANBAN";
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  priority: TaskPriority;
  status?: TaskStatus;
  type?: TaskType;
  dueDate?: string | null;
  assignedToId: string;
  relatedEntity?: RelatedEntity | null;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string | null;
  assignedToId?: string;
}
