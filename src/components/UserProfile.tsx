import type { User } from '@/App'

interface UserProfileProps {
  user: User
}

export function UserProfile({ user }: UserProfileProps) {
  return (
    <div>
      <h2>{user.username}</h2>
      <p>{user.email}</p>
    </div>
  )
}