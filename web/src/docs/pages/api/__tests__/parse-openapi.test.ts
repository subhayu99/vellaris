import { describe, expect, it } from 'vitest'
import openapi from '../openapi.json'
import type { OpenApiSchema } from '../openapi-types'
import { endpointsByTag, parseOpenApi } from '../parse-openapi'

const schema = openapi as unknown as OpenApiSchema

describe('parseOpenApi against the real Vellaris OpenAPI', () => {
  const endpoints = parseOpenApi(schema)

  it('finds at least 5 endpoints', () => {
    expect(endpoints.length).toBeGreaterThanOrEqual(5)
  })

  it('each endpoint has method, path, operationId', () => {
    for (const e of endpoints) {
      expect(e.method).toMatch(/^(GET|POST|PUT|DELETE|PATCH)$/)
      expect(e.path).toMatch(/^\//)
      expect(e.operationId).toBeTruthy()
    }
  })

  it('has a /healthz endpoint with method GET', () => {
    const healthz = endpoints.find((e) => e.path === '/healthz')
    expect(healthz).toBeDefined()
    expect(healthz?.method).toBe('GET')
  })

  it('groups endpoints by tag', () => {
    const grouped = endpointsByTag(endpoints)
    expect(Object.keys(grouped).length).toBeGreaterThan(0)
  })

  it('resolves request body schemas (no $ref leaks)', () => {
    for (const e of endpoints) {
      if (e.requestBody?.schema) {
        expect((e.requestBody.schema as { $ref?: string }).$ref).toBeUndefined()
      }
    }
  })
})

describe('parseOpenApi with synthetic schemas', () => {
  it('handles a schema with no paths', () => {
    const empty: OpenApiSchema = {
      openapi: '3.0.0',
      info: { title: 'Empty', version: '0.0.1' },
      paths: {},
    }
    expect(parseOpenApi(empty)).toEqual([])
  })

  it('honors operationId from the spec', () => {
    const s: OpenApiSchema = {
      openapi: '3.0.0',
      info: { title: 'T', version: '0.0.1' },
      paths: {
        '/foo': {
          get: {
            operationId: 'getFoo',
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    }
    const eps = parseOpenApi(s)
    expect(eps[0].operationId).toBe('getFoo')
  })
})
