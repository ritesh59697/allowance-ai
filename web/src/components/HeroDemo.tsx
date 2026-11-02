import { useSyncExternalStore } from 'react'
import { LogoMark } from '@/components/Logo'
import { Stamp } from '@/components/Stamp'
import { Avatar, Bar, Collapse, LockScreen, Notification, Phone, Row, Stage, Window, type Act } from '@/vendor/stageshow/kit'
import './hero-demo.css'

// The landing hero's demo: a device pair telling one event. A poisoned
// invoice sits in the agent's inbox; the agent calls pay; the contract's
// checks land row by row and the payment is held; the owner's phone shows
// the notice. After a hold, what the run added leaves in one reverse stagger
// and the checks reset while closed.
//
// Real strings: the invoice subject, the pay call, the three checks, the
// Held stamp, the notification. Everything else is placeholder.

type S = { agent: boolean; card: boolean; check: number; held: boolean; notify: boolean }

const START: S = { agent: false, card: false, check: 0, held: false, notify: false }
const POSTER: S = { agent: true, card: true, check: 3, held: true, notify: true }

const CALL = { amount: '0.1', to: 'mallory.testnet' }

const CHECKS = [
  { label: 'Approved payee', pass: false },
  { label: 'Under the per-payment cap', pass: true },
  { label: 'Inside the 24 h window', pass: true },
]

const OLDER = [
  { title: 132, sub: 96 },
  { title: 104, sub: 120 },
  { title: 148, sub: 84 },
]

// A night-sky lock screen: quiet enough for the graphite page, lit enough to be a phone
const WALL = 'radial-gradient(120% 70% at 30% 0%, #3b4a5f 0%, #1c232d 58%, #121519 100%)'

const script = async (a: Act<S>) => {
  await a.wait(800)
  a.mark('agent')
  a.put({ agent: true })
  await a.wait(1400)
  a.mark('check')
  a.put({ card: true })
  for (let i = 1; i <= CHECKS.length; i++) {
    await a.wait(i === 1 ? 600 : 420)
    a.put({ check: i })
  }
  await a.wait(700)
  a.mark('held')
  a.put({ held: true })
  await a.wait(1000)
  a.mark('notify')
  a.put({ notify: true })
  await a.wait(3000)
  // What the run added leaves as one reverse stagger; the inbox stays
  a.mark('exit')
  a.put({ notify: false })
  await a.wait(80)
  a.put({ card: false })
  await a.wait(80)
  a.put({ agent: false })
  await a.wait(600)
  await a.snap({ check: 0, held: false })
}

const dark = () => window.matchMedia('(prefers-color-scheme: dark)')
const subscribe = (fn: () => void) => {
  const q = dark()
  q.addEventListener('change', fn)
  return () => q.removeEventListener('change', fn)
}

export function HeroDemo() {
  const isDark = useSyncExternalStore(subscribe, () => dark().matches, () => true)
  return (
    <Stage<S>
      width={620}
      height={440}
      compact={{ below: 560, width: 358, height: 600 }}
      theme={isDark ? 'dark' : 'light'}
      initial={START}
      poster={POSTER}
      script={script}
      className="ah"
    >
      {(s, _rect, layout) => (
        <>
          <Window title="Purchasing agent" className="ah-win">
            <div className="ah-body">
              <div className="ah-head">
                <span className="ah-title">Inbox</span>
                <Bar w={44} h={6} tone={1} />
              </div>
              <Row
                className="ah-mail"
                lead={<Avatar size={28} />}
                title="Invoice #2291: new payout account"
                subtitle={<Bar w={112} h={6} tone={2} />}
                meta="now"
              />

              <Collapse open={s.agent}>
                <div className="ah-call">
                  <span className="ah-faint">Agent</span>
                  <code className="ah-code">
                    pay {CALL.amount} NEAR to {CALL.to}
                  </code>
                </div>
              </Collapse>

              <Collapse open={s.card} reveal="drop">
                <section className="ah-card">
                  <div className="ah-card__head">
                    <span className="ah-card__title">Contract</span>
                    <span className="ah-stamp" data-on={s.held || undefined}>
                      <Stamp tone="held">Held for the owner</Stamp>
                    </span>
                  </div>
                  <ul className="ah-checks">
                    {CHECKS.map((c, i) => (
                      <li key={c.label} className="ah-check" data-in={s.check > i || undefined}>
                        <span className="ah-check__label">{c.label}</span>
                        <span className="ah-check__value" data-fail={!c.pass || undefined}>
                          {c.pass ? 'yes' : 'no'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              </Collapse>

              {OLDER.map((r, i) => (
                <Row
                  key={i}
                  className="ah-old"
                  lead={<Avatar size={28} />}
                  title={<Bar w={r.title} h={7} tone={2} />}
                  subtitle={<Bar w={r.sub} h={6} tone={1} />}
                />
              ))}
            </div>
          </Window>

          <Phone width={layout === 'compact' ? 300 : 236} frame="pro" dark wallpaper={WALL} className="ah-phone">
            <LockScreen size="satellite" stack="top">
              <Collapse open={s.notify} reveal="drop">
                <Notification
                  icon={
                    <span className="ah-appicon">
                      <LogoMark className="ah-appicon__mark" />
                    </span>
                  }
                  title="Payment held"
                  body={`${CALL.amount} NEAR to ${CALL.to} isn't an approved payee. Approve or reject with Face ID.`}
                />
              </Collapse>
            </LockScreen>
          </Phone>
        </>
      )}
    </Stage>
  )
}
