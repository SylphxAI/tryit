import type { APIEvent } from '@solidjs/start/server'
import { GET as handleGET } from '@/server/api/identity/session'
import { apiMethodResponses } from '@/server/api-methods'

export const GET = ({ request }: APIEvent) => handleGET(request)

const methods = apiMethodResponses(['GET'])
export const OPTIONS = methods.options
export const POST = methods.notAllowed
export const PUT = methods.notAllowed
export const PATCH = methods.notAllowed
export const DELETE = methods.notAllowed
