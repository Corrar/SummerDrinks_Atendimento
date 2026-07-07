// GATE A — mecanismo de autenticação (JWT), sem dependência de banco.
// Prova: body inválido → 400; refresh inválido → 401; token ausente/expirado → 401
// em rota protegida; token válido PASSA pelo middleware (não retorna 401).
import { describe, it, expect } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { criarApp } from '../src/app.js'

const app = criarApp()
const SECRET = process.env.JWT_SECRET as string

function assinar(payload: object, opts: jwt.SignOptions = {}): string {
  return jwt.sign(payload, SECRET, opts)
}

describe('GATE A — auth', () => {
  it('login com body inválido → 400 VALIDACAO', async () => {
    const r = await request(app).post('/auth/login').send({ tenantSlug: 'summer' })
    expect(r.status).toBe(400)
    expect(r.body.codigo).toBe('VALIDACAO')
  })

  it('refresh com token inválido → 401 (sem tocar o banco)', async () => {
    const r = await request(app).post('/auth/refresh').send({ refresh: 'nao-e-um-jwt' })
    expect(r.status).toBe(401)
    expect(r.body.codigo).toBe('REFRESH_INVALIDO')
  })

  it('rota protegida sem token → 401 SEM_TOKEN', async () => {
    const r = await request(app).get('/orders')
    expect(r.status).toBe(401)
    expect(r.body.codigo).toBe('SEM_TOKEN')
  })

  it('rota protegida com token EXPIRADO → 401 TOKEN_INVALIDO', async () => {
    const expirado = assinar(
      { sub: 'u1', tenant: '00000000-0000-0000-0000-000000000000', papel: 'gestao' },
      { expiresIn: -10 },
    )
    const r = await request(app).get('/orders').set('Authorization', `Bearer ${expirado}`)
    expect(r.status).toBe(401)
    expect(r.body.codigo).toBe('TOKEN_INVALIDO')
  })

  it('token VÁLIDO passa pelo middleware de auth (não retorna 401)', async () => {
    const valido = assinar(
      { sub: 'u1', tenant: '00000000-0000-0000-0000-000000000000', papel: 'gestao' },
      { expiresIn: 900 },
    )
    const r = await request(app).get('/orders').set('Authorization', `Bearer ${valido}`)
    // Sem banco, a query falha (500); o essencial é que a autenticação NÃO barrou.
    expect(r.status).not.toBe(401)
  })
})
