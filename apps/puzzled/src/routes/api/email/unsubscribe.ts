import type { APIEvent } from '@solidjs/start/server'
import { GET as handleGET, POST as handlePOST } from '@/server/api/email/unsubscribe'
import { apiMethodResponses } from '@/server/api-methods'

export const POST = ({ request }: APIEvent) => handlePOST(request)
export const GET = ({ request }: APIEvent) => handleGET(request)

const methods = apiMethodResponses(['GET', 'POST'])
export const OPTIONS = methods.options
export const PUT = methods.notAllowed
export const PATCH = methods.notAllowed
export const DELETE = methods.notAllowed
