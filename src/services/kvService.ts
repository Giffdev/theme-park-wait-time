/**
 * Safe KV Service - Validates keys and handles errors before making KV operations
 * This prevents "storage key error" issues by ensuring all keys are valid
 */
export class KVService {
  /**
   * Validates a KV key to ensure it's safe to use
   */
  static validateKey(key: string): { isValid: boolean; error?: string; cleanKey?: string } {
    if (!key || typeof key !== 'string') {
      return { isValid: false, error: 'Key must be a non-empty string' }
    }
    
    const trimmedKey = key.trim()
    
    if (trimmedKey.length === 0) {
      return { isValid: false, error: 'Key cannot be empty or whitespace only' }
    }
    
    if (trimmedKey.length < 3) {
      return { isValid: false, error: 'Key must be at least 3 characters long' }
    }
    
    if (trimmedKey.length > 100) {
      return { isValid: false, error: 'Key is too long (max 100 characters)' }
    }
    
    // Check for invalid characters
    const invalidChars = /[^a-zA-Z0-9\-_:.]/
    if (invalidChars.test(trimmedKey)) {
      return { isValid: false, error: 'Key contains invalid characters. Only alphanumeric, hyphens, underscores, colons, and periods are allowed' }
    }
    
    // Additional safety checks
    if (trimmedKey.startsWith('-') || trimmedKey.endsWith('-')) {
      return { isValid: false, error: 'Key cannot start or end with a hyphen' }
    }
    
    if (trimmedKey.includes('--') || trimmedKey.includes('__')) {
      return { isValid: false, error: 'Key cannot contain consecutive hyphens or underscores' }
    }
    
    return { isValid: true, cleanKey: trimmedKey }
  }
  
  /**
   * Safe KV get operation with key validation
   */
  static async get<T>(key: string): Promise<T | undefined> {
    if (!window.spark?.kv) {
      throw new Error('KV storage is not available')
    }
    
    const validation = this.validateKey(key)
    if (!validation.isValid) {
      throw new Error(`Invalid KV key: ${validation.error}`)
    }
    
    try {
      return await window.spark.kv.get<T>(validation.cleanKey!)
    } catch (error) {
      console.error('❌ KV get failed:', { key: validation.cleanKey, error })
      throw new Error(`Failed to retrieve data: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
  
  /**
   * Safe KV set operation with key validation
   */
  static async set<T>(key: string, value: T): Promise<void> {
    if (!window.spark?.kv) {
      throw new Error('KV storage is not available')
    }
    
    const validation = this.validateKey(key)
    if (!validation.isValid) {
      throw new Error(`Invalid KV key: ${validation.error}`)
    }
    
    // Validate value can be serialized
    try {
      const serialized = JSON.stringify(value)
      if (serialized.length > 1000000) { // ~1MB limit
        throw new Error('Data is too large to store (max ~1MB)')
      }
    } catch (serializationError) {
      throw new Error('Data cannot be serialized for storage')
    }
    
    try {
      await window.spark.kv.set(validation.cleanKey!, value)
    } catch (error) {
      console.error('❌ KV set failed:', { key: validation.cleanKey, error })
      throw new Error(`Failed to save data: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
  
  /**
   * Safe KV delete operation with key validation
   */
  static async delete(key: string): Promise<void> {
    if (!window.spark?.kv) {
      throw new Error('KV storage is not available')
    }
    
    const validation = this.validateKey(key)
    if (!validation.isValid) {
      throw new Error(`Invalid KV key: ${validation.error}`)
    }
    
    try {
      await window.spark.kv.delete(validation.cleanKey!)
    } catch (error) {
      console.error('❌ KV delete failed:', { key: validation.cleanKey, error })
      throw new Error(`Failed to delete data: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
  
  /**
   * Safe KV keys operation
   */
  static async keys(): Promise<string[]> {
    if (!window.spark?.kv) {
      throw new Error('KV storage is not available')
    }
    
    try {
      return await window.spark.kv.keys()
    } catch (error) {
      console.error('❌ KV keys failed:', error)
      throw new Error(`Failed to list keys: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
  
  /**
   * Test KV connection and basic operations
   */
  static async test(): Promise<boolean> {
    try {
      const testKey = `kvtest-${Date.now()}`
      const testValue = { test: true, timestamp: Date.now() }
      
      // Test set
      await this.set(testKey, testValue)
      
      // Test get
      const retrieved = await this.get<{ test: boolean; timestamp: number }>(testKey)
      
      // Test delete
      await this.delete(testKey)
      
      // Validate the test worked
      return retrieved?.test === true
      
    } catch (error) {
      console.error('❌ KV test failed:', error)
      return false
    }
  }
  
  /**
   * Generate a safe user-based key
   */
  static generateUserKey(userId: string, suffix: string): string {
    if (!userId || typeof userId !== 'string') {
      throw new Error('User ID must be a non-empty string')
    }
    
    // Extract the core part of the user ID (skip "user-" prefix if present)
    let coreId = userId.startsWith('user-') ? userId.substring(5) : userId
    
    // Clean the core ID and take first 15 chars to prevent overly long keys
    coreId = coreId.replace(/[^a-zA-Z0-9\-_]/g, '').substring(0, 15)
    
    if (coreId.length === 0) {
      throw new Error('User ID contains no valid characters')
    }
    
    if (coreId.length < 3) {
      throw new Error('User ID is too short after cleaning')
    }
    
    // Clean the suffix
    const cleanSuffix = suffix.trim().replace(/[^a-zA-Z0-9\-_]/g, '')
    
    if (cleanSuffix.length === 0) {
      throw new Error('Suffix contains no valid characters')
    }
    
    const key = `user-${coreId}-${cleanSuffix}`
    
    // Validate the generated key
    const validation = this.validateKey(key)
    if (!validation.isValid) {
      throw new Error(`Generated key is invalid: ${validation.error}`)
    }
    
    return validation.cleanKey!
  }
}