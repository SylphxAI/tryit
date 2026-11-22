import type { APIEvent } from '@solidjs/start/server'
import { GET as handleGET, POST as handlePOST } from '@/server/api/identity/sessions'
import { apiMethodResponses } from '@/server/api-methods'

export const GET = ({ request }: APIEvent) => handleGET(request)
export const POST = ({ request }: APIEvent) => handlePOST(request)

const methods = apiMethodResponses(['GET', 'POST'])
export const OPTIONS = methods.options
export const PUT = methods.notAllowed
export const PATCH = methods.notAllowed
export const DELETE = methods.notAllowed
