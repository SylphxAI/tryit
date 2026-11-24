import type { APIEvent } from '@solidjs/start/server'
import { handleOAuth } from '@/lib/identity/oauth-server'
import { apiMethodResponses } from '@/server/api-methods'

export const POST = ({ request }: APIEvent) => handleOAuth(request)

const methods = apiMethodResponses(['POST'])
export const OPTIONS = methods.options
export const GET = methods.notAllowed
export const HEAD = methods.notAllowed
export const PUT = methods.notAllowed
export const PATCH = methods.notAllowed
export const DELETE = methods.notAllowed
