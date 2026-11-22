import { apiMethodResponses } from '@/server/api-methods'

export { GET } from '@/server/health-response'

const methods = apiMethodResponses(['GET'])
export const OPTIONS = methods.options
export const POST = methods.notAllowed
export const PUT = methods.notAllowed
export const PATCH = methods.notAllowed
export const DELETE = methods.notAllowed
