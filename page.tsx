'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip } from 'recharts'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const CATEGORIAS = ['Comida', 'Tech/Vlog', 'Transporte', 'Viajes', 'Ocio', 'Suscripciones', 'Cuotas'] as const
type Categoria = typeof CATEGORIAS[number] | 'Fintual' | 'Otro'
type Vista = 'diaria' | 'semanal' | 'mensual' | 'anual'

const CAT_COLORS: Record<string, string> = {
  'Comida': '#44ff88', 'Tech/Vlog': '#e8ff47', 'Transporte': '#47c8ff',
  'Viajes': '#ff8844', 'Ocio': '#cc88ff', 'Suscripciones': '#ff4488',
  'Cuotas': '#ffaa00', 'Fintual': '#44ffcc', 'Otro': '#888888',
}

function fmtCLP(n: number) {
  return '$' + Math.round(n).toLocaleString('es-CL')
}

function getDateRange(vista: Vista) {
  const now = new Date()
  const hoy = now.toISOString().split('T')[0]
  if (vista === 'diaria') return { desde: hoy, hasta: hoy }
  if (vista === 'semanal') {
    const d = new Date(now); d.setDate(d.getDate() - 6)
    return { desde: d.toISOString().split('T')[0], hasta: hoy }
  }
  if (vista === 'mensual') {
    return { desde: `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`, hasta: hoy }
  }
  return { desde: `${now.getFullYear()}-01-01`, hasta: hoy }
}

const inp: React.CSSProperties = {
  width: '100%', padding: '10px 12px',
  background: '#111', border: '1px solid #2a2a2a',
  borderRadius: '8px', color: '#e8e8e8', fontSize: '13px',
}

export default function Home() {
  const [vista, setVista] = useState<Vista>('mensual')
  const [txns, setTxns] = useState<any[]>([])
  const [presupuestos, setPresupuestos] = useState<any[]>([])
  const [fintual, setFintual] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'dashboard' | 'agregar' | 'historial'>('dashboard')
  const [form, setForm] = useState({ descripcion: '', monto: '', categoria: 'Comida' as Categoria, fecha: new Date().toISOString().split('T')[0] })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const cargar = useCallback(async () => {
    setLoading(true)
    const { desde, hasta } = getDateRange(vista)
    const [{ data: t }, { data: p }, { data: f }] = await Promise.all([
      supabase.from('transacciones').select('*').gte('fecha', desde).lte('fecha', hasta).order('fecha', { ascending: false }),
      supabase.from('presupuestos').select('*'),
      supabase.from('fintual').select('*').single(),
    ])
    setTxns(t || [])
    setPresupuestos(p || [])
    setFintual(f)
    setLoading(false)
  }, [vista])

  useEffect(() => { cargar() }, [cargar])

  const totalGastado = txns.filter(t => t.categoria !== 'Fintual').reduce((a: number, t: any) => a + t.monto, 0)
  const totalPresupuesto = presupuestos.reduce((a: number, p: any) => a + p.monto_mensual, 0)
  const aporteFintual = txns.filter(t => t.categoria === 'Fintual').reduce((a: number, t: any) => a + t.monto, 0)
  const metaFintual = fintual?.meta_aporte_mensual || 450000
  const pctTotal = totalPresupuesto > 0 ? Math.round(totalGastado / totalPresupuesto * 100) : 0
  const pctFintual = Math.round(aporteFintual / metaFintual * 100)

  const gastoPorCat = CATEGORIAS.map(cat => {
    const gastado = txns.filter((t: any) => t.categoria === cat).reduce((a: number, t: any) => a + t.monto, 0)
    const presup = presupuestos.find((p: any) => p.categoria === cat)?.monto_mensual || 0
    const pct = presup > 0 ? Math.min(100, Math.round(gastado / presup * 100)) : 0
    return { cat, gastado, presup, pct }
  })

  async function agregarGasto() {
    if (!form.descripcion || !form.monto) return
    setSaving(true)
    await supabase.from('transacciones').insert({
      descripcion: form.descripcion, monto: parseInt(form.monto),
      categoria: form.categoria, fecha: form.fecha, origen: 'manual',
    })
    setSaved(true)
    setForm(f => ({ ...f, descripcion: '', monto: '' }))
    setTimeout(() => setSaved(false), 2000)
    cargar()
    setSaving(false)
  }

  const tabStyle = (t: string): React.CSSProperties => ({
    padding: '10px 16px', background: 'none', border: 'none',
    borderBottom: tab === t ? '2px solid #e8ff47' : '2px solid transparent',
    color: tab === t ? '#e8e8e8' : '#525252',
    cursor: 'pointer', fontSize: '13px',
    fontWeight: tab === t ? 500 : 400,
  })

  const vistaStyle = (v: string): React.CSSProperties => ({
    padding: '6px 14px', borderRadius: '6px', border: '1px solid',
    borderColor: vista === v ? '#e8ff47' : '#1f1f1f',
    background: vista === v ? '#e8ff47' : 'transparent',
    color: vista === v ? '#0a0a0a' : '#525252',
    cursor: 'pointer', fontSize: '12px',
    fontWeight: vista === v ? 600 : 400,
  })

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a' }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid #1f1f1f', padding: '20px 24px 0', position: 'sticky', top: 0, background: '#0a0a0a', zIndex: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
          <div>
            <div style={{ fontSize: '11px', color: '#525252', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}>Vicente Bishara</div>
            <div style={{ fontSize: '22px', fontWeight: 500, color: '#e8e8e8' }}>Finanzas</div>
          </div>
          <button onClick={cargar} style={{ padding: '8px 14px', background: '#111', border: '1px solid #2a2a2a', borderRadius: '8px', color: '#a0a0a0', cursor: 'pointer', fontSize: '12px' }}>
            ↻ actualizar
          </button>
        </div>
        <div style={{ display: 'flex' }}>
          {(['dashboard', 'agregar', 'historial'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={tabStyle(t)}>{t}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>

        {/* DASHBOARD */}
        {tab === 'dashboard' && (
          <div className="fade-up">
            <div style={{ display: 'flex', gap: '6px', marginBottom: '24px' }}>
              {(['diaria', 'semanal', 'mensual', 'anual'] as Vista[]).map(v => (
                <button key={v} onClick={() => setVista(v)} style={vistaStyle(v)}>{v}</button>
              ))}
            </div>

            {loading ? (
              <div style={{ color: '#525252', textAlign: 'center', padding: '60px 0' }}>cargando...</div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px', marginBottom: '24px' }}>
                  {[
                    { label: 'gastado', value: fmtCLP(totalGastado), sub: `${pctTotal}% del presupuesto`, color: pctTotal > 100 ? '#ff4444' : pctTotal > 80 ? '#ffaa00' : '#e8e8e8' },
                    { label: 'disponible', value: fmtCLP(Math.max(0, totalPresupuesto - totalGastado)), sub: 'restante', color: totalGastado > totalPresupuesto ? '#ff4444' : '#44ff88' },
                    { label: 'fintual', value: fmtCLP(fintual?.saldo_actual || 0), sub: `aporte ${fmtCLP(aporteFintual)}`, color: '#e8ff47' },
                  ].map(m => (
                    <div key={m.label} style={{ background: '#111', border: '1px solid #1f1f1f', borderRadius: '10px', padding: '14px 16px' }}>
                      <div style={{ fontSize: '11px', color: '#525252', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>{m.label}</div>
                      <div style={{ fontSize: '18px', fontWeight: 500, color: m.color, marginBottom: '4px' }}>{m.value}</div>
                      <div style={{ fontSize: '11px', color: '#525252' }}>{m.sub}</div>
                    </div>
                  ))}
                </div>

                {gastoPorCat.filter(g => g.pct >= 100).map(g => (
                  <div key={g.cat} style={{ padding: '10px 14px', background: 'rgba(255,68,68,0.08)', border: '1px solid rgba(255,68,68,0.2)', borderRadius: '8px', marginBottom: '8px', fontSize: '12px', color: '#ff4444' }}>
                    Pasaste el presupuesto de <strong>{g.cat}</strong> en {fmtCLP(g.gastado - g.presup)}
                  </div>
                ))}
                {gastoPorCat.filter(g => g.pct >= 80 && g.pct < 100).map(g => (
                  <div key={g.cat} style={{ padding: '10px 14px', background: 'rgba(255,170,0,0.08)', border: '1px solid rgba(255,170,0,0.2)', borderRadius: '8px', marginBottom: '8px', fontSize: '12px', color: '#ffaa00' }}>
                    <strong>{g.cat}</strong> al {g.pct}% del presupuesto
                  </div>
                ))}

                <div style={{ marginBottom: '24px' }}>
                  <div style={{ fontSize: '11px', color: '#525252', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '12px' }}>por categoría</div>
                  {gastoPorCat.map(g => (
                    <div key={g.cat} style={{ marginBottom: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span style={{ color: '#e8e8e8', fontSize: '13px' }}>{g.cat}</span>
                        <span style={{ color: '#a0a0a0', fontSize: '12px' }}>{fmtCLP(g.gastado)} <span style={{ color: '#525252' }}>/ {fmtCLP(g.presup)}</span></span>
                      </div>
                      <div style={{ height: '4px', background: '#1f1f1f', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${g.pct}%`, background: g.pct >= 100 ? '#ff4444' : g.pct >= 80 ? '#ffaa00' : CAT_COLORS[g.cat], borderRadius: '2px', transition: 'width 0.6s ease' }} />
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ marginBottom: '24px' }}>
                  <div style={{ fontSize: '11px', color: '#525252', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '12px' }}>gastado vs presupuesto</div>
                  <div style={{ background: '#111', border: '1px solid #1f1f1f', borderRadius: '12px', padding: '16px' }}>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={gastoPorCat.map(g => ({ name: g.cat.split('/')[0], gastado: g.gastado, presup: g.presup }))} barGap={2}>
                        <XAxis dataKey="name" tick={{ fill: '#525252', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis hide />
                        <Tooltip contentStyle={{ background: '#161616', border: '1px solid #2a2a2a', borderRadius: '8px', fontSize: '12px' }} formatter={(v: number) => fmtCLP(v)} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                        <Bar dataKey="presup" fill="#1f1f1f" radius={[3,3,0,0]} />
                        <Bar dataKey="gastado" radius={[3,3,0,0]}>
                          {gastoPorCat.map((g, i) => <Cell key={i} fill={CAT_COLORS[g.cat] || '#e8ff47'} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div style={{ background: '#111', border: '1px solid #1f1f1f', borderRadius: '12px', padding: '20px' }}>
                  <div style={{ fontSize: '11px', color: '#525252', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '16px' }}>fintual</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ color: '#a0a0a0', fontSize: '12px' }}>aporte este mes</span>
                    <span style={{ color: '#e8e8e8', fontSize: '12px' }}>{fmtCLP(aporteFintual)} / {fmtCLP(metaFintual)}</span>
                  </div>
                  <div style={{ height: '6px', background: '#1f1f1f', borderRadius: '3px', overflow: 'hidden', marginBottom: '16px' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, pctFintual)}%`, background: '#e8ff47', borderRadius: '3px', transition: 'width 0.6s ease' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '11px', color: '#525252', marginBottom: '2px' }}>saldo total</div>
                      <div style={{ fontSize: '18px', fontWeight: 500, color: '#e8ff47' }}>{fmtCLP(fintual?.saldo_actual || 0)}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '11px', color: '#525252', marginBottom: '2px' }}>meta mensual</div>
                      <div style={{ fontSize: '18px', fontWeight: 500, color: '#e8e8e8' }}>{fmtCLP(metaFintual)}</div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* AGREGAR */}
        {tab === 'agregar' && (
          <div className="fade-up">
            <div style={{ fontSize: '11px', color: '#525252', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '20px' }}>nuevo gasto</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '420px' }}>
              {[
                { label: 'descripción', content: <input value={form.descripcion} onChange={e => setForm(f => ({...f, descripcion: e.target.value}))} placeholder="ej: Jumbo, Uber, Netflix..." style={inp} /> },
              ].map(f => (
                <div key={f.label}>
                  <div style={{ fontSize: '11px', color: '#525252', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>{f.label}</div>
                  {f.content}
                </div>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#525252', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>monto ($)</div>
                  <input type="number" value={form.monto} onChange={e => setForm(f => ({...f, monto: e.target.value}))} placeholder="15000" style={inp} />
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#525252', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>fecha</div>
                  <input type="date" value={form.fecha} onChange={e => setForm(f => ({...f, fecha: e.target.value}))} style={inp} />
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#525252', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>categoría</div>
                <select value={form.categoria} onChange={e => setForm(f => ({...f, categoria: e.target.value as Categoria}))} style={inp}>
                  {[...CATEGORIAS, 'Fintual', 'Otro'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <button onClick={agregarGasto} disabled={saving || !form.descripcion || !form.monto}
                style={{ padding: '12px', background: saved ? '#44ff88' : '#e8ff47', border: 'none', borderRadius: '8px', color: '#0a0a0a', fontWeight: 600, cursor: 'pointer', fontSize: '14px', opacity: saving || !form.descripcion || !form.monto ? 0.5 : 1, transition: 'all 0.2s' }}>
                {saved ? '✓ guardado' : saving ? 'guardando...' : 'agregar gasto'}
              </button>
            </div>
            <div style={{ marginTop: '36px', padding: '20px', background: '#111', border: '1px solid #1f1f1f', borderRadius: '12px' }}>
              <div style={{ fontSize: '11px', color: '#525252', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '12px' }}>sincronizar con gmail</div>
              <p style={{ color: '#a0a0a0', fontSize: '13px', lineHeight: 1.7, marginBottom: '12px' }}>Para importar gastos automáticamente, ve a Claude.ai y escribí:</p>
              <div style={{ background: '#0a0a0a', border: '1px solid #2a2a2a', borderRadius: '8px', padding: '12px', fontFamily: 'monospace', fontSize: '12px', color: '#e8ff47' }}>
                "Lee mis últimos correos del banco/tarjeta y carga los gastos en mi app de finanzas"
              </div>
            </div>
          </div>
        )}

        {/* HISTORIAL */}
        {tab === 'historial' && (
          <div className="fade-up">
            <div style={{ fontSize: '11px', color: '#525252', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '20px' }}>historial</div>
            {loading ? (
              <div style={{ color: '#525252', textAlign: 'center', padding: '60px 0' }}>cargando...</div>
            ) : txns.length === 0 ? (
              <div style={{ color: '#525252', textAlign: 'center', padding: '60px 0' }}>sin transacciones en este período</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {txns.map((t: any, i: number) => (
                  <div key={t.id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: '#111', borderRadius: '8px', borderLeft: `3px solid ${CAT_COLORS[t.categoria] || '#333'}` }}>
                    <div>
                      <div style={{ color: '#e8e8e8', fontSize: '13px', fontWeight: 500 }}>{t.descripcion}</div>
                      <div style={{ color: '#525252', fontSize: '11px', marginTop: '2px' }}>{t.fecha} · {t.categoria}</div>
                    </div>
                    <div style={{ color: '#e8e8e8', fontWeight: 500 }}>{fmtCLP(t.monto)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
