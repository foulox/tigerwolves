import { SignIn } from '@clerk/nextjs'

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-lg">
        <SignIn />
      </div>
    </div>
  )
}
