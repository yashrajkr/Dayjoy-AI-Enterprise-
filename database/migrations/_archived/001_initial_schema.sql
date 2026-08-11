-- Migration: 001_initial_schema
-- Dayjoy Enterprise AI Platform - Core Tables
-- PostgreSQL 15+

-- 1. Create Enums

DO $$ BEGIN
    CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'DELETED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create Tenants Table

CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    status "TenantStatus" DEFAULT 'ACTIVE' NOT NULL,
    settings JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add comments
COMMENT ON TABLE tenants IS 'Multi-tenant organization isolation';
COMMENT ON COLUMN tenants.id IS 'Tenant identifier';
COMMENT ON COLUMN tenants.name IS 'Tenant name';
COMMENT ON COLUMN tenants.slug IS 'URL-friendly identifier';
COMMENT ON COLUMN tenants.status IS 'Tenant status: ACTIVE, SUSPENDED, DELETED';
COMMENT ON COLUMN tenants.settings IS 'Tenant configuration settings';

-- Create indexes
CREATE INDEX IF NOT EXISTS tenants_slug_idx ON tenants(slug);
CREATE INDEX IF NOT EXISTS tenants_status_idx ON tenants(status);

-- 3. Create Users Table

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255),
    phone VARCHAR(50),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    status "UserStatus" DEFAULT 'ACTIVE' NOT NULL,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT users_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Add comments
COMMENT ON TABLE users IS 'User account management';
COMMENT ON COLUMN users.id IS 'User identifier';
COMMENT ON COLUMN users.tenant_id IS 'Tenant reference';
COMMENT ON COLUMN users.email IS 'Email address (unique)';
COMMENT ON COLUMN users.password_hash IS 'Password hash (bcrypt)';
COMMENT ON COLUMN users.status IS 'User status: ACTIVE, INACTIVE, SUSPENDED, DELETED';

-- Create indexes
CREATE INDEX IF NOT EXISTS users_tenant_id_idx ON users(tenant_id);
CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);
CREATE INDEX IF NOT EXISTS users_status_idx ON users(status);
CREATE INDEX IF NOT EXISTS users_tenant_email_idx ON users(tenant_id, email);

-- 4. Create User Sessions Table

CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add comments
COMMENT ON TABLE user_sessions IS 'User session management';
COMMENT ON COLUMN user_sessions.token_hash IS 'Session token hash';
COMMENT ON COLUMN user_sessions.expires_at IS 'Session expiration timestamp';

-- Create indexes
CREATE INDEX IF NOT EXISTS user_sessions_user_id_idx ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS user_sessions_tenant_id_idx ON user_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS user_sessions_token_hash_idx ON user_sessions(token_hash);
CREATE INDEX IF NOT EXISTS user_sessions_expires_at_idx ON user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS user_sessions_created_at_idx ON user_sessions(created_at);

-- 5. Create Roles Table

CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_system BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(tenant_id, name)
);

-- Add comments
COMMENT ON TABLE roles IS 'Role definitions for RBAC';
COMMENT ON COLUMN roles.name IS 'Role name (unique per tenant)';
COMMENT ON COLUMN roles.is_system IS 'System role flag (cannot be modified)';

-- Create indexes
CREATE INDEX IF NOT EXISTS roles_tenant_id_idx ON roles(tenant_id);
CREATE INDEX IF NOT EXISTS roles_tenant_name_idx ON roles(tenant_id, name);
CREATE INDEX IF NOT EXISTS roles_is_system_idx ON roles(is_system);

-- 6. Create Permissions Table

CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource VARCHAR(255) NOT NULL,
    action VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(resource, action)
);

-- Add comments
COMMENT ON TABLE permissions IS 'Permission definitions';
COMMENT ON COLUMN permissions.resource IS 'Resource type (e.g., users, orders, products)';
COMMENT ON COLUMN permissions.action IS 'Action (e.g., create, read, update, delete)';

-- Create indexes
CREATE INDEX IF NOT EXISTS permissions_resource_idx ON permissions(resource);
CREATE INDEX IF NOT EXISTS permissions_resource_action_idx ON permissions(resource, action);

-- 7. Create Role Permissions Table

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (role_id, permission_id)
);

-- Add comments
COMMENT ON TABLE role_permissions IS 'Role-permission mapping (many-to-many)';

-- Create indexes
CREATE INDEX IF NOT EXISTS role_permissions_role_id_idx ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS role_permissions_permission_id_idx ON role_permissions(permission_id);

-- 8. Create User Roles Table

CREATE TABLE IF NOT EXISTS user_roles (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES users(id),
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE,
    
    PRIMARY KEY (user_id, role_id)
);

-- Add comments
COMMENT ON TABLE user_roles IS 'User-role assignment (many-to-many)';

-- Create indexes
CREATE INDEX IF NOT EXISTS user_roles_user_id_idx ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS user_roles_role_id_idx ON user_roles(role_id);
CREATE INDEX IF NOT EXISTS user_roles_tenant_id_idx ON user_roles(tenant_id);

-- 9. Enable Row-Level Security (RLS)

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- 10. Create RLS Policies

-- Tenants: Users can only see their own tenant
CREATE POLICY tenant_isolation ON tenants
    FOR ALL
    USING (id = current_setting('app.current_tenant', true)::uuid);

-- Users: Users can only see users in their tenant
CREATE POLICY user_isolation ON users
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- User Sessions: Users can only see their own sessions
CREATE POLICY session_isolation ON user_sessions
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- Roles: Users can only see roles in their tenant
CREATE POLICY role_isolation ON roles
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- Permissions: All users can read permissions
CREATE POLICY permissions_read ON permissions
    FOR SELECT
    USING (true);

-- Role Permissions: Users can only see role permissions in their tenant
CREATE POLICY role_permission_isolation ON role_permissions
    FOR ALL
    USING (
        role_id IN (
            SELECT id FROM roles WHERE tenant_id = current_setting('app.current_tenant', true)::uuid
        )
    );

-- User Roles: Users can only see user roles in their tenant
CREATE POLICY user_role_isolation ON user_roles
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- 11. Create updated_at Trigger Function

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 12. Apply updated_at Triggers

CREATE TRIGGER update_tenants_updated_at
    BEFORE UPDATE ON tenants
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_roles_updated_at
    BEFORE UPDATE ON roles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 13. Create Indexes for Soft Deletes (if needed)

CREATE INDEX IF NOT EXISTS users_status_deleted_idx ON users(status) WHERE status = 'DELETED';
CREATE INDEX IF NOT EXISTS roles_is_system_true_idx ON roles(is_system) WHERE is_system = true;

-- 14. Grant Permissions

-- Application role (adjust as needed)
GRANT ALL ON ALL TABLES IN SCHEMA public TO dayjoy_app;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO dayjoy_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO dayjoy_app;

-- Read-only role for reporting
GRANT SELECT ON ALL TABLES IN SCHEMA public TO dayjoy_readonly;

-- 15. Insert Default Permissions

INSERT INTO permissions (resource, action, description) VALUES
    ('users', 'create', 'Create users'),
    ('users', 'read', 'Read users'),
    ('users', 'update', 'Update users'),
    ('users', 'delete', 'Delete users'),
    ('roles', 'create', 'Create roles'),
    ('roles', 'read', 'Read roles'),
    ('roles', 'update', 'Update roles'),
    ('roles', 'delete', 'Delete roles'),
    ('permissions', 'read', 'Read permissions'),
    ('tenants', 'read', 'Read tenants'),
    ('tenants', 'update', 'Update tenants')
ON CONFLICT (resource, action) DO NOTHING;

-- 16. Verification Queries (Optional)

-- Verify tables created
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

-- Verify indexes created
-- SELECT indexname, tablename FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename, indexname;

-- Verify RLS enabled
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = true;

-- Verify policies created
-- SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename;

-- End of migration