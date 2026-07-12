import { SignIn } from '@clerk/nextjs'

const demoEmail = process.env.NEXT_PUBLIC_DEMO_LEADER_EMAIL

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-lg">
        {demoEmail && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 text-center">
            Demo account: <strong className="font-semibold">{demoEmail}</strong>
          </div>
        )}
        <SignIn initialValues={demoEmail ? { emailAddress: demoEmail } : undefined} />
      </div>
    </div>
  )
}
