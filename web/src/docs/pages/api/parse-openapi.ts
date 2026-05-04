/* Flatten an OpenAPI schema into a sorted list of EndpointSummary objects.
 * Resolves $ref one level deep into request body schemas so the form
 * renderer doesn't have to deal with refs. */

import type {
  OpenApiOperation,
  OpenApiParameter,
  OpenApiRef,
  OpenApiSchema,
  OpenApiSchemaObject,
} from './openapi-types'
import { isRef } from './openapi-types'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

export interface EndpointSummary {
  method: HttpMethod
  path: string
  operationId: string
  summary: string
  description: string
  tags: string[]
  pathParams: ParamInfo[]
  queryParams: ParamInfo[]
  requestBody?: RequestBodyInfo
  requiresAuth: boolean
}

export interface ParamInfo {
  name: string
  required: boolean
  description: string
  schema?: OpenApiSchemaObject // resolved (no $ref)
}

export interface RequestBodyInfo {
  required: boolean
  description: string
  contentType: string // e.g. 'application/json'
  schema?: OpenApiSchemaObject // resolved one level
}

const METHODS: readonly HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']

function resolveRef(ref: OpenApiRef, schema: OpenApiSchema): OpenApiSchemaObject | undefined {
  // $ref looks like "#/components/schemas/UserCreate"
  const m = ref.$ref.match(/^#\/components\/schemas\/(.+)$/)
  if (!m) return undefined
  const name = m[1]
  const out = schema.components?.schemas?.[name]
  if (!out) return undefined
  // Recursively resolve $ref's inside properties one more level — keeps
  // the form renderer simple.
  return resolveProperties(out, schema)
}

function resolveProperties(obj: OpenApiSchemaObject, schema: OpenApiSchema): OpenApiSchemaObject {
  if (!obj.properties) return obj
  const newProps: Record<string, OpenApiSchemaObject> = {}
  for (const [k, v] of Object.entries(obj.properties)) {
    if (isRef(v)) {
      const resolved = resolveRef(v, schema)
      if (resolved) newProps[k] = resolved
      // else: leave it out — schema is malformed
    } else {
      newProps[k] = v
    }
  }
  return { ...obj, properties: newProps }
}

function resolveSchema(
  s: OpenApiSchemaObject | OpenApiRef | undefined,
  schema: OpenApiSchema,
): OpenApiSchemaObject | undefined {
  if (!s) return undefined
  if (isRef(s)) return resolveRef(s, schema)
  return resolveProperties(s, schema)
}

function paramFromOpenApi(p: OpenApiParameter, schema: OpenApiSchema): ParamInfo {
  return {
    name: p.name,
    required: p.required ?? false,
    description: p.description ?? '',
    schema: resolveSchema(p.schema, schema),
  }
}

function operationFromOpenApi(
  method: HttpMethod,
  path: string,
  op: OpenApiOperation,
  pathItemParams: OpenApiParameter[] | undefined,
  schema: OpenApiSchema,
): EndpointSummary {
  const allParams = [...(pathItemParams ?? []), ...(op.parameters ?? [])]
  const pathParams = allParams
    .filter((p) => p.in === 'path')
    .map((p) => paramFromOpenApi(p, schema))
  const queryParams = allParams
    .filter((p) => p.in === 'query')
    .map((p) => paramFromOpenApi(p, schema))

  let requestBody: RequestBodyInfo | undefined
  if (op.requestBody) {
    // Prefer application/json if present.
    const contentType =
      'application/json' in op.requestBody.content
        ? 'application/json'
        : (Object.keys(op.requestBody.content)[0] ?? 'application/json')
    const media = op.requestBody.content[contentType]
    requestBody = {
      required: op.requestBody.required ?? false,
      description: op.requestBody.description ?? '',
      contentType,
      schema: resolveSchema(media?.schema, schema),
    }
  }

  return {
    method,
    path,
    operationId: op.operationId ?? `${method.toLowerCase()}_${path.replace(/[/{}]/g, '_')}`,
    summary: op.summary ?? '',
    description: op.description ?? '',
    tags: op.tags ?? [],
    pathParams,
    queryParams,
    requestBody,
    requiresAuth: Array.isArray(op.security) && op.security.length > 0,
  }
}

export function parseOpenApi(schema: OpenApiSchema): EndpointSummary[] {
  const out: EndpointSummary[] = []
  for (const [path, item] of Object.entries(schema.paths)) {
    if (!item) continue
    for (const m of METHODS) {
      const op = item[m.toLowerCase() as Lowercase<HttpMethod>]
      if (op) out.push(operationFromOpenApi(m, path, op, item.parameters, schema))
    }
  }
  // Sort: first by tag, then by path, then by method.
  return out.sort((a, b) => {
    const tagA = a.tags[0] ?? ''
    const tagB = b.tags[0] ?? ''
    if (tagA !== tagB) return tagA.localeCompare(tagB)
    if (a.path !== b.path) return a.path.localeCompare(b.path)
    return a.method.localeCompare(b.method)
  })
}

export function endpointsByTag(
  endpoints: readonly EndpointSummary[],
): Record<string, EndpointSummary[]> {
  const out: Record<string, EndpointSummary[]> = {}
  for (const e of endpoints) {
    const tag = e.tags[0] ?? 'untagged'
    if (!out[tag]) out[tag] = []
    out[tag].push(e)
  }
  return out
}
