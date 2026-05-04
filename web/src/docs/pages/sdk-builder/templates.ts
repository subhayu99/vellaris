import type { SdkBuilderState, SdkRecipe } from './state'

export interface RecipeInfo {
  recipe: SdkRecipe
  label: string
  description: string
}

export const RECIPES: readonly RecipeInfo[] = [
  { recipe: 'upload', label: 'Upload a file', description: 'Encrypt and upload to your account.' },
  {
    recipe: 'upload-and-share',
    label: 'Upload + share',
    description: 'Upload and grant a recipient access in one step.',
  },
  {
    recipe: 'download',
    label: 'Download a document',
    description: 'Pull a document by ID and decrypt it locally.',
  },
  {
    recipe: 'list',
    label: 'List documents',
    description: 'List documents you own + ones shared with you.',
  },
  {
    recipe: 'share',
    label: 'Share with another user',
    description: 'Grant an existing document to a recipient.',
  },
  {
    recipe: 'revoke',
    label: "Revoke a recipient's access",
    description: 'Remove a previously-granted recipient.',
  },
]

function asyncBoilerplate(serverUrl: string): string {
  return `import asyncio
from pathlib import Path
from vellaris.client import AsyncClient


async def main() -> None:
    async with AsyncClient(server_url="${serverUrl}") as client:`
}

function syncBoilerplate(serverUrl: string): string {
  return `from pathlib import Path
from vellaris.client import Client


with Client(server_url="${serverUrl}") as client:`
}

export function generateSdkSnippet(s: SdkBuilderState): string {
  const isAsync = s.variant === 'async'
  const indent = isAsync ? '        ' : '    '
  const await_ = isAsync ? 'await ' : ''
  const print_ = (msg: string) => `print(${msg})`

  let body = ''
  switch (s.recipe) {
    case 'upload':
      body = [
        `${indent}# Sign in (passphrase prompted at runtime — pass it explicitly only for one-shot scripts).`,
        `${indent}${await_}client.login(username="${s.username}", passphrase="...")`,
        `${indent}# Encrypt + upload`,
        `${indent}result = ${await_}client.push(Path("${s.filePath || 'document.pdf'}"))`,
        `${indent}${print_(`f"Uploaded: {result['document_id']}"`)}`,
      ].join('\n')
      break
    case 'upload-and-share':
      body = [
        `${indent}${await_}client.login(username="${s.username}", passphrase="...")`,
        `${indent}# Upload AND share with one or more recipients in a single call.`,
        `${indent}result = ${await_}client.push(`,
        `${indent}    Path("${s.filePath || 'document.pdf'}"),`,
        `${indent}    share_with=["${s.recipient || 'bob'}"],`,
        `${indent})`,
        `${indent}${print_(`f"Uploaded {result['document_id']} and shared with ${s.recipient || 'bob'}"`)}`,
      ].join('\n')
      break
    case 'download':
      body = [
        `${indent}from uuid import UUID`,
        ``,
        `${indent}${await_}client.login(username="${s.username}", passphrase="...")`,
        `${indent}# Pull + decrypt to a local file.`,
        `${indent}doc = ${await_}client.pull(UUID("${s.documentId || '<document-uuid>'}"))`,
        `${indent}Path(doc.filename).write_bytes(doc.plaintext)`,
        `${indent}${print_(`f"Downloaded {doc.filename} ({len(doc.plaintext)} bytes)"`)}`,
      ].join('\n')
      break
    case 'list':
      body = [
        `${indent}${await_}client.login(username="${s.username}", passphrase="...")`,
        `${indent}# scope can be "all", "mine", or "shared".`,
        `${indent}docs = ${await_}client.list_docs(scope="all")`,
        `${indent}for d in docs:`,
        `${indent}    ${print_(`f"{d['document_id']}  {d['filename']}"`)}`,
      ].join('\n')
      break
    case 'share':
      body = [
        `${indent}from uuid import UUID`,
        ``,
        `${indent}${await_}client.login(username="${s.username}", passphrase="...")`,
        `${indent}${await_}client.share_document(UUID("${s.documentId || '<document-uuid>'}"), "${s.recipient || 'bob'}")`,
        `${indent}${print_(`f"Granted ${s.recipient || 'bob'} access to ${s.documentId || '<document-uuid>'}"`)}`,
      ].join('\n')
      break
    case 'revoke':
      body = [
        `${indent}from uuid import UUID`,
        ``,
        `${indent}${await_}client.login(username="${s.username}", passphrase="...")`,
        `${indent}${await_}client.revoke_document(UUID("${s.documentId || '<document-uuid>'}"), "${s.recipient || 'bob'}")`,
        `${indent}${print_(`f"Revoked ${s.recipient || 'bob'}"`)}`,
      ].join('\n')
      break
  }

  if (isAsync) {
    return [asyncBoilerplate(s.serverUrl), body, '', '', 'asyncio.run(main())'].join('\n')
  }
  return [syncBoilerplate(s.serverUrl), body].join('\n')
}
