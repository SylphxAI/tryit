import { requestUser } from '@/lib/identity/request-identity'

export async function GET(request: Request) {
	const user = await requestUser(request)
	return Response.json({ user }, { headers: { 'cache-control': 'no-store' } })
}
