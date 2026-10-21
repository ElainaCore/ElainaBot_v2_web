export async function copyText(value) {
  const text = String(value ?? '')
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* HTTP panels and denied clipboard access use the selection fallback. */
  }

  const active = document.activeElement
  const input = document.createElement('textarea')
  input.value = text
  input.setAttribute('readonly', '')
  input.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0'
  document.body.appendChild(input)
  input.select()
  let copied = false
  try {
    copied = document.execCommand('copy')
  } catch {
    /* Report failure to the caller. */
  }
  input.remove()
  active?.focus({ preventScroll: true })
  return copied
}
