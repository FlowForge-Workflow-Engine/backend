# Row-Level Security (RLS) Implementation Strategy

## 🎯 **Overview**

This document outlines the complete Row-Level Security (RLS) implementation for our multi-tenant workflow engine application. RLS provides database-level tenant isolation that automatically filters data based on tenant context, ensuring security even when application code has bugs or omissions.

## 🏗️ **Architecture Components**

### **1. Database Migration**
- **File**: [`src/modules/database/migrations/016_create_rls_policies.ts`](src/modules/database/migrations/016_create_rls_policies.ts)
- **Purpose**: Creates RLS policies for all tenant-scoped tables
- **Coverage**: 20+ tables across Auth, Tenant, Workflow, Audit, and Notification modules

### **2. RLS Context Service**
- **File**: [`src/modules/database/services/rls-context.service.ts`](src/modules/database/services/rls-context.service.ts)
- **Purpose**: Manages PostgreSQL session context for RLS policies
- **Key Methods**:
  - `setTenantContext(tenantId)`: Sets PostgreSQL session variable
  - `clearTenantContext()`: Clears tenant context (fail-secure)
  - `getCurrentTenantContext()`: Gets current tenant context
  - `withTenantContext()`: Executes function with specific tenant context
  - `bypassRls()`: Admin operations that need cross-tenant access

### **3. Database Context Interceptor**
- **File**: [`src/modules/database/interceptors/database-context.interceptor.ts`](src/modules/database/interceptors/database-context.interceptor.ts)
- **Purpose**: Global interceptor that sets tenant context before database queries
- **Execution**: Runs after JWT authentication, before any database operations

### **4. Integration Points**
- **Database Module**: [`src/modules/database/database.module.ts`](src/modules/database/database.module.ts)
- **App Module**: [`src/app.module.ts`](src/app.module.ts) - Global interceptor registration

## 🔄 **Request Flow**

### **Step-by-Step Execution**

```
1. HTTP Request → 2. Guards → 3. Interceptors → 4. Controller → 5. Service → 6. Repository → 7. Database
```

#### **1. HTTP Request**
```http
GET /api/users/profile
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### **2. Security Guards Pipeline**
```typescript
// Execution order in app.module.ts
1. ThrottlerGuard        // Rate limiting
2. JwtAuthGuard         // Validates JWT, populates req.user
3. TenantIsolationGuard // Validates tenant access
4. RolesGuard          // Validates user permissions
```

After `JwtAuthGuard`:
```typescript
req.user = {
  userId: "123e4567-e89b-12d3-a456-426614174000",
  tenantId: "550e8400-e29b-41d4-a716-446655440000", // ← Critical for RLS
  email: "user@tenant1.com",
  roles: ["user"]
}
```

#### **3. Interceptor Pipeline**
```typescript
// Execution order in app.module.ts
1. ClassSerializerInterceptor
2. LoggingInterceptor
3. TenantContextInterceptor      // Sets req.tenantId
4. DatabaseContextInterceptor    // ← Sets PostgreSQL context
```

#### **4. DatabaseContextInterceptor Execution**
```typescript
// Extract tenant ID from JWT
const tenantId = request.user?.tenantId;

if (tenantId) {
  // Set PostgreSQL session context
  await this.rlsContextService.setTenantContext(tenantId);
  // Executes: SELECT set_config('app.tenant_id', tenantId, false)
}
```

#### **5. Controller & Service**
```typescript
// In UserController
@Get('/profile')
async getProfile(@CurrentUser() user: IJwtPayload) {
  return this.userService.findById(user.userId); // No tenantId needed!
}

// In UserService  
async findById(userId: string): Promise<User> {
  // Simple query - RLS handles tenant filtering
  return this.userRepository.findOne({ where: { id: userId } });
}
```

#### **6. Database Magic**
```sql
-- Developer writes:
SELECT * FROM users WHERE id = '123e4567-e89b-12d3-a456-426614174000';

-- PostgreSQL RLS automatically transforms to:
SELECT * FROM users 
WHERE id = '123e4567-e89b-12d3-a456-426614174000' 
  AND tenant_id = (current_setting('app.tenant_id'))::uuid;
```

## 🛡️ **Security Scenarios**

### **Scenario A: Normal Operation**
```typescript
// User from Tenant A accesses their profile
// JWT: tenantId = "tenant-a-uuid"
// RLS context: "tenant-a-uuid"
// Query: SELECT * FROM users WHERE id = 'user-123'
// RLS adds: AND tenant_id = 'tenant-a-uuid'
// Result: ✅ Returns user data (if user belongs to tenant A)
```

### **Scenario B: Malicious Attempt**
```typescript
// Attacker tries to access different tenant's data
// JWT: tenantId = "tenant-a-uuid" 
// RLS context: "tenant-a-uuid"
// Malicious query: SELECT * FROM users WHERE id = 'user-from-tenant-b'
// RLS adds: AND tenant_id = 'tenant-a-uuid'
// Result: ❌ No data returned (user-from-tenant-b belongs to different tenant)
```

### **Scenario C: Developer Mistake**
```typescript
// Developer forgets tenant filtering
async getAllUsers() {
  return this.userRepository.find(); // Dangerous - no tenant filter!
}

// RLS saves the day:
// Actual execution: SELECT * FROM users WHERE tenant_id = 'current-tenant-uuid'
// Result: ✅ Only returns users from current tenant
```

### **Scenario D: SQL Injection**
```typescript
// Even if SQL injection bypasses application layer:
// Malicious input: "'; DROP TABLE users; --"
// RLS policies CANNOT be bypassed by SQL injection
// Result: ❌ Attack fails, data remains secure
```

## 🔧 **Manual tenantId Filtering + RLS**

### **Case 1: Correct tenantId (Matches RLS Context)**
```typescript
async findById(userId: string, tenantId: string): Promise<User> {
  return this.userRepository.findOne({ 
    where: { id: userId, tenantId: tenantId } 
  });
}
```

**Database execution:**
```sql
-- Manual + RLS filtering:
SELECT * FROM users 
WHERE id = '123e4567-e89b-12d3-a456-426614174000' 
  AND tenant_id = '550e8400-e29b-41d4-a716-446655440000'  -- Manual
  AND tenant_id = (current_setting('app.tenant_id'))::uuid; -- RLS

-- Result: ✅ Works fine (redundant but safe)
```

### **Case 2: Wrong tenantId (Security Violation)**
```typescript
async findById(userId: string, tenantId: string): Promise<User> {
  return this.userRepository.findOne({ 
    where: { id: userId, tenantId: "different-tenant-uuid" } 
  });
}
```

**Database execution:**
```sql
-- Creates impossible condition:
SELECT * FROM users 
WHERE id = '123e4567-e89b-12d3-a456-426614174000' 
  AND tenant_id = 'different-tenant-uuid'     -- Manual (wrong)
  AND tenant_id = 'correct-tenant-uuid';      -- RLS (correct)

-- Result: ❌ No data returned (RLS prevents data leak)
```

## 📋 **Implementation Patterns**

### **Pattern 1: Pure RLS (Recommended)**
```typescript
// Clean, simple, RLS-protected
async findById(userId: string): Promise<User> {
  return this.userRepository.findOne({ where: { id: userId } });
  // RLS automatically adds: AND tenant_id = current_tenant
}

// Benefits:
// ✅ Cleaner code
// ✅ Fewer parameters
// ✅ Better performance
// ✅ Less maintenance
```

### **Pattern 2: Hybrid Approach (Extra Paranoid)**
```typescript
// Manual + RLS for extra validation
async findById(userId: string, tenantId: string): Promise<User> {
  // Validate tenantId matches RLS context
  const currentContext = await this.rlsContextService.getCurrentTenantContext();
  if (tenantId !== currentContext) {
    throw new ForbiddenException('Tenant context mismatch');
  }
  
  return this.userRepository.findOne({ 
    where: { id: userId, tenantId } 
  });
}

// Benefits:
// ✅ Defense in depth
// ✅ Explicit validation
// ⚠️ More complex code
// ⚠️ Performance overhead
```

### **Pattern 3: Admin Operations**
```typescript
// Cross-tenant access for admin operations
async getAllTenantsUsers(): Promise<User[]> {
  return this.rlsContextService.bypassRls(async () => {
    return this.userRepository.find(); // Returns users from ALL tenants
  });
}

// Specific tenant access
async getUsersFromTenant(targetTenantId: string): Promise<User[]> {
  return this.rlsContextService.withTenantContext(targetTenantId, async () => {
    return this.userRepository.find(); // Returns users from target tenant
  });
}
```

## 🚀 **Protected Tables**

RLS policies are applied to all tenant-scoped tables:

### **Auth Module**
- `users`, `roles`, `user_roles`, `role_permissions`, `refresh_tokens`

### **Tenant Module**
- `tenant_settings`, `tenant_feature_flags`

### **Workflow Definition Module**
- `workflow_definitions`, `workflow_definition_versions`, `workflow_states`
- `workflow_transitions`, `transition_rules`, `instance_form_schemas`

### **Workflow Execution Module**
- `workflow_instances`, `we_user_shadows`

### **Audit Module**
- `audit_logs`

### **Notification Module**
- `notification_templates`, `notification_logs`, `webhook_configs`, `webhook_delivery_logs`

### **Rule Engine Module**
- `rule_templates`

**Note**: The `tenants` table has NO RLS (it IS the root entity).

## ⚡ **Performance Considerations**

### **Query Performance**
- RLS policies use indexed `tenant_id` columns
- PostgreSQL query planner optimizes RLS conditions
- Minimal performance impact for properly indexed tables

### **Connection Pooling**
- Context is cleared after each request
- Safe for connection reuse across different tenants
- No connection state pollution

### **Monitoring**
```typescript
// Enable RLS logging in development
const isDev = configService.get<string>("NODE_ENV") === "development";
// Logs all RLS policy evaluations for debugging
```

## 🔍 **Testing Strategy**

### **Unit Tests**
- Mock `RlsContextService` for service layer tests
- Test both with and without tenant context
- Verify error handling for missing context

### **Integration Tests**
- Test actual database queries with RLS enabled
- Verify tenant isolation across different scenarios
- Test admin bypass functionality

### **Security Tests**
- Attempt cross-tenant data access
- SQL injection attempts
- Context manipulation attempts

## 🚨 **Security Best Practices**

### **1. Fail-Secure Default**
```sql
-- FORCE ROW LEVEL SECURITY ensures:
-- If no context is set, ALL access is denied
ALTER TABLE users FORCE ROW LEVEL SECURITY;
```

### **2. Context Validation**
```typescript
// Always validate tenant context before sensitive operations
await this.rlsContextService.validateTenantContext();
```

### **3. Audit Logging**
```typescript
// Log all RLS context changes
this.logger.debug(`RLS context set: tenant_id = ${tenantId}`);
```

### **4. Admin Operations**
```typescript
// Explicit logging for RLS bypass
this.logger.warn("RLS bypass requested - ensure this is authorized");
```

## 🎯 **Key Benefits**

1. **Zero Code Changes**: Existing queries automatically become tenant-safe
2. **Fail-Safe Security**: If context isn't set, RLS denies ALL access
3. **SQL Injection Protection**: Even malicious SQL can't bypass tenant boundaries
4. **Developer-Friendly**: No need to remember tenant filtering in every query
5. **Audit-Ready**: All queries are automatically tenant-scoped at database level
6. **Performance**: Minimal overhead with proper indexing
7. **Maintainable**: Centralized security logic, less code to maintain

## 🔧 **Troubleshooting**

### **Common Issues**

#### **No Data Returned**
```typescript
// Check if tenant context is set
const context = await this.rlsContextService.getCurrentTenantContext();
console.log('Current tenant context:', context);
```

#### **Context Not Set**
```typescript
// Ensure DatabaseContextInterceptor is registered globally
// Check JWT payload contains tenantId
// Verify interceptor execution order
```

#### **Performance Issues**
```sql
-- Ensure tenant_id columns are indexed
CREATE INDEX CONCURRENTLY idx_users_tenant_id ON users(tenant_id);
```

## 📚 **References**

- [PostgreSQL Row Level Security Documentation](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [TypeORM Documentation](https://typeorm.io/)
- [NestJS Interceptors](https://docs.nestjs.com/interceptors)

---

**Implementation Status**: ✅ Complete and Production Ready

This RLS implementation provides enterprise-grade multi-tenant data isolation with minimal code changes and maximum security guarantees.