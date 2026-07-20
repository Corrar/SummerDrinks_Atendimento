// Unit tests do GreenApiTransport — fetch injetado, zero rede real.
// Cobre: URL/chatId corretos, normalização BR do telefone, mapa status→retriable
// (429/5xx retenta; 4xx não; timeout/network retenta), reempacote de exceção e a
// invariante de PII: nenhum TransportError ecoa telefone/token/URL.
import { describe, it, expect, vi } from 'vitest'
import {
  GreenApiTransport,
  TransportError,
  normalizarTelefoneBr,
} from '../src/notif/transport.js'
import { criarTransporte, FakeTransport } from '../src/notif/index.js'

const MSG = { telefone: '(81) 99999-0000', texto: 'olá', idempotencyKey: 'outbox:1:123' }

function transporte(fetchImpl: typeof fetch, timeoutMs?: number): GreenApiTransport {
  return new GreenApiTransport({
    baseUrl: 'https://api.green-api.com',
    idInstance: '1103000001',
    token: 'tok-secreto',
    timeoutMs,
    fetchImpl,
  })
}

const respostaHttp = (status: number): Response =>
  ({ ok: status >= 200 && status < 300, status }) as Response

describe('normalizarTelefoneBr', () => {
  it('BR sem DDI ganha 55; com DDI mantém; curto → null', () => {
    expect(normalizarTelefoneBr('(81) 99999-0000')).toBe('5581999990000')
    expect(normalizarTelefoneBr('81 3333-0000')).toBe('558133330000')
    expect(normalizarTelefoneBr('+55 81 99999-0000')).toBe('5581999990000')
    expect(normalizarTelefoneBr('12345')).toBeNull()
    expect(normalizarTelefoneBr('')).toBeNull()
  })
})

describe('GreenApiTransport — envio', () => {
  it('POST na URL da instância com chatId normalizado', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respostaHttp(200))
    await transporte(fetchMock as unknown as typeof fetch).enviar(MSG)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.green-api.com/waInstance1103000001/sendMessage/tok-secreto')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ chatId: '5581999990000@c.us', message: 'olá' })
  })

  it('telefone inválido → invalid_phone não-retriable, sem tocar a rede', async () => {
    const fetchMock = vi.fn()
    const err = await transporte(fetchMock as unknown as typeof fetch)
      .enviar({ ...MSG, telefone: '99' })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(TransportError)
    expect((err as TransportError).retriable).toBe(false)
    expect((err as TransportError).safeCode).toBe('invalid_phone')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    [429, true, 'http_429'],
    [500, true, 'http_500'],
    [503, true, 'http_503'],
    [400, false, 'http_400'],
    [401, false, 'http_401'],
  ])('HTTP %i → retriable=%s (%s)', async (status, retriable, safeCode) => {
    const fetchMock = vi.fn().mockResolvedValue(respostaHttp(status))
    const err = await transporte(fetchMock as unknown as typeof fetch)
      .enviar(MSG)
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(TransportError)
    expect((err as TransportError).retriable).toBe(retriable)
    expect((err as TransportError).safeCode).toBe(safeCode)
  })

  it('falha de rede (TypeError do fetch) → network retriable', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    const err = await transporte(fetchMock as unknown as typeof fetch)
      .enviar(MSG)
      .catch((e: unknown) => e)
    expect((err as TransportError).retriable).toBe(true)
    expect((err as TransportError).safeCode).toBe('network')
  })

  it('timeout (AbortError) → timeout retriable', async () => {
    const abortErr = new Error('aborted')
    abortErr.name = 'AbortError'
    const fetchMock = vi.fn().mockRejectedValue(abortErr)
    const err = await transporte(fetchMock as unknown as typeof fetch)
      .enviar(MSG)
      .catch((e: unknown) => e)
    expect((err as TransportError).retriable).toBe(true)
    expect((err as TransportError).safeCode).toBe('timeout')
  })

  it('exceção desconhecida → unknown não-retriable', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new RangeError('bug'))
    const err = await transporte(fetchMock as unknown as typeof fetch)
      .enviar(MSG)
      .catch((e: unknown) => e)
    expect((err as TransportError).retriable).toBe(false)
    expect((err as TransportError).safeCode).toBe('unknown')
  })

  it('nenhum erro ecoa telefone, token ou URL (invariante de PII)', async () => {
    for (const boom of [respostaHttp(500), respostaHttp(400)]) {
      const fetchMock = vi.fn().mockResolvedValue(boom)
      const err = (await transporte(fetchMock as unknown as typeof fetch)
        .enviar(MSG)
        .catch((e: unknown) => e)) as Error
      for (const vazamento of ['5581', 'tok-secreto', 'green-api.com', MSG.texto]) {
        expect(err.message).not.toContain(vazamento)
      }
    }
  })
})

describe('criarTransporte', () => {
  it("'green' sem credenciais → erro claro; com credenciais → GreenApiTransport", () => {
    const backup = { ...process.env }
    delete process.env.GREEN_API_ID_INSTANCE
    delete process.env.GREEN_API_TOKEN
    try {
      expect(() => criarTransporte('green')).toThrow(/GREEN_API_ID_INSTANCE/)
      process.env.GREEN_API_ID_INSTANCE = '1103000001'
      process.env.GREEN_API_TOKEN = 'tok'
      expect(criarTransporte('green')).toBeInstanceOf(GreenApiTransport)
      expect(criarTransporte('fake')).toBeInstanceOf(FakeTransport)
    } finally {
      // atribuir undefined gravaria a string 'undefined' — restaurar via delete.
      if (backup.GREEN_API_ID_INSTANCE === undefined) delete process.env.GREEN_API_ID_INSTANCE
      else process.env.GREEN_API_ID_INSTANCE = backup.GREEN_API_ID_INSTANCE
      if (backup.GREEN_API_TOKEN === undefined) delete process.env.GREEN_API_TOKEN
      else process.env.GREEN_API_TOKEN = backup.GREEN_API_TOKEN
    }
  })
})
