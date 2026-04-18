import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center p-4 text-center">
      <h2 className="mb-4 text-3xl font-bold text-text-primary">404 - Not Found</h2>
      <p className="mb-6 text-text-secondary">The page you are looking for does not exist.</p>
      <Link
        href="/"
        className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 transition-colors"
      >
        Return Home
      </Link>
    </div>
  )
}
