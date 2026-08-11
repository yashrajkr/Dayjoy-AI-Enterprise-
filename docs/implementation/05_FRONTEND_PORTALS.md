# Frontend Implementation Guide - Step 5

> **Use this file with AI to generate frontend code**

---

## How to Use This File

**Copy this file and use with AI (Cursor, Copilot, Claude, etc.)**

**Prompt**: "Generate React/Next.js frontend code for the Dayjoy Enterprise AI Platform based on the following specifications"

---

## 1. Customer Portal

**Purpose**: Customer self-service portal

**Pages**:
- `/login` - Login
- `/register` - Registration
- `/dashboard` - Dashboard
- `/orders` - Order list
- `/orders/:id` - Order details
- `/profile` - Profile
- `/products` - Products
- `/support` - Support

**AI Prompt**:
```
Generate a Customer Portal with Next.js 14+ and TypeScript:
- App Router with server components
- Authentication with JWT
- Dashboard with order stats, recent orders
- Order list with filtering, sorting, pagination
- Order details with tracking
- Profile management with form validation
- Product catalog with search, filtering
- Support page with FAQ and AI chat
- Responsive design (mobile-first)
- Tailwind CSS styling
- React Hook Form for forms
- Zod validation
- TanStack Query for data fetching
- Unit and E2E tests

Tech Stack: Next.js 14, TypeScript, Tailwind CSS, shadcn/ui
```

---

## 2. Distributor Portal

**Purpose**: Distributor management portal

**Pages**:
- `/login` - Login
- `/dashboard` - Dashboard with sales stats, commissions
- `/orders` - Distributor orders
- `/commissions` - Commission overview
- `/commissions/history` - Commission history
- `/customers` - Customer list
- `/products` - Product catalog
- `/reports` - Reports
- `/profile` - Profile

**AI Prompt**:
```
Generate a Distributor Portal with Next.js 14+ and TypeScript:
- App Router with server components
- Authentication with JWT
- Dashboard with sales chart, commission overview
- Order management with tracking
- Commission history with filtering
- Customer list with analytics
- Product catalog with availability
- Report generation with export (CSV, PDF)
- Profile management with business info
- Responsive design
- Tailwind CSS styling
- Recharts for charts
- TanStack Table for data tables
- Unit and E2E tests

Tech Stack: Next.js 14, TypeScript, Tailwind CSS, shadcn/ui
```

---

## 3. Employee Portal

**Purpose**: Internal employee tools

**Pages**:
- `/login` - Login
- `/dashboard` - Dashboard with tasks, stats
- `/tasks` - Task list
- `/tasks/:id` - Task details
- `/customers` - Customer list
- `/customers/:id` - Customer details
- `/leads` - Lead list
- `/leads/:id` - Lead details
- `/orders` - Order management
- `/interactions` - Interaction history
- `/profile` - Profile

**AI Prompt**:
```
Generate an Employee Portal with Next.js 14+ and TypeScript:
- App Router with server components
- Authentication with JWT
- Dashboard with task overview, recent activity
- Task management (list, create, update, complete)
- Task board (Kanban view)
- Customer management with interaction timeline
- Lead management with conversion tracking
- Order management with approval workflow
- Interaction history with logging
- Profile management
- Responsive design
- Tailwind CSS styling
- React DnD for Kanban board
- Unit and E2E tests

Tech Stack: Next.js 14, TypeScript, Tailwind CSS, shadcn/ui
```

---

## 4. Admin Dashboard

**Purpose**: System administration

**Pages**:
- `/login` - Admin login
- `/dashboard` - System overview
- `/users` - User management
- `/roles` - Role management
- `/products` - Product management
- `/orders` - Order management
- `/customers` - Customer management
- `/distributors` - Distributor management
- `/ai/conversations` - AI conversations
- `/ai/analytics` - AI analytics
- `/rag/sources` - Knowledge sources
- `/rag/documents` - Documents
- `/analytics` - Analytics dashboard
- `/reports` - Reports
- `/settings` - System settings

**AI Prompt**:
```
Generate an Admin Dashboard with Next.js 14+ and TypeScript:
- App Router with server components
- Authentication with JWT
- Role-based access control (RBAC)
- Dashboard with system stats, charts
- User management (CRUD, role assignment)
- Role management with permission tree
- Product management with image upload
- Order management with status workflow
- Customer and distributor management
- AI conversation viewer with details
- AI analytics dashboard
- RAG document management
- Analytics dashboard with custom reports
- System settings
- Audit log viewer
- Responsive design
- Tailwind CSS styling
- Recharts for charts
- TanStack Table for data tables
- Unit and E2E tests

Tech Stack: Next.js 14, TypeScript, Tailwind CSS, shadcn/ui
```

---

## 5. Website AI Chat Widget

**Purpose**: Website chat widget

**Components**:
- ChatWindow
- MessageList
- MessageInput
- MessageBubble
- TypingIndicator
- QuickReplies
- FileUpload
- EmojiPicker

**AI Prompt**:
```
Generate a Website AI Chat Widget with React and TypeScript:
- Chat window component (draggable, resizable)
- Message list with virtual scrolling
- Message input with auto-resize
- Message bubble component
- Typing indicator
- Quick replies component
- File upload component
- Emoji picker
- Chat header with avatar
- Chat button (floating)
- Real-time messaging (Socket.io)
- Read receipts
- Typing indicators
- Chat history
- Proactive chat
- Customizable theme (position, colors, welcome message)
- Responsive design
- Tailwind CSS styling
- Unit and E2E tests

Tech Stack: React, TypeScript, Tailwind CSS, Socket.io
```

**Widget Installation**:
```html
<script src="https://cdn.dayjoy.com/chat-widget/latest.js"></script>
<script>
  DayjoyChat.init({
    apiKey: 'your-api-key',
    position: 'bottom-right',
    theme: 'light',
    primaryColor: '#007bff',
    welcomeMessage: 'Hi! How can I help you?'
  });
</script>
```

---

## 6. UI Component Library

**Purpose**: Reusable UI components

**Components**:
- Button, Input, Select, Checkbox, Radio, Switch, Textarea
- Container, Grid, Flex, Stack, Divider
- Table, Card, List, Avatar, Badge, Tag, Tooltip, Popover
- Alert, Toast, Modal, Dialog, Drawer, Progress, Spinner, Skeleton
- Form, FormField, FormLabel, FormError

**AI Prompt**:
```
Generate a @dayjoy/ui Component Library with React and TypeScript:
- All basic components (Button, Input, Select, Checkbox, etc.)
- All layout components (Container, Grid, Flex, Stack, etc.)
- All data display components (Table, Card, List, Avatar, Badge, etc.)
- All feedback components (Alert, Toast, Modal, Dialog, Drawer, etc.)
- All form components (Form, FormField, FormLabel, FormError)
- Tailwind CSS styling
- TypeScript types
- Accessibility (WCAG 2.1 AA)
- Storybook stories
- Unit tests
- Dark mode support
- Responsive design

Tech Stack: React, TypeScript, Tailwind CSS, Storybook
```

---

## 7. State Management

**Purpose**: Global and local state management

**Stores**:
- Auth Store
- User Store
- App Store
- Feature-specific stores

**AI Prompt**:
```
Generate State Management with Zustand:
- AuthStore (user, isAuthenticated, login, logout, refresh)
- UserStore (profile, fetchProfile, updateProfile)
- AppStore (theme, locale, settings)
- Feature-specific stores (orders, products, etc.)
- TypeScript types
- Persistence to localStorage
- DevTools integration
- Unit tests

Tech Stack: Zustand, TypeScript
```

---

## 8. API Integration

**Purpose**: API client and services

**Services**:
- Auth Service
- User Service
- CRM Service
- Product Service
- Order Service
- AI Service
- Notification Service

**AI Prompt**:
```
Generate API Integration with Axios and TanStack Query:
- Axios instance with interceptors (auth, error handling)
- Auth service (login, logout, register, refresh)
- User service (getProfile, updateProfile)
- CRM service (customers, distributors, leads)
- Product service (products, categories)
- Order service (orders, order items)
- AI service (chat, conversations)
- Notification service
- React Query hooks for all services
- Error handling
- Loading states
- Caching
- Unit and integration tests

Tech Stack: Axios, TanStack Query, TypeScript
```

---

## 9. Authentication Flow

**Purpose**: User authentication and authorization

**Flow**:
1. Login form
2. Validate credentials
3. Store token
4. Redirect to dashboard
5. Load user profile
6. Protected routes

**AI Prompt**:
```
Generate Authentication Flow:
- Login page with form validation
- Registration page with form validation
- Forgot password page
- Reset password page
- Protected route wrapper
- Auth context/hook
- Token storage (localStorage with encryption)
- Token refresh logic
- Logout functionality
- Role-based access control
- Unit and E2E tests

Tech Stack: React, Next.js, TypeScript, JWT
```

---

## Frontend AI Prompt Template

```
You are a senior frontend engineer. Generate production-ready React/Next.js code for the Dayjoy Enterprise AI Platform.

Requirements:
1. Use React 18+ / Next.js 14+ with App Router
2. Use TypeScript with strict typing
3. Use Tailwind CSS for styling
4. Use shadcn/ui components
5. Follow accessibility standards (WCAG 2.1 AA)
6. Include responsive design (mobile-first)
7. Include form validation (React Hook Form + Zod)
8. Include data fetching (TanStack Query)
9. Include error handling
10. Include loading states
11. Include unit tests (Jest + React Testing Library)
12. Include E2E tests (Playwright)
13. Follow security best practices
14. Include documentation

Generate code for: [paste component/page definition from above]
```

---

**File Ready for AI Code Generation**