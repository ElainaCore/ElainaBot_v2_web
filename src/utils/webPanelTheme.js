const THEME_VARIABLES = [
  '--bg', '--bg2', '--bg3', '--bg-float',
  '--text', '--text2', '--text3', '--border',
  '--accent', '--accent-hover', '--accent-light', '--accent-soft',
  '--success', '--danger', '--warning', '--info',
  '--radius', '--radius-sm', '--shadow', '--shadow-sm', '--shadow-hover',
]

const subscribers = new Set()

function getSnapshot() {
  const root = document.documentElement
  const style = getComputedStyle(root)
  const variables = {}
  for (const name of THEME_VARIABLES) {
    const value = style.getPropertyValue(name).trim()
    if (value) variables[name] = value
  }
  const colorScheme = String(style.colorScheme || root.style.colorScheme).toLowerCase()
  return {
    variables,
    scheme: colorScheme.includes('dark') ? 'dark' : 'light',
    transitionActive: root.classList.contains('vt-active'),
  }
}

function ensureTransitionStyle(root) {
  const doc = root?.ownerDocument
  if (!doc?.head || doc.getElementById('elaina-panel-theme-transition')) return
  const style = doc.createElement('style')
  style.id = 'elaina-panel-theme-transition'
  style.textContent = `
    html.elaina-theme-transition *,
    html.elaina-theme-transition *::before,
    html.elaina-theme-transition *::after {
      transition-property: none !important;
      transition-duration: 0s !important;
      transition-delay: 0s !important;
    }
  `
  doc.head.appendChild(style)
}

function apply(root, snapshot = getSnapshot(), options = {}) {
  if (!root?.style) throw new TypeError('theme target must expose a style property')
  const {
    variables = THEME_VARIABLES,
    map = {},
    schemeAttributes = [],
    colorScheme = true,
    suppressTransitions = true,
  } = options

  if (suppressTransitions) {
    ensureTransitionStyle(root)
    root.classList.toggle('elaina-theme-transition', snapshot.transitionActive)
  }
  if (colorScheme) root.style.colorScheme = snapshot.scheme
  for (const attribute of schemeAttributes) root.setAttribute(attribute, snapshot.scheme)

  for (const source of variables) {
    const value = snapshot.variables[source]
    if (!value) continue
    root.style.setProperty(source, value)
  }
  for (const [target, sources] of Object.entries(map)) {
    const candidates = Array.isArray(sources) ? sources : [sources]
    const source = candidates.find(name => snapshot.variables[name])
    const value = source ? snapshot.variables[source] : ''
    if (value) root.style.setProperty(target, value)
  }
  return snapshot
}

function subscribe(listener, options = {}) {
  if (typeof listener !== 'function') throw new TypeError('theme listener must be a function')
  subscribers.add(listener)
  if (options.immediate !== false) listener(getSnapshot())
  return () => subscribers.delete(listener)
}

function bind(root, options = {}) {
  const ownerWindow = root?.ownerDocument?.defaultView
  const unsubscribe = subscribe(snapshot => apply(root, snapshot, options))
  const cleanup = () => {
    unsubscribe()
    ownerWindow?.removeEventListener('pagehide', cleanup)
  }
  ownerWindow?.addEventListener('pagehide', cleanup, { once: true })
  return cleanup
}

const api = Object.freeze({
  version: 1,
  variables: Object.freeze([...THEME_VARIABLES]),
  getSnapshot,
  subscribe,
  apply,
  bind,
})

export function installWebPanelThemeApi() {
  Object.defineProperty(window, 'ElainaWebPanelTheme', {
    configurable: true,
    enumerable: false,
    value: api,
  })
}

export function notifyWebPanelThemeChange() {
  const snapshot = getSnapshot()
  for (const listener of [...subscribers]) {
    try { listener(snapshot) } catch (error) {
      console.error('[web-panel-theme] subscriber failed', error)
    }
  }
}
