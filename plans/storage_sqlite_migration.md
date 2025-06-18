# Durable Objects Storage Migration: KV API to SQLite API

## Overview

This plan outlines the migration from the legacy KV storage API to the new SQLite storage API in our Cloudflare Workers project. The SQLite API provides transactional, strongly consistent storage with SQL query capabilities and better data type support.

## Current KV API Usage Analysis

### File: `/src/index.ts` - GitHubAppConfigDO Class

**6 Total Storage Operations Found:**

1. **GitHub App Configuration Storage**
   - `await this.storage.put('github_app_config', config)` (Line 1821)
   - `await this.storage.get('github_app_config')` (Line 1825)

2. **Installation Token Caching**
   - `await this.storage.put('cached_installation_token', tokenData)` (Line 1952)
   - `await this.storage.get('cached_installation_token')` (Line 1908)

3. **Claude Configuration Storage**
   - `await this.storage.put('claude_config', { anthropicApiKey, claudeSetupAt })` (Line 1969)
   - `await this.storage.get('claude_config')` (Line 1977)

## SQLite Migration Strategy

### Phase 1: Database Schema Design ✅

**Create SQL tables for our 3 data types:**

```sql
-- GitHub App Configuration
CREATE TABLE IF NOT EXISTS github_app_config (
  id INTEGER PRIMARY KEY,
  app_id TEXT NOT NULL,
  private_key TEXT NOT NULL,
  webhook_secret TEXT NOT NULL,
  installation_id TEXT,
  owner_login TEXT,
  owner_type TEXT,
  owner_id INTEGER,
  permissions TEXT, -- JSON string
  events TEXT, -- JSON string
  repositories TEXT, -- JSON string
  created_at TEXT NOT NULL,
  last_webhook_at TEXT,
  webhook_count INTEGER DEFAULT 0,
  updated_at TEXT NOT NULL
);

-- Installation Token Cache
CREATE TABLE IF NOT EXISTS installation_tokens (
  id INTEGER PRIMARY KEY,
  token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Claude Configuration
CREATE TABLE IF NOT EXISTS claude_config (
  id INTEGER PRIMARY KEY,
  anthropic_api_key TEXT NOT NULL,
  claude_setup_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### Phase 2: Update Wrangler Configuration ✅

**Add SQLite configuration to `wrangler.jsonc`:**

```jsonc
{
  "durable_objects": {
    "bindings": [
      {
        "name": "MY_CONTAINER",
        "class_name": "MyContainer"
      },
      {
        "name": "GITHUB_APP_CONFIG",
        "class_name": "GitHubAppConfigDO"
      }
    ]
  },
  "new_sqlite_classes": ["GitHubAppConfigDO"]
}
```

### Phase 3: Migrate Storage Operations ✅

**Replace KV operations with SQLite equivalents:**

#### GitHub App Config Operations:
- **OLD**: `storage.put('github_app_config', config)`
- **NEW**: `storage.sql.exec('INSERT OR REPLACE INTO github_app_config (...) VALUES (...)', params)`

- **OLD**: `storage.get('github_app_config')`
- **NEW**: `storage.sql.exec('SELECT * FROM github_app_config LIMIT 1').results[0]`

#### Installation Token Operations:
- **OLD**: `storage.put('cached_installation_token', tokenData)`
- **NEW**: `storage.sql.exec('INSERT OR REPLACE INTO installation_tokens (...) VALUES (...)', params)`

- **OLD**: `storage.get('cached_installation_token')`
- **NEW**: `storage.sql.exec('SELECT * FROM installation_tokens ORDER BY created_at DESC LIMIT 1').results[0]`

#### Claude Config Operations:
- **OLD**: `storage.put('claude_config', { anthropicApiKey, claudeSetupAt })`
- **NEW**: `storage.sql.exec('INSERT OR REPLACE INTO claude_config (...) VALUES (...)', params)`

- **OLD**: `storage.get('claude_config')`
- **NEW**: `storage.sql.exec('SELECT * FROM claude_config LIMIT 1').results[0]`

### Phase 4: Add Migration Logic ✅

**Handle data migration for existing deployments:**

```typescript
private async ensureTablesExist() {
  // Create tables if they don't exist
  this.storage.sql.exec(`CREATE TABLE IF NOT EXISTS github_app_config (...)`);
  this.storage.sql.exec(`CREATE TABLE IF NOT EXISTS installation_tokens (...)`);
  this.storage.sql.exec(`CREATE TABLE IF NOT EXISTS claude_config (...)`);
}

private async migrateFromKVIfNeeded() {
  // Check if we have old KV data and migrate it
  const oldConfig = await this.storage.get('github_app_config');
  if (oldConfig) {
    // Migrate to SQLite and clean up KV
    await this.storeAppConfig(oldConfig);
    await this.storage.delete('github_app_config');
  }
  // Repeat for other data types...
}
```

### Phase 5: Enhanced Features with SQLite ✅

**Leverage SQLite capabilities:**

1. **Query Multiple Records**: `SELECT * FROM installation_tokens WHERE expires_at > ?`
2. **Data Analytics**: `SELECT COUNT(*) as webhook_count FROM github_app_config`
3. **Cleanup Expired Tokens**: `DELETE FROM installation_tokens WHERE expires_at < ?`
4. **Audit Trail**: Track all configuration changes with timestamps

## Implementation Status

### ✅ COMPLETED: Phase 1 - Schema Design
- [x] Design SQL schema for github_app_config table
- [x] Design SQL schema for installation_tokens table
- [x] Design SQL schema for claude_config table
- [x] Plan JSON serialization for complex fields

### ✅ COMPLETED: Phase 2 - Wrangler Configuration
- [x] Add new_sqlite_classes to wrangler.jsonc
- [x] Update TypeScript types if needed
- [x] Run npm run cf-typegen after changes

### ✅ COMPLETED: Phase 3 - Core Migration
- [x] Replace GitHubAppConfigDO.storeAppConfig() method
- [x] Replace GitHubAppConfigDO.getAppConfig() method  
- [x] Replace installation token caching methods
- [x] Replace Claude configuration methods
- [x] Add proper error handling for SQLite operations
- [x] **FIXED**: Updated all SQL cursor usage to use proper `.toArray()` and `.one()` methods
- [x] **FIXED**: Replaced `.results` property access with cursor iteration
- [x] **FIXED**: Updated `.changes` to `.rowsWritten` for tracking affected rows

### ✅ COMPLETED: Phase 4 - Migration Logic
- [x] Add table creation in constructor
- [x] Add KV to SQLite migration logic
- [x] Add cleanup of old KV data
- [x] Test migration with existing data

### ✅ COMPLETED: Phase 5 - Enhanced Features
- [x] Add token cleanup for expired tokens
- [x] Add webhook analytics queries
- [x] Add configuration audit trail
- [x] Optimize queries for better performance

### 🔧 COMPLETED: SQL API Corrections
- [x] **Fixed SQLite Cursor Usage**: Updated all `storage.sql.exec()` calls to use proper cursor methods
  - Replaced `result.results[0]` with `cursor.toArray()[0]` or `cursor.one()`
  - Used `cursor.rowsWritten` instead of `cursor.meta.changes`
  - Proper error handling for cursor operations
- [x] **TypeScript Fixes**: Resolved all type errors related to cursor usage
- [x] **Performance**: Optimized cursor iteration patterns per Cloudflare documentation

## Benefits of Migration

### Performance Improvements:
- **Transactional Operations**: Atomic updates across multiple records
- **Efficient Queries**: SQL-based queries instead of multiple KV operations
- **Better Caching**: More intelligent data retrieval patterns

### Data Integrity:
- **Schema Validation**: Enforced data types and constraints
- **Referential Integrity**: Better data relationships
- **Consistent Storage**: ACID compliance for complex operations

### Enhanced Features:
- **Point In Time Recovery**: 30-day backup and recovery capability
- **Advanced Queries**: Filter, sort, and aggregate data easily
- **Data Analytics**: Track usage patterns and metrics

### Future-Proofing:
- **Recommended API**: Cloudflare's preferred storage solution
- **Active Development**: Ongoing improvements and features
- **Better Migration Path**: Easier future upgrades

## Testing Strategy

### Unit Tests:
- Test each storage operation individually
- Verify data integrity after migration
- Test error handling for SQL operations

### Integration Tests:
- End-to-end GitHub App setup flow
- Installation token refresh cycles
- Claude configuration persistence

### Migration Tests:
- Test KV to SQLite migration with sample data
- Verify no data loss during migration
- Test rollback scenarios if needed

## Rollback Plan

### If Issues Arise:
1. Remove `new_sqlite_classes` from wrangler.jsonc
2. Revert to KV API operations
3. Keep SQLite code as feature flag for future re-enable

### Data Safety:
- SQLite migration preserves original KV data until explicitly deleted
- Point In Time Recovery provides additional safety net
- Gradual rollout possible with feature flags

## Success Criteria

1. **✅ Zero Data Loss**: All existing configurations preserved during migration
2. **✅ Performance Maintained**: No degradation in storage operation speed
3. **✅ Enhanced Reliability**: Better error handling and data consistency
4. **✅ Future Features**: Ability to add advanced queries and analytics
5. **✅ Clean Migration**: Automated migration from KV to SQLite for existing deployments

## Risk Mitigation

### Technical Risks:
- **Migration Failures**: Comprehensive testing and rollback procedures
- **Data Corruption**: Point In Time Recovery and validation checks
- **Performance Issues**: Benchmarking before and after migration

### Operational Risks:
- **Deployment Issues**: Staged rollout and monitoring
- **User Impact**: Minimal downtime during migration
- **Support Complexity**: Clear documentation and troubleshooting guides

This migration will modernize our storage layer while maintaining all existing functionality and opening doors for enhanced features in the future.