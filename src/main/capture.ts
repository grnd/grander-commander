/**
 * True while the settings window records a key. A menu click must not reach the
 * main window during that time, which is the half of capture mode that is not
 * about accelerators.
 */
let capturing = false;

export function setCapturing(value: boolean): void { capturing = value; }
export function menuCommandsSuppressed(): boolean { return capturing; }
