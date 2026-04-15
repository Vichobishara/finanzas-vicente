'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase, Transaccion, Presupuesto, Fintual, Categoria } from '@/lib/supabase'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip } from 'recharts'

const CATEGORIAS: Categoria[] = ['Comida', 'Tech/Vlog', 'Transporte', 'Viajes', 'Ocio', 'Suscripciones', 'Cuotas']

const CAT_COLORS: Record<string, string> = {
  'Comida': '#44ff88',
  'Tech/Vlog': '#e8ff47',
  'Transporte': '#47c8ff',
  'Viajes': '#ff8844',
  'Ocio': '#cc88ff',
  'Suscripciones': '#ff4488',
  'Cuotas': '#ffaa00',
  'Fintual': '#44ffcc',
  'Otro': '#888888',
}

type Vista = 'diaria' | 'semanal' | 'mensual' | 'anual'

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

export default function Home() {
  const [vista, setVista] = useState<Vista>('mensual')
  const [txns, setTxns] = useState<Transaccion[]>([])
  const [presupuestos, setPresupuestos] = useState<Presupuesto[]>([])
  const [fintual, setFintual] = useState<Fintual | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'dashboard' | 'agregar' | 'historial'>('dashboard')

  // Form agregar
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

  const totalGastado = txns.filter(t => t.categoria !== 'Fintual').reduce((a, t) => a + t.monto, 0)
  const totalPresupuesto = presupuestos.reduce((a, p) => a + p.monto_mensual, 0)

  const gastoPorCat = CATEGORIAS.map(cat => {
    const gastado = txns.filter(t => t.categoria === cat).reduce((a, t) => a + t.monto, 0)
    const presup = presupuestos.find(p => p.categoria === cat)?.monto_mensual || 0
    const pct = presup > 0 ? Math.min(100, Math.round(gastado / presup * 100)) : 0
    return { cat, gastado, presup, pct }
  })

  const aporteFintual = txns.filter(t => t.categoria === 'Fintual').reduce((a, t) => a + t.monto, 0)
  const metaFintual = fintual?.meta_aporte_mensual || 450000

  async function agregarGasto() {
    if (!form.descripcion || !form.monto) return
    setSaving(true)
    const { error } = await supabase.from('transacciones').insert({
      descripcion: form.descripcion,
      monto: parseInt(form.monto),
      categoria: form.categoria,
      fecha: form.fecha,
      origen: 'manual',
    })
    if (!error) {
      setSaved(true)
      setForm(f => ({ ...f, descripcion: '', monto: '' }))
      setTimeout(() => setSaved(false), 2000)
      cargar()
    }
    setSaving(false)
  }

  const pctTotal = totalPresupuesto > 0 ? Math.round(totalGastado / totalPresupuesto * 100) : 0
  const pctFintual = Math.round(aporteFintual / metaFintual * 100)

  const chartData = gastoPorCat.map(g => ({ name: g.cat.split('/')[0], gastado: g.gastado, presup: g.presup }))

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '0' }}>

      {/* Header */}
      <div style={{ borderBottom: '1px solid var(--border)', padding: '20px 24px 0', position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}>Vicente Bishara</div>
            <div style={{ fontSize: '22px', fontWeight: '500', color: 'var(--text)' }}>Finanzas</div>
          </div>
          <button
            onClick={cargar}
            style={{ padding: '8px 14px', background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: '8px', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '12px' }}
          >
            ↻ actualizar
          </button>
        </div>

        {/* Tabs principales */}
        <div style={{ display: 'flex', gap: '0' }}>
          {(['dashboard', 'agregar', 'historial'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '10px 16px',
                background: 'none',
                border: 'none',
                borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
                color: tab === t ? 'var(--text)' : 'var(--muted)',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: tab === t ? '500' : '400',
                textTransform: 'capitalize',
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>

        {/* DASHBOARD */}
        {tab === 'dashboard' && (
          <div className="fade-up">
            {/* Selector de vista */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '24px' }}>
              {(['diaria', 'semanal', 'mensual', 'anual'] as Vista[]).map(v => (
                <button
                  key={v}
                  onClick={() => setVista(v)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    border: '1px solid',
                    borderColor: vista === v ? 'var(--accent)' : 'var(--border)',
                    background: vista === v ? 'var(--accent)' : 'transparent',
                    color: vista === v ? 'var(--bg)' : 'var(--muted)',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: vista === v ? '600' : '400',
                    textTransform: 'capitalize',
                  }}
                >
                  {v}
                </button>
              ))}
            </div>

            {loading ? (
              <div style={{ color: 'var(--muted)', textAlign: 'center', padding: '60px 0' }}>cargando...</div>
            ) : (
              <>
                {/* Métricas top */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
                  <MetricCard label="gastado" value={fmtCLP(totalGastado)} sub={`${pctTotal}% del presupuesto`} color={pctTotal > 100 ? 'var(--danger)' : pctTotal > 80 ? 'var(--warning)' : 'var(--text)'} />
                  <MetricCard label="disponible" value={fmtCLP(Math.max(0, totalPresupuesto - totalGastado))} sub="restante este mes" color={totalGastado > totalPresupuesto ? 'var(--danger)' : 'var(--success)'} />
                  <MetricCard label="fintual" value={fmtCLP(fintual?.saldo_actual || 0)} sub={`aporte: ${fmtCLP(aporteFintual)}`} color="var(--accent)" />
                </div>

                {/* Alerta si se pasa */}
                {gastoPorCat.filter(g => g.pct >= 100).map(g => (
                  <div key={g.cat} style={{ padding: '10px 14px', background: 'rgba(255,68,68,0.08)', border: '1px solid rgba(255,68,68,0.2)', borderRadius: '8px', marginBottom: '8px', fontSize: '12px', color: 'var(--danger)' }}>
                    Pasaste el presupuesto de <strong>{g.cat}</strong> en {fmtCLP(g.gastado - g.presup)}
                  </div>
                ))}
                {gastoPorCat.filter(g => g.pct >= 80 && g.pct < 100).map(g => (
                  <div key={g.cat} style={{ padding: '10px 14px', background: 'rgba(255,170,0,0.08)', border: '1px solid rgba(255,170,0,0.2)', borderRadius: '8px', marginBottom: '8px', fontSize: '12px', color: 'var(--warning)' }}>
                    <strong>{g.cat}</strong> al {g.pct}% del presupuesto
                  </div>
                ))}

                {/* Barras por categoría */}
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '12px' }}>por categoría</div>
                  {gastoPorCat.map(g => (
                    <div key={g.cat} style={{ marginBottom: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span style={{ color: 'var(--text)', fontSize: '13px' }}>{g.cat}</span>
                        <span style={{ color: 'var(--text-dim)', fontSize: '12px', fontVariantNumeric: 'tabular-nums' }}>
                          {fmtCLP(g.gastado)} <span style={{ color: 'var(--muted)' }}>/ {fmtCLP(g.presup)}</span>
                        </span>
                      </div>
                      <div style={{ height: '4px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%',
                          width: `${g.pct}%`,
                          background: g.pct >= 100 ? 'var(--danger)' : g.pct >= 80 ? 'var(--warning)' : CAT_COLORS[g.cat] || 'var(--accent)',
                          borderRadius: '2px',
                          transition: 'width 0.6s ease',
                        }} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Gráfico */}
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '12px' }}>gastado vs presupuesto</div>
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={chartData} barGap={2}>
                        <XAxis dataKey="name" tick={{ fill: '#525252', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis hide />
                        <Tooltip
                          contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: '8px', fontSize: '12px' }}
                          labelStyle={{ color: 'var(--text)' }}
                          formatter={(v: number) => fmtCLP(v)}
                          cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                        />
                        <Bar dataKey="presup" fill="#1f1f1f" radius={[3,3,0,0]} />
                        <Bar dataKey="gastado" radius={[3,3,0,0]}>
                          {chartData.map((entry, i) => (
                            <Cell key={i} fill={CAT_COLORS[CATEGORIAS[i]] || '#e8ff47'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Fintual */}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '16px' }}>fintual</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <span style={{ color: 'var(--text-dim)', fontSize: '12px' }}>aporte este mes</span>
                    <span style={{ color: 'var(--text)', fontSize: '12px', fontVariantNumeric: 'tabular-nums' }}>{fmtCLP(aporteFintual)} / {fmtCLP(metaFintual)}</span>
                  </div>
                  <div style={{ height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden', marginBottom: '16px' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, pctFintual)}%`, background: 'var(--accent)', borderRadius: '3px', transition: 'width 0.6s ease' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '2px' }}>saldo total</div>
                      <div style={{ fontSize: '18px', fontWeight: '500', color: 'var(--accent)' }}>{fmtCLP(fintual?.saldo_actual || 0)}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '2px' }}>meta mensual</div>
                      <div style={{ fontSize: '18px', fontWeight: '500', color: 'var(--text)' }}>{fmtCLP(metaFintual)}</div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* AGREGAR GASTO */}
        {tab === 'agregar' && (
          <div className="fade-up">
            <div style={{ fontSize: '11px', color: 'var(--muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '20px' }}>nuevo gasto</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '420px' }}>
              <FormField label="descripción">
                <input
                  value={form.descripcion}
                  onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                  placeholder="ej: Jumbo, Uber, Netflix..."
                  style={inputStyle}
                />
              </FormField>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <FormField label="monto ($)">
                  <input
                    type="number"
                    value={form.monto}
                    onChange={e => setForm(f => ({ ...f, monto: e.target.value }))}
                    placeholder="15000"
                    style={inputStyle}
                  />
                </FormField>
                <FormField label="fecha">
                  <input
                    type="date"
                    value={form.fecha}
                    onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
                    style={inputStyle}
                  />
                </FormField>
              </div>

              <FormField label="categoría">
                <select
                  value={form.categoria}
                  onChange={e => setForm(f => ({ ...f, categoria: e.target.value as Categoria }))}
                  style={inputStyle}
                >
                  {[...CATEGORIAS, 'Fintual' as Categoria, 'Otro' as Categoria].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </FormField>

              <button
                onClick={agregarGasto}
                disabled={saving || !form.descripcion || !form.monto}
                style={{
                  padding: '12px',
                  background: saved ? 'var(--success)' : 'var(--accent)',
                  border: 'none',
                  borderRadius: '8px',
                  color: 'var(--bg)',
                  fontWeight: '600',
                  cursor: 'pointer',
                  fontSize: '14px',
                  marginTop: '4px',
                  opacity: saving || !form.descripcion || !form.monto ? 0.5 : 1,
                  transition: 'all 0.2s',
                }}
              >
                {saved ? '✓ guardado' : saving ? 'guardando...' : 'agregar gasto'}
              </button>
            </div>

            {/* Instrucciones sincronización con Claude */}
            <div style={{ marginTop: '36px', padding: '20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px' }}>
              <div style={{ fontSize: '11px', color: 'var(--muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '12px' }}>sincronizar con gmail</div>
              <p style={{ color: 'var(--text-dim)', fontSize: '13px', lineHeight: '1.7', marginBottom: '12px' }}>
                Para importar gastos automáticamente desde tus correos del banco o tarjeta, ve a Claude.ai y escribe:
              </p>
              <div style={{ background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: '8px', padding: '12px', fontFamily: 'var(--font-geist-mono)', fontSize: '12px', color: 'var(--accent)' }}>
                "Lee mis últimos correos del banco/tarjeta y carga los gastos en mi app de finanzas"
              </div>
            </div>
          </div>
        )}

        {/* HISTORIAL */}
        {tab === 'historial' && (
          <div className="fade-up">
            <div style={{ fontSize: '11px', color: 'var(--muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '20px' }}>
              historial — últimas transacciones
            </div>

            {loading ? (
              <div style={{ color: 'var(--muted)', textAlign: 'center', padding: '60px 0' }}>cargando...</div>
            ) : txns.length === 0 ? (
              <div style={{ color: 'var(--muted)', textAlign: 'center', padding: '60px 0' }}>sin transacciones en este período</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {txns.map((t, i) => (
                  <div key={t.id || i} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 14px',
                    background: 'var(--surface)',
                    borderRadius: '8px',
                    borderLeft: `3px solid ${CAT_COLORS[t.categoria] || '#333'}`,
                  }}>
                    <div>
                      <div style={{ color: 'var(--text)', fontSize: '13px', fontWeight: '500' }}>{t.descripcion}</div>
                      <div style={{ color: 'var(--muted)', fontSize: '11px', marginTop: '2px' }}>
                        {t.fecha} · {t.categoria}
                        {t.origen === 'gmail' && <span style={{ marginLeft: '6px', color: 'var(--accent)', fontSize: '10px' }}>Gmail</span>}
                      </div>
                    </div>
                    <div style={{ color: 'var(--text)', fontWeight: '500', fontVariantNumeric: 'tabular-nums' }}>
                      {fmtCLP(t.monto)}
                    </div>
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

function MetricCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px 16px' }}>
      <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>{label}</div>
      <div style={{ fontSize: '18px', fontWeight: '500', color, marginBottom: '4px', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{sub}</div>
    </div>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>{label}</div>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  background: 'var(--surface)',
  border: '1px solid var(--border2)',
  borderRadius: '8px',
  color: 'var(--text)',
  fontSize: '13px',
}
