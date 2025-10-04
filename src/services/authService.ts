/**
 * Secure Authentication Service
 * Handles user authentication with proper security measures
 */

import type { User } from '@/App'

export interface StoredUser {
  id: string
  username: string
  email: string
  passwordHash: string
  contributionCount: number
  joinDate: string
  createdAt: string
  lastLoginAt?: string
  isActive: boolean
}

export class AuthService {
  private static readonly USERS_KEY = 'auth-users'
  private static readonly SESSION_KEY = 'auth-session'
  private static readonly SALT = 'parkflow-secure-2024'

  /**
   * Generate a cryptographically secure user ID
   */
  static generateSecureId(): string {
    const array = new Uint8Array(16)
    crypto.getRandomValues(array)
    return 'user-' + Array.from(array)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  }

  /**
   * Hash password with salt using Web Crypto API
   */
  static async hashPassword(password: string, email: string): Promise<string> {
    const encoder = new TextEncoder()
    // Use email as additional salt for per-user uniqueness
    const saltedPassword = password + this.SALT + email.toLowerCase()
    const data = encoder.encode(saltedPassword)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  }

  /**
   * Validate email format
   */
  static validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email.trim())
  }

  /**
   * Validate password strength
   */
  static validatePassword(password: string): { valid: boolean; message?: string } {
    if (password.length < 8) {
      return { valid: false, message: 'Password must be at least 8 characters long' }
    }
    if (!/(?=.*[a-z])/.test(password)) {
      return { valid: false, message: 'Password must contain at least one lowercase letter' }
    }
    if (!/(?=.*[A-Z])/.test(password)) {
      return { valid: false, message: 'Password must contain at least one uppercase letter' }
    }
    if (!/(?=.*\d)/.test(password)) {
      return { valid: false, message: 'Password must contain at least one number' }
    }
    if (!/(?=.*[!@#$%^&*(),.?":{}|<>])/.test(password)) {
      return { valid: false, message: 'Password must contain at least one special character' }
    }
    return { valid: true }
  }

  /**
   * Sanitize user input to prevent injection attacks
   */
  static sanitizeInput(input: string): string {
    return input.trim().replace(/[<>'"&]/g, '')
  }

  /**
   * Get all users (for admin purposes - in production this would be server-side)
   */
  static async getAllUsers(): Promise<Record<string, StoredUser>> {
    try {
      return await window.spark.kv.get<Record<string, StoredUser>>(this.USERS_KEY) || {}
    } catch (error) {
      console.error('Failed to get users:', error)
      return {}
    }
  }

  /**
   * Store user data securely
   */
  static async storeUser(user: StoredUser): Promise<void> {
    const users = await this.getAllUsers()
    const userKey = user.email.toLowerCase()
    users[userKey] = user
    await window.spark.kv.set(this.USERS_KEY, users)
  }

  /**
   * Create a new user account
   */
  static async createUser(
    username: string,
    email: string,
    password: string
  ): Promise<{ success: boolean; user?: User; error?: string }> {
    try {
      // Sanitize inputs
      username = this.sanitizeInput(username)
      email = this.sanitizeInput(email.toLowerCase())

      // Validate inputs
      if (!this.validateEmail(email)) {
        return { success: false, error: 'Please enter a valid email address' }
      }

      if (username.length < 3) {
        return { success: false, error: 'Username must be at least 3 characters long' }
      }

      const passwordValidation = this.validatePassword(password)
      if (!passwordValidation.valid) {
        return { success: false, error: passwordValidation.message }
      }

      // Check if user already exists
      const existingUsers = await this.getAllUsers()
      if (existingUsers[email]) {
        return { success: false, error: 'An account with this email already exists' }
      }

      // Check if username is taken
      const usernameExists = Object.values(existingUsers).some(
        user => user.username.toLowerCase() === username.toLowerCase()
      )
      if (usernameExists) {
        return { success: false, error: 'This username is already taken' }
      }

      // Create secure user record
      const userId = this.generateSecureId()
      const hashedPassword = await this.hashPassword(password, email)
      
      const storedUser: StoredUser = {
        id: userId,
        username,
        email,
        passwordHash: hashedPassword,
        contributionCount: 0,
        joinDate: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        isActive: true
      }

      await this.storeUser(storedUser)

      // Return public user data (without password hash)
      const publicUser: User = {
        id: userId,
        username,
        email,
        contributionCount: 0,
        joinDate: storedUser.joinDate
      }

      return { success: true, user: publicUser }
    } catch (error) {
      console.error('Failed to create user:', error)
      return { success: false, error: 'Account creation failed. Please try again.' }
    }
  }

  /**
   * Authenticate user login
   */
  static async authenticateUser(
    email: string,
    password: string
  ): Promise<{ success: boolean; user?: User; error?: string }> {
    try {
      // Sanitize inputs
      email = this.sanitizeInput(email.toLowerCase())

      // Validate inputs
      if (!this.validateEmail(email)) {
        return { success: false, error: 'Please enter a valid email address' }
      }

      if (!password) {
        return { success: false, error: 'Password is required' }
      }

      // Get user from storage
      const existingUsers = await this.getAllUsers()
      const storedUser = existingUsers[email]

      if (!storedUser) {
        return { success: false, error: 'No account found with this email address' }
      }

      if (!storedUser.isActive) {
        return { success: false, error: 'This account has been deactivated' }
      }

      // Verify password
      const hashedPassword = await this.hashPassword(password, email)
      if (storedUser.passwordHash !== hashedPassword) {
        return { success: false, error: 'Invalid password' }
      }

      // Update last login time
      storedUser.lastLoginAt = new Date().toISOString()
      await this.storeUser(storedUser)

      // Return public user data
      const publicUser: User = {
        id: storedUser.id,
        username: storedUser.username,
        email: storedUser.email,
        contributionCount: storedUser.contributionCount,
        joinDate: storedUser.joinDate
      }

      return { success: true, user: publicUser }
    } catch (error) {
      console.error('Authentication failed:', error)
      return { success: false, error: 'Sign in failed. Please try again.' }
    }
  }

  /**
   * Update user contribution count
   */
  static async updateContributionCount(userId: string): Promise<void> {
    try {
      const users = await this.getAllUsers()
      const userEntry = Object.entries(users).find(([, user]) => user.id === userId)
      
      if (userEntry) {
        const [email, user] = userEntry
        user.contributionCount = (user.contributionCount || 0) + 1
        users[email] = user
        await window.spark.kv.set(this.USERS_KEY, users)
      }
    } catch (error) {
      console.error('Failed to update contribution count:', error)
    }
  }

  /**
   * Rate limiting for login attempts (basic implementation)
   */
  static async checkRateLimit(email: string): Promise<boolean> {
    const key = `rate-limit-${email.toLowerCase()}`
    const attempts = await window.spark.kv.get<{ count: number; lastAttempt: number }>(key)
    
    if (!attempts) return true
    
    const now = Date.now()
    const timeSinceLastAttempt = now - attempts.lastAttempt
    
    // Reset if more than 15 minutes have passed
    if (timeSinceLastAttempt > 15 * 60 * 1000) {
      await window.spark.kv.delete(key)
      return true
    }
    
    // Allow up to 5 attempts
    return attempts.count < 5
  }

  /**
   * Record failed login attempt
   */
  static async recordFailedAttempt(email: string): Promise<void> {
    const key = `rate-limit-${email.toLowerCase()}`
    const attempts = await window.spark.kv.get<{ count: number; lastAttempt: number }>(key) || { count: 0, lastAttempt: 0 }
    
    attempts.count++
    attempts.lastAttempt = Date.now()
    
    await window.spark.kv.set(key, attempts)
  }
}