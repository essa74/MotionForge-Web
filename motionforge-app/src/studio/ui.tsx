export const ICON = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const

export function ChatIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" {...ICON}><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /><path d="M9 11h.01M12.5 11h.01M16 11h.01" /></svg>
}
