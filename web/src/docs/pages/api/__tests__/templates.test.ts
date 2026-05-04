import { describe, expect, it } from 'vitest'
import type { EndpointSummary } from '../parse-openapi'
import type { ApiBuilderState } from '../state'
import { defaultApiBuilderState } from '../state'
import {
  bodyTemplateFor,
  generateApiSnippet,
  generateCurlSnippet,
  generateJsSnippet,
  generatePythonSnippet,
} from '../templates'

// ---------------------------------------------------------------------------
// Synthetic fixtures — no dependency on the real OpenAPI schema.
// ---------------------------------------------------------------------------

const healthEndpoint: EndpointSummary = {
  method: 'GET',
  path: '/health',
  operationId: 'healthCheck',
  summary: 'Health check',
  description: '',
  tags: ['system'],
  pathParams: [],
  queryParams: [],
  requestBody: undefined,
  requiresAuth: false,
}

const createUserEndpoint: EndpointSummary = {
  method: 'POST',
  path: '/users',
  operationId: 'createUser',
  summary: 'Create user',
  description: '',
  tags: ['users'],
  pathParams: [],
  queryParams: [],
  requestBody: {
    required: true,
    description: '',
    contentType: 'application/json',
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        email: { type: 'string', format: 'email' },
      },
    },
  },
  requiresAuth: true,
}

const getUserEndpoint: EndpointSummary = {
  method: 'GET',
  path: '/users/{id}',
  operationId: 'getUser',
  summary: 'Get user by ID',
  description: '',
  tags: ['users'],
  pathParams: [{ name: 'id', required: true, description: '' }],
  queryParams: [],
  requestBody: undefined,
  requiresAuth: true,
}

const searchEndpoint: EndpointSummary = {
  method: 'GET',
  path: '/search',
  operationId: 'search',
  summary: 'Search',
  description: '',
  tags: ['search'],
  pathParams: [],
  queryParams: [
    { name: 'q', required: true, description: '' },
    { name: 'limit', required: false, description: '' },
  ],
  requestBody: undefined,
  requiresAuth: false,
}

function makeState(overrides: Partial<ApiBuilderState> = {}): ApiBuilderState {
  return {
    ...defaultApiBuilderState,
    serverUrl: 'https://server.example.com',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// curl tests
// ---------------------------------------------------------------------------

describe('generateCurlSnippet', () => {
  it('basic GET produces correct curl command', () => {
    const snippet = generateCurlSnippet(healthEndpoint, makeState())
    expect(snippet).toContain("curl -X GET 'https://server.example.com/health'")
  })

  it('POST with body includes Content-Type header and -d flag', () => {
    const state = makeState({
      body: '{"name":"Alice","email":"alice@example.com"}',
      authToken: 'tok123',
    })
    const snippet = generateCurlSnippet(createUserEndpoint, state)
    expect(snippet).toContain("-H 'Content-Type: application/json'")
    expect(snippet).toContain("-d '")
    expect(snippet).toContain('Alice')
  })

  it('auth-required endpoint without authToken uses placeholder', () => {
    const snippet = generateCurlSnippet(createUserEndpoint, makeState())
    expect(snippet).toContain('Bearer <YOUR_SESSION_TOKEN>')
  })

  it('auth-required endpoint with authToken uses actual token', () => {
    const state = makeState({ authToken: 'my-real-token' })
    const snippet = generateCurlSnippet(createUserEndpoint, state)
    expect(snippet).toContain('Bearer my-real-token')
    expect(snippet).not.toContain('<YOUR_SESSION_TOKEN>')
  })

  it('non-auth endpoint without authToken omits Authorization header', () => {
    const snippet = generateCurlSnippet(healthEndpoint, makeState())
    expect(snippet).not.toContain('Authorization')
  })

  it('path param substitution replaces {id} with state value', () => {
    const state = makeState({ pathParams: { id: 'user-42' } })
    const snippet = generateCurlSnippet(getUserEndpoint, state)
    expect(snippet).toContain('/users/user-42')
    expect(snippet).not.toContain('{id}')
  })

  it('missing path param uses <id> placeholder', () => {
    const snippet = generateCurlSnippet(getUserEndpoint, makeState())
    expect(snippet).toContain('%3Cid%3E') // URL-encoded <id>
  })

  it('filled query params appear in URL', () => {
    const state = makeState({ queryParams: { q: 'hello', limit: '10' } })
    const snippet = generateCurlSnippet(searchEndpoint, state)
    expect(snippet).toContain('q=hello')
    expect(snippet).toContain('limit=10')
  })

  it('empty query params are omitted from URL', () => {
    const state = makeState({ queryParams: { q: 'hello', limit: '' } })
    const snippet = generateCurlSnippet(searchEndpoint, state)
    expect(snippet).toContain('q=hello')
    expect(snippet).not.toContain('limit=')
  })
})

// ---------------------------------------------------------------------------
// Python tests
// ---------------------------------------------------------------------------

describe('generatePythonSnippet', () => {
  it('POST uses httpx.post', () => {
    const snippet = generatePythonSnippet(createUserEndpoint, makeState())
    expect(snippet).toContain('import httpx')
    expect(snippet).toContain('httpx.post(')
  })

  it('includes raise_for_status and print(response.json())', () => {
    const snippet = generatePythonSnippet(createUserEndpoint, makeState())
    expect(snippet).toContain('response.raise_for_status()')
    expect(snippet).toContain('print(response.json())')
  })

  it('uses <YOUR_SESSION_TOKEN> placeholder when auth required and no token', () => {
    const snippet = generatePythonSnippet(createUserEndpoint, makeState())
    expect(snippet).toContain('<YOUR_SESSION_TOKEN>')
  })

  it('uses real auth token when provided', () => {
    const state = makeState({ authToken: 'secret-abc' })
    const snippet = generatePythonSnippet(createUserEndpoint, state)
    expect(snippet).toContain('secret-abc')
    expect(snippet).not.toContain('<YOUR_SESSION_TOKEN>')
  })

  it('GET uses httpx.get', () => {
    const snippet = generatePythonSnippet(healthEndpoint, makeState())
    expect(snippet).toContain('httpx.get(')
  })

  it('body is passed as json= kwarg', () => {
    const state = makeState({ body: '{"name":"Bob"}' })
    const snippet = generatePythonSnippet(createUserEndpoint, state)
    expect(snippet).toContain('json=')
    expect(snippet).toContain('"Bob"')
  })
})

// ---------------------------------------------------------------------------
// JS (fetch) tests
// ---------------------------------------------------------------------------

describe('generateJsSnippet', () => {
  it('uses fetch with correct method', () => {
    const snippet = generateJsSnippet(healthEndpoint, makeState())
    expect(snippet).toContain('await fetch(')
    expect(snippet).toContain('method: "GET"')
  })

  it('includes await response.json()', () => {
    const snippet = generateJsSnippet(healthEndpoint, makeState())
    expect(snippet).toContain('await response.json()')
  })

  it('throws on non-OK responses', () => {
    const snippet = generateJsSnippet(healthEndpoint, makeState())
    expect(snippet).toContain('throw new Error')
    expect(snippet).toContain('response.ok')
  })

  it('auth placeholder when required and no token', () => {
    const snippet = generateJsSnippet(createUserEndpoint, makeState())
    expect(snippet).toContain('Bearer <YOUR_SESSION_TOKEN>')
  })

  it('real token used when provided', () => {
    const state = makeState({ authToken: 'jwt-token-xyz' })
    const snippet = generateJsSnippet(createUserEndpoint, state)
    expect(snippet).toContain('jwt-token-xyz')
    expect(snippet).not.toContain('<YOUR_SESSION_TOKEN>')
  })

  it('body serialized with JSON.stringify', () => {
    const state = makeState({ body: '{"x":1}' })
    const snippet = generateJsSnippet(createUserEndpoint, state)
    expect(snippet).toContain('JSON.stringify(')
  })
})

// ---------------------------------------------------------------------------
// bodyTemplateFor tests
// ---------------------------------------------------------------------------

describe('bodyTemplateFor', () => {
  it('returns empty string for undefined schema', () => {
    expect(bodyTemplateFor(undefined)).toBe('')
  })

  it('returns empty string for schema without properties', () => {
    expect(bodyTemplateFor({ type: 'string' })).toBe('')
  })

  it('generates stubs for string, integer, boolean properties', () => {
    const result = bodyTemplateFor({
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'integer' },
        active: { type: 'boolean' },
      },
    })
    const parsed = JSON.parse(result)
    expect(parsed.name).toBe('string')
    expect(parsed.age).toBe(0)
    expect(parsed.active).toBe(false)
  })

  it('uses example value when present', () => {
    const result = bodyTemplateFor({
      type: 'object',
      properties: {
        status: { type: 'string', example: 'active' },
      },
    })
    const parsed = JSON.parse(result)
    expect(parsed.status).toBe('active')
  })

  it('uses first enum value when present', () => {
    const result = bodyTemplateFor({
      type: 'object',
      properties: {
        role: { type: 'string', enum: ['admin', 'user', 'viewer'] },
      },
    })
    const parsed = JSON.parse(result)
    expect(parsed.role).toBe('admin')
  })

  it('generates uuid stub for format=uuid', () => {
    const result = bodyTemplateFor({
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
      },
    })
    const parsed = JSON.parse(result)
    expect(parsed.id).toBe('00000000-0000-0000-0000-000000000000')
  })

  it('generates array stub with one item', () => {
    const result = bodyTemplateFor({
      type: 'object',
      properties: {
        tags: { type: 'array', items: { type: 'string' } },
      },
    })
    const parsed = JSON.parse(result)
    expect(Array.isArray(parsed.tags)).toBe(true)
    expect(parsed.tags).toHaveLength(1)
    expect(parsed.tags[0]).toBe('string')
  })

  it('generates nested object stub', () => {
    const result = bodyTemplateFor({
      type: 'object',
      properties: {
        address: {
          type: 'object',
          properties: {
            street: { type: 'string' },
            zip: { type: 'string' },
          },
        },
      },
    })
    const parsed = JSON.parse(result)
    expect(typeof parsed.address).toBe('object')
    expect(parsed.address.street).toBe('string')
    expect(parsed.address.zip).toBe('string')
  })
})

// ---------------------------------------------------------------------------
// generateApiSnippet dispatch
// ---------------------------------------------------------------------------

describe('generateApiSnippet dispatch', () => {
  it('routes curl language', () => {
    const snippet = generateApiSnippet(healthEndpoint, makeState(), 'curl')
    expect(snippet).toContain('curl -X GET')
  })

  it('routes python language', () => {
    const snippet = generateApiSnippet(healthEndpoint, makeState(), 'python')
    expect(snippet).toContain('import httpx')
  })

  it('routes js language', () => {
    const snippet = generateApiSnippet(healthEndpoint, makeState(), 'js')
    expect(snippet).toContain('await fetch(')
  })
})
