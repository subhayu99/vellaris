/* Minimal OpenAPI 3.x types — only what we render. */

export interface OpenApiSchema {
  openapi: string
  info: { title: string; version: string }
  paths: Record<string, OpenApiPathItem>
  components?: {
    schemas?: Record<string, OpenApiSchemaObject>
    securitySchemes?: Record<string, unknown>
  }
}

export interface OpenApiPathItem {
  get?: OpenApiOperation
  post?: OpenApiOperation
  put?: OpenApiOperation
  delete?: OpenApiOperation
  patch?: OpenApiOperation
  parameters?: OpenApiParameter[]
}

export interface OpenApiOperation {
  operationId?: string
  summary?: string
  description?: string
  tags?: string[]
  parameters?: OpenApiParameter[]
  requestBody?: OpenApiRequestBody
  responses: Record<string, OpenApiResponse>
  security?: Array<Record<string, string[]>>
}

export interface OpenApiParameter {
  name: string
  in: 'path' | 'query' | 'header' | 'cookie'
  required?: boolean
  description?: string
  schema?: OpenApiSchemaObject | OpenApiRef
}

export interface OpenApiRequestBody {
  required?: boolean
  description?: string
  content: Record<string, OpenApiMediaType>
}

export interface OpenApiMediaType {
  schema?: OpenApiSchemaObject | OpenApiRef
}

export interface OpenApiResponse {
  description?: string
  content?: Record<string, OpenApiMediaType>
}

export interface OpenApiRef {
  $ref: string
}

export interface OpenApiSchemaObject {
  type?: 'string' | 'integer' | 'number' | 'boolean' | 'array' | 'object' | 'null'
  format?: string
  description?: string
  enum?: unknown[]
  required?: string[]
  properties?: Record<string, OpenApiSchemaObject | OpenApiRef>
  items?: OpenApiSchemaObject | OpenApiRef
  default?: unknown
  example?: unknown
  examples?: unknown[]
  nullable?: boolean
  title?: string
  // for $ref support
  $ref?: string
  // anyOf / oneOf / allOf occasionally appear in FastAPI outputs
  anyOf?: Array<OpenApiSchemaObject | OpenApiRef>
  oneOf?: Array<OpenApiSchemaObject | OpenApiRef>
  allOf?: Array<OpenApiSchemaObject | OpenApiRef>
}

export function isRef(x: unknown): x is OpenApiRef {
  return typeof x === 'object' && x !== null && '$ref' in x
}
