-- Migration: 002_business_tables
-- Dayjoy Enterprise AI Platform - Business Tables
-- PostgreSQL 15+

-- 1. Create CustomerType Enum

DO $$ BEGIN
    CREATE TYPE "CustomerType" AS ENUM ('INDIVIDUAL', 'BUSINESS');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create DistributorStatus Enum

DO $$ BEGIN
    CREATE TYPE "DistributorStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'DELETED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. Create ProductStatus Enum

DO $$ BEGIN
    CREATE TYPE "ProductStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DELETED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 4. Create LeadStatus Enum

DO $$ BEGIN
    CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'LOST', 'DELETED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 5. Create InteractionType Enum

DO $$ BEGIN
    CREATE TYPE "InteractionType" AS ENUM ('CALL', 'EMAIL', 'MEETING', 'MESSAGE', 'NOTE', 'OTHER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 5b. Create OrderStatus Enum (must exist BEFORE orders table creation)

DO $$ BEGIN
    CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 6. Create Product Categories Table

CREATE TABLE IF NOT EXISTS product_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES product_categories(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(tenant_id, slug)
);

-- Comments
COMMENT ON TABLE product_categories IS 'Product categorization (hierarchical)';
COMMENT ON COLUMN product_categories.parent_id IS 'Parent category (for hierarchy)';

-- Indexes
CREATE INDEX IF NOT EXISTS product_categories_tenant_id_idx ON product_categories(tenant_id);
CREATE INDEX IF NOT EXISTS product_categories_parent_id_idx ON product_categories(parent_id);
CREATE INDEX IF NOT EXISTS product_categories_slug_idx ON product_categories(slug);

-- 7. Create Products Table

CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category_id UUID REFERENCES product_categories(id) ON DELETE SET NULL,
    sku VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price NUMERIC(12,2) NOT NULL,
    cost NUMERIC(12,2),
    currency VARCHAR(10) DEFAULT 'USD' NOT NULL,
    inventory_count INTEGER DEFAULT 0,
    attributes JSONB,
    images JSONB,
    status "ProductStatus" DEFAULT 'ACTIVE' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT products_price_non_negative CHECK (price >= 0),
    CONSTRAINT products_cost_non_negative CHECK (cost IS NULL OR cost >= 0),
    
    UNIQUE(tenant_id, sku)
);

-- Comments
COMMENT ON TABLE products IS 'Product catalog';
COMMENT ON COLUMN products.sku IS 'Stock keeping unit (unique per tenant)';
COMMENT ON COLUMN products.price IS 'Base price';
COMMENT ON COLUMN products.cost IS 'Cost price';
COMMENT ON COLUMN products.inventory_count IS 'Available inventory count';

-- Indexes
CREATE INDEX IF NOT EXISTS products_tenant_id_idx ON products(tenant_id);
CREATE INDEX IF NOT EXISTS products_category_id_idx ON products(category_id);
CREATE INDEX IF NOT EXISTS products_status_idx ON products(status);
CREATE INDEX IF NOT EXISTS products_name_idx ON products USING GIN (to_tsvector('english', name));

-- 8. Create Customers Table

CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    customer_type "CustomerType" DEFAULT 'INDIVIDUAL' NOT NULL,
    company_name VARCHAR(255),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    email VARCHAR(255),
    phone VARCHAR(50),
    address JSONB,
    status VARCHAR(20) DEFAULT 'active' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT customers_email_format CHECK (email IS NULL OR email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Comments
COMMENT ON TABLE customers IS 'Customer master data';
COMMENT ON COLUMN customers.customer_type IS 'Customer type: INDIVIDUAL or BUSINESS';
COMMENT ON COLUMN customers.status IS 'Customer status: active, inactive, deleted';

-- Indexes
CREATE INDEX IF NOT EXISTS customers_tenant_id_idx ON customers(tenant_id);
CREATE INDEX IF NOT EXISTS customers_user_id_idx ON customers(user_id);
CREATE INDEX IF NOT EXISTS customers_email_idx ON customers(email);
CREATE INDEX IF NOT EXISTS customers_phone_idx ON customers(phone);
CREATE INDEX IF NOT EXISTS customers_status_idx ON customers(status);

-- 9. Create Distributors Table

CREATE TABLE IF NOT EXISTS distributors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    distributor_code VARCHAR(100) NOT NULL,
    company_name VARCHAR(255) NOT NULL,
    contact_person VARCHAR(255),
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    address JSONB,
    commission_rate NUMERIC(5,2),
    status "DistributorStatus" DEFAULT 'ACTIVE' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT distributors_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT distributors_commission_rate CHECK (commission_rate IS NULL OR (commission_rate >= 0 AND commission_rate <= 100)),
    
    UNIQUE(distributor_code),
    UNIQUE(email)
);

-- Comments
COMMENT ON TABLE distributors IS 'Distributor master data';
COMMENT ON COLUMN distributors.distributor_code IS 'Distributor code (unique)';
COMMENT ON COLUMN distributors.commission_rate IS 'Commission percentage (0-100)';

-- Indexes
CREATE INDEX IF NOT EXISTS distributors_tenant_id_idx ON distributors(tenant_id);
CREATE INDEX IF NOT EXISTS distributors_user_id_idx ON distributors(user_id);
CREATE INDEX IF NOT EXISTS distributors_status_idx ON distributors(status);

-- 10. Create Orders Table

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    distributor_id UUID REFERENCES distributors(id) ON DELETE SET NULL,
    order_number VARCHAR(100) NOT NULL,
    status "OrderStatus" DEFAULT 'PENDING' NOT NULL,
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
    tax NUMERIC(12,2) DEFAULT 0,
    shipping NUMERIC(12,2) DEFAULT 0,
    discount NUMERIC(12,2) DEFAULT 0,
    total NUMERIC(12,2) NOT NULL DEFAULT 0,
    currency VARCHAR(10) DEFAULT 'USD' NOT NULL,
    shipping_address JSONB,
    billing_address JSONB,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT orders_subtotal_non_negative CHECK (subtotal >= 0),
    CONSTRAINT orders_tax_non_negative CHECK (tax >= 0),
    CONSTRAINT orders_shipping_non_negative CHECK (shipping >= 0),
    CONSTRAINT orders_discount_non_negative CHECK (discount >= 0),
    CONSTRAINT orders_total_non_negative CHECK (total >= 0),
    
    UNIQUE(order_number)
);

-- Comments
COMMENT ON TABLE orders IS 'Order management';
COMMENT ON COLUMN orders.status IS 'Order status lifecycle';
COMMENT ON COLUMN orders.total IS 'Order total amount';

-- Indexes
CREATE INDEX IF NOT EXISTS orders_tenant_id_idx ON orders(tenant_id);
CREATE INDEX IF NOT EXISTS orders_customer_id_idx ON orders(customer_id);
CREATE INDEX IF NOT EXISTS orders_distributor_id_idx ON orders(distributor_id);
CREATE INDEX IF NOT EXISTS orders_order_number_idx ON orders(order_number);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(status);
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders(created_at);

-- 11. Create Order Items Table

CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
    tax NUMERIC(12,2) DEFAULT 0,
    discount NUMERIC(12,2) DEFAULT 0,
    total NUMERIC(12,2) NOT NULL DEFAULT 0,
    
    CONSTRAINT order_items_quantity_positive CHECK (quantity > 0),
    CONSTRAINT order_items_unit_price_non_negative CHECK (unit_price >= 0)
);

-- Comments
COMMENT ON TABLE order_items IS 'Order line items';
COMMENT ON COLUMN order_items.quantity IS 'Quantity of product in order';
COMMENT ON COLUMN order_items.unit_price IS 'Unit price at time of order';

-- Indexes
CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON order_items(order_id);
CREATE INDEX IF NOT EXISTS order_items_product_id_idx ON order_items(product_id);

-- 12. Create Leads Table

CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    source_id UUID,
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    email VARCHAR(255),
    phone VARCHAR(50),
    company VARCHAR(255),
    status "LeadStatus" DEFAULT 'NEW' NOT NULL,
    score INTEGER DEFAULT 0,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT leads_email_format CHECK (email IS NULL OR email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Comments
COMMENT ON TABLE leads IS 'Lead management';
COMMENT ON COLUMN leads.status IS 'Lead status lifecycle';
COMMENT ON COLUMN leads.score IS 'Lead score';

-- Indexes
CREATE INDEX IF NOT EXISTS leads_tenant_id_idx ON leads(tenant_id);
CREATE INDEX IF NOT EXISTS leads_source_id_idx ON leads(source_id);
CREATE INDEX IF NOT EXISTS leads_assigned_to_idx ON leads(assigned_to);
CREATE INDEX IF NOT EXISTS leads_email_idx ON leads(email);
CREATE INDEX IF NOT EXISTS leads_status_idx ON leads(status);
CREATE INDEX IF NOT EXISTS leads_created_at_idx ON leads(created_at);

-- 13. Create Interactions Table

CREATE TABLE IF NOT EXISTS interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    type "InteractionType" NOT NULL,
    subject VARCHAR(255),
    description TEXT,
    outcome VARCHAR(255),
    follow_up_required BOOLEAN DEFAULT false NOT NULL,
    follow_up_date TIMESTAMP WITH TIME ZONE,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Comments
COMMENT ON TABLE interactions IS 'Customer interaction tracking';
COMMENT ON COLUMN interactions.type IS 'Interaction type: CALL, EMAIL, MEETING, etc.';

-- Indexes
CREATE INDEX IF NOT EXISTS interactions_tenant_id_idx ON interactions(tenant_id);
CREATE INDEX IF NOT EXISTS interactions_customer_id_idx ON interactions(customer_id);
CREATE INDEX IF NOT EXISTS interactions_lead_id_idx ON interactions(lead_id);
CREATE INDEX IF NOT EXISTS interactions_user_id_idx ON interactions(user_id);
CREATE INDEX IF NOT EXISTS interactions_type_idx ON interactions(type);
CREATE INDEX IF NOT EXISTS interactions_created_at_idx ON interactions(created_at);

-- 14. Create Follow Ups Table

CREATE TABLE IF NOT EXISTS follow_ups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    interaction_id UUID REFERENCES interactions(id) ON DELETE SET NULL,
    assigned_to UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    type "InteractionType" NOT NULL,
    subject VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'pending' NOT NULL,
    due_date TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Comments
COMMENT ON TABLE follow_ups IS 'Follow-up task management';
COMMENT ON COLUMN follow_ups.status IS 'Follow-up status: pending, completed, cancelled';

-- Indexes
CREATE INDEX IF NOT EXISTS follow_ups_tenant_id_idx ON follow_ups(tenant_id);
CREATE INDEX IF NOT EXISTS follow_ups_assigned_to_idx ON follow_ups(assigned_to);
CREATE INDEX IF NOT EXISTS follow_ups_customer_id_idx ON follow_ups(customer_id);
CREATE INDEX IF NOT EXISTS follow_ups_lead_id_idx ON follow_ups(lead_id);
CREATE INDEX IF NOT EXISTS follow_ups_type_idx ON follow_ups(type);
CREATE INDEX IF NOT EXISTS follow_ups_status_idx ON follow_ups(status);
CREATE INDEX IF NOT EXISTS follow_ups_due_date_idx ON follow_ups(due_date);

-- 15. Enable Row-Level Security (RLS)

ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE distributors ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_ups ENABLE ROW LEVEL SECURITY;

-- 16. Create RLS Policies

-- Product Categories
CREATE POLICY product_categories_tenant_isolation ON product_categories
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- Products
CREATE POLICY products_tenant_isolation ON products
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- Customers
CREATE POLICY customers_tenant_isolation ON customers
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- Distributors
CREATE POLICY distributors_tenant_isolation ON distributors
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- Orders
CREATE POLICY orders_tenant_isolation ON orders
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- Order Items
CREATE POLICY order_items_tenant_isolation ON order_items
    FOR ALL
    USING (
        order_id IN (
            SELECT id FROM orders WHERE tenant_id = current_setting('app.current_tenant', true)::uuid
        )
    );

-- Leads
CREATE POLICY leads_tenant_isolation ON leads
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- Interactions
CREATE POLICY interactions_tenant_isolation ON interactions
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- Follow Ups
CREATE POLICY follow_ups_tenant_isolation ON follow_ups
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- 17. Apply updated_at Trigger to Business Tables

CREATE TRIGGER update_product_categories_updated_at
    BEFORE UPDATE ON product_categories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customers_updated_at
    BEFORE UPDATE ON customers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_distributors_updated_at
    BEFORE UPDATE ON distributors
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leads_updated_at
    BEFORE UPDATE ON leads
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_follow_ups_updated_at
    BEFORE UPDATE ON follow_ups
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 18. Verification Queries (Optional)

-- SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN (
--     'product_categories', 'products', 'customers', 'distributors', 'orders', 
--     'order_items', 'leads', 'interactions', 'follow_ups'
-- ) ORDER BY tablename;

-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND 
--     tablename IN ('product_categories', 'products', 'customers', 'distributors', 'orders', 'order_items', 'leads', 'interactions', 'follow_ups');

-- SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' AND 
--     tablename IN ('product_categories', 'products', 'customers', 'distributors', 'orders', 'order_items', 'leads', 'interactions', 'follow_ups')
-- ORDER BY tablename, policyname;

-- End of migration 002_business_tables
