// Minimal ambient module declaration for the @novnc/novnc RFB client. The
// package doesn't ship its own types, so we declare just enough surface area
// for the NoVncViewer component. Extend as we use more of the API.

declare module "@novnc/novnc/lib/rfb" {
  export interface RFBOptions {
    credentials?: { password?: string; username?: string; target?: string }
    shared?: boolean
    repeaterID?: string
    wsProtocols?: string[]
  }

  export default class RFB extends EventTarget {
    constructor(target: HTMLElement, urlOrChannel: string, options?: RFBOptions)

    // Runtime-tunable properties
    viewOnly: boolean
    focusOnClick: boolean
    clipViewport: boolean
    dragViewport: boolean
    scaleViewport: boolean
    resizeSession: boolean
    showDotCursor: boolean
    background: string
    qualityLevel: number
    compressionLevel: number

    // Methods we use
    disconnect(): void
    sendCredentials(creds: { password?: string; username?: string; target?: string }): void
    clipboardPasteFrom(text: string): void
    focus(): void
    blur(): void
    machineShutdown(): void
    machineReboot(): void
    machineReset(): void
    sendKey(keysym: number, code: string, down?: boolean): void
    sendCtrlAltDel(): void
  }
}
