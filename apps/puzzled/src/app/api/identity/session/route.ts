import { currentUser } from '@/lib/identity/server'

export async function GET() {
	const user = await currentUser()
	return Response.json({ user })
}
